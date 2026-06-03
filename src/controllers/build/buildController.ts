// src/controllers/build/buildController.ts
// Handles build API requests: create build, get build status, SSE stream.

import type { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import { Build } from "../../models/build.model.js";
import { buildMainQueue } from "../../queues/buildQueue.js";
import { createRedisSubscriber } from "../../config/redis.js";
import { isImageFile, isDocFile } from "../../lib/buildUpload.js";
import { bucket } from "../../lib/gcs.js";
import * as archiver from "archiver";

// ── Helpers ───────────────────────────────────────────────────

/**
 * Upload a local file to GCS and return its public URL.
 */
async function uploadFileToGCS(
    localPath: string,
    gcsPath: string
): Promise<string> {
    await bucket.upload(localPath, { destination: gcsPath });
    // Removed makePublic() because bucket has Uniform Bucket-Level Access enabled
    return `https://storage.googleapis.com/${bucket.name}/${gcsPath}`;
}

/**
 * Clean up uploaded files from disk after they've been stored in GCS.
 */
function cleanupLocalFiles(paths: string[]): void {
    for (const p of paths) {
        fs.unlink(p, (err) => {
            if (err) console.error(`[Build] Failed to delete temp file ${p}:`, err.message);
        });
    }
}

// ── POST /api/v1/build ────────────────────────────────────────
// Creates a new build, uploads files to GCS, enqueues the main build job.
// Returns immediately with { buildId, streamUrl, status: "queued" }.

export async function handleCreateBuild(req: Request, res: Response) {
    try {
        const { prompt, stack } = req.body;

        if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
            return res.status(400).json({
                status: 400,
                message: "A non-empty 'prompt' is required.",
            });
        }

        const buildId = crypto.randomUUID();

        // multer.fields() returns { images?: File[], docs?: File[] }
        const uploadedFiles = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        const imageFiles = uploadedFiles?.["images"] || [];
        const docFiles = uploadedFiles?.["docs"] || [];
        const allFiles = [...imageFiles, ...docFiles];

        // Upload to GCS in parallel
        const imageUploadPromises = imageFiles.map((f) =>
            uploadFileToGCS(f.path, `builds/${buildId}/input/images/${f.filename}`)
        );
        const docUploadPromises = docFiles.map((f) =>
            uploadFileToGCS(f.path, `builds/${buildId}/input/docs/${f.filename}`)
        );

        const [imageUrls, docUrls] = await Promise.all([
            Promise.all(imageUploadPromises),
            Promise.all(docUploadPromises),
        ]);

        // Parse stack if it's a JSON string
        let parsedStack = {};
        if (stack) {
            try {
                parsedStack = typeof stack === "string" ? JSON.parse(stack) : stack;
            } catch {
                // Ignore invalid stack JSON — use empty default
            }
        }

        // Create build record in MongoDB
        const build = new Build({
            buildId,
            userId: req.user?._id,
            status: "queued",
            progress: 0,
            input: {
                prompt: prompt.trim(),
                imageUrls,
                docUrls,
                stack: parsedStack,
            },
        });

        await build.save();

        // Enqueue the main build job
        await buildMainQueue.add(
            "main-build",
            {
                buildId,
                userId: req.user?._id?.toString(),
            },
            {
                jobId: `build-${buildId}`,
            }
        );

        // Clean up temp files from disk
        cleanupLocalFiles(allFiles.map((f) => f.path));

        console.log(`[Build] Created build ${buildId} for user ${req.user?._id}`);

        return res.status(202).json({
            buildId,
            streamUrl: `/api/v1/build/${buildId}/stream`,
            status: "queued",
        });
    } catch (error) {
        console.error("[Build] Error creating build:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

// ── GET /api/v1/build/:buildId/stream ─────────────────────────
// SSE endpoint — subscribes to Redis pub/sub channel for this build
// and forwards all events to the client in real time.

export async function handleGetBuildStream(req: Request, res: Response) {
    try {
        const { buildId } = req.params;

        if (!buildId) {
            return res.status(400).json({ status: 400, message: "buildId is required" });
        }

        // Verify build exists
        const build = await Build.findOne({ buildId });
        if (!build) {
            return res.status(404).json({ status: 404, message: "Build not found" });
        }

        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
        res.flushHeaders();

        // Send initial connection event
        res.write(
            `data: ${JSON.stringify({
                type: "connected",
                buildId,
                status: build.status,
                progress: build.progress,
            })}\n\n`
        );

        // If build is already complete or failed, send final state and close
        if (build.status === "complete" || build.status === "failed") {
            const finalEvent =
                build.status === "complete"
                    ? {
                        type: "complete",
                        previewUrl: build.previewUrl,
                        downloadUrl: build.downloadUrl,
                    }
                    : {
                        type: "fatal",
                        message: build.error || "Build failed",
                        buildId,
                    };

            res.write(`data: ${JSON.stringify(finalEvent)}\n\n`);
            res.end();
            return;
        }

        // Subscribe to Redis pub/sub for this build
        const subscriber = createRedisSubscriber();
        const channel = `build:${buildId}`;

        await subscriber.subscribe(channel);

        subscriber.on("message", (_channel: string, message: string) => {
            res.write(`data: ${message}\n\n`);

            // Close connection on terminal events
            try {
                const parsed = JSON.parse(message);
                if (parsed.type === "complete" || parsed.type === "fatal") {
                    setTimeout(() => {
                        subscriber.unsubscribe().catch(() => { });
                        subscriber.quit().catch(() => { });
                        res.end();
                    }, 500); // small delay to ensure client receives the event
                }
            } catch {
                // Not JSON — ignore
            }
        });

        // Heartbeat to keep connection alive (every 30s)
        const heartbeat = setInterval(() => {
            res.write(`: heartbeat\n\n`);
        }, 30_000);

        // Cleanup on client disconnect
        req.on("close", () => {
            clearInterval(heartbeat);
            subscriber.unsubscribe().catch(() => { });
            subscriber.quit().catch(() => { });
            console.log(`[SSE] Client disconnected from build ${buildId}`);
        });
    } catch (error) {
        console.error("[SSE] Error setting up stream:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
        });
    }
}

// ── GET /api/v1/build/:buildId ────────────────────────────────
// Returns full build record from MongoDB. Used to restore state on page refresh.

export async function handleGetBuild(req: Request, res: Response) {
    try {
        const { buildId } = req.params;

        if (!buildId) {
            return res.status(400).json({ status: 400, message: "buildId is required" });
        }

        const build = await Build.findOne({ buildId });

        if (!build) {
            return res.status(404).json({
                status: 404,
                message: "Build not found",
            });
        }

        // Verify ownership
        if (build.userId.toString() !== req.user?._id?.toString()) {
            return res.status(403).json({
                status: 403,
                message: "You do not have access to this build",
            });
        }

        return res.status(200).json({
            buildId: build.buildId,
            status: build.status,
            progress: build.progress,
            input: build.input,
            blueprint: build.blueprint,
            architecture: build.architecture,
            files: build.files,
            previewUrl: build.previewUrl,
            downloadUrl: build.downloadUrl,
            cost: build.cost,
            error: build.error,
            createdAt: build.createdAt,
            updatedAt: build.updatedAt,
            completedAt: build.completedAt,
        });
    } catch (error) {
        console.error("[Build] Error fetching build:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

// ── GET /api/v1/build ─────────────────────────────────────────
// Lists all builds for the authenticated user (latest first).

export async function handleListBuilds(req: Request, res: Response) {
    try {
        const userId = req.user?._id;

        const builds = await Build.find({ userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .select("buildId status progress input.prompt createdAt updatedAt completedAt cost");

        return res.status(200).json({
            status: 200,
            data: builds,
        });
    } catch (error) {
        console.error("[Build] Error listing builds:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
        });
    }
}

/**
 * 
 * @param req 
 * @param res 
 * 
 * Zips the whole build or Project generated and saved
 * send the zip to frontne and can be downloaded by user 
 */

export async function handleDownloadBuildInzip(req: Request, res: Response) {
    try {
        const { buildId } = req.params;

        if (!buildId) {
            return res.status(400).json({ status: 400, message: "buildId is required" });
        }

        const build = await Build.findOne({ buildId });

        if (!build) {
            return res.status(404).json({ status: 404, message: "Build not found" });
        }

        if (build.userId.toString() !== req.user?._id?.toString()) {
            return res.status(403).json({ status: 403, message: "You do not have access to this build" });
        }

        const successfulFiles = build.files.filter((f) => f.status === "done" && f.s3Key);

        if (successfulFiles.length === 0) {
            return res.status(400).json({ status: 400, message: "No files available for download yet" });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="build-${buildId}.zip"`);

        const archive = archiver("zip", {
            zlib: { level: 9 }
        });

        archive.on("error", (err: any) => {
            console.error("[Download] Archiver error:", err);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });

        archive.pipe(res);

        for (const file of successfulFiles) {
            try {
                // Download file from GCS into memory/stream and append to zip
                const fileStream = bucket.file(file.s3Key).createReadStream();
                
                // Ensure the path does not start with a leading slash to avoid absolute paths in zip
                const entryName = file.path.startsWith("/") ? file.path.substring(1) : file.path;
                archive.append(fileStream, { name: entryName });
            } catch (err) {
                console.error(`[Download] Failed to fetch file ${file.path} from GCS:`, err);
            }
        }

        await archive.finalize();
    } catch (error) {
        console.error("[Download] Error generating zip:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                status: 500,
                message: "Internal server error",
                error: error instanceof Error ? error.message : String(error),
            });
        } else {
            res.end();
        }
    }
}