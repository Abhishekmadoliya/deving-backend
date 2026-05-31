import { Worker } from "bullmq";
import { Redis } from "ioredis";
import dotenv from "dotenv";
import http from "http";

import fs from "fs";
import { imageQueue } from "./queues/imageQueue.js";
import { UserSession } from "./models/user.session.js";
import enhancePrompt from "./services/prompts/enhancePrompt.js";
import uploadToGCS from "./services/design/GCS/uploadToGCS.js";

import { connectDB } from "./config/db.js";
import { callCloudflareImageGenerator } from "./services/design/CLOUDFLARE/imageGenerator.js";
dotenv.config();

console.log("[Worker] Starting background worker...");
connectDB();

const connection = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new Redis({
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null
    });

connection.on("connect", () => {
    const redisTarget = process.env.REDIS_URL ? "Upstash Redis" : `${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`;
    console.log(`[Worker] Connected to Redis at ${redisTarget}`);
});

connection.on("error", (err) => {
    console.error("[Worker] Redis connection error:", err);
});

const worker = new Worker("image-generation",
    async (job) => {
        const { sessionId, designPrompt, model, type, referenceImagePaths } = job.data;
        console.log(`[Worker] Job ${job.id} picked up for sessionId: ${sessionId}`);

        try {
            const session = await UserSession.findById(sessionId) as any;
            if (!session) {
                console.error(`[Worker] Session ${sessionId} not found in database.`);
                throw new Error(`Session ${sessionId} not found in database.`);
            }

            console.log(`[Worker] Updating status to "processing" for session: ${sessionId}`);
            session.status = "processing";
            await session.save();

            // Enhance prompt
            const referenceImagesData = referenceImagePaths && referenceImagePaths.length > 0 
                ? referenceImagePaths.map((path: string) => [...fs.readFileSync(path)])
                : undefined;

            console.log(`[Worker] Enhancing design prompt: "${designPrompt}"`);
            const enhancedPrompt = await enhancePrompt(designPrompt, model, type, referenceImagesData);
            console.log(`[Worker] Enhanced design prompt: "${enhancedPrompt}"`);

            // Generate image
            console.log(`[Worker] Calling Cloudflare image generator...`);
            const rawImageBuffer = await callCloudflareImageGenerator(enhancedPrompt);
            if (!rawImageBuffer) {
                throw new Error("No image buffer returned from Cloudflare generator.");
            }
            console.log(`[Worker] Image generated successfully (size: ${(rawImageBuffer as Buffer).length} bytes)`);

            // Upload image
            console.log(`[Worker] Uploading image to GCS...`);
            const imageUrl = await uploadToGCS(rawImageBuffer as Buffer, sessionId);
            console.log(`[Worker] Image uploaded to GCS successfully. URL: ${imageUrl}`);

            // Save session
            console.log(`[Worker] Saving completed session status to database...`);
            session.status = "done";
            session.imageUrl = imageUrl;
            session.enhancedPrompt = enhancedPrompt;
            session.designPrompt = designPrompt;
            await session.save();

            // Clean up uploaded files from disk
            if (referenceImagePaths && referenceImagePaths.length > 0) {
                referenceImagePaths.forEach((path: string) => {
                    fs.unlink(path, (err) => {
                        if (err) console.error(`[Worker] Error deleting file ${path}:`, err);
                    });
                });
            }

            console.log(`[Worker] Job ${job.id} completed successfully for session: ${sessionId}`);
        } catch (error: any) {
            console.error(`[Worker] Error processing job ${job.id}:`, error);
            throw error; // Re-throw to trigger BullMQ "failed" handler
        }
    },
    { connection }
);

worker.on("active", (job) => {
    console.log(`[Worker] Job ${job.id} has become active`);
});

worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} marked as completed`);
});

worker.on("failed", async (job, error) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, error.message);
    try {
        await UserSession.findByIdAndUpdate(job?.data?.sessionId, {
            status: "failed",
            errorMessage: error?.message,
            $inc: { retryCount: 1 },
        });
        console.log(`[Worker] Updated session status to "failed" in database for ID: ${job?.data?.sessionId}`);
    } catch (dbErr) {
        console.error(`[Worker] Failed to update session status in database:`, dbErr);
    }
});

// Simple HTTP server for Cloud Run health checks
// Only start this in production (Cloud Run) environments to prevent port collision crashes locally
if (process.env.NODE_ENV === 'production') {
    const port = process.env.PORT || '8080';
    const server = http.createServer((req, res) => {
        if (req.url === "/health" || req.url === "/") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", component: "worker" }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(port, () => {
        console.log(`[Worker] Health check server listening on port ${port}`);
    });
} else {
    console.log(`[Worker] Running in development mode; skipping health check HTTP server.`);
}