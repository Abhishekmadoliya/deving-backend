// src/workers/buildWorker.ts
// Main BullMQ worker — orchestrates the full build pipeline.
// Listens on the `build-main` queue and runs all 5 stages sequentially.

import { Worker } from "bullmq";
import dotenv from "dotenv";
import http from "http";
import { getRedisConnection } from "../config/redis.js";
import { connectDB } from "../config/db.js";
import { runPipeline, type StageDefinition } from "./stageRunner.js";

// Stage implementations
import { runImageAnalysis } from "./stages/imageAnalysis.js";
import { runDocParsing } from "./stages/docParsing.js";
import { mergeBlueprint } from "./stages/blueprintMerge.js";
import { runArchitecturePlanning } from "./stages/architecturePlanning.js";
import { runCodeGeneration } from "./stages/codeGenWorker.js";
import { runAssembly } from "./stages/assemblyWorker.js";
import { runDockerPreview } from "./stages/dockerPreview.js";

dotenv.config();

console.log("[BuildWorker] Starting build pipeline worker...");
connectDB();

const connection = getRedisConnection();

// ── Stage Definitions ─────────────────────────────────────────

function buildStages(buildId: string): StageDefinition[] {
    // Temporary storage for stage outputs (shared across stages in a single pipeline run)
    let imageResult: Awaited<ReturnType<typeof runImageAnalysis>>;
    let docResult: Awaited<ReturnType<typeof runDocParsing>>;

    return [
        // Stage 1A + 1B: Analysis (run in parallel, wrapped as one stage)
        {
            name: "Analysis (Images + Docs)",
            stageKey: "analyzing",
            status: "analyzing",
            progressStart: 5,
            progressEnd: 20,
            execute: async (buildId: string) => {
                // Run image analysis and doc parsing in parallel
                const [imgRes, docRes] = await Promise.all([
                    runImageAnalysis(buildId),
                    runDocParsing(buildId),
                ]);
                imageResult = imgRes;
                docResult = docRes;

                // Merge into blueprint
                await mergeBlueprint(buildId, imageResult, docResult);
            },
        },

        // Stage 2: Architecture Planning
        {
            name: "Architecture Planning",
            stageKey: "planning_architecture",
            status: "planning",
            progressStart: 20,
            progressEnd: 35,
            execute: async (buildId: string) => {
                await runArchitecturePlanning(buildId);
            },
        },

        // Stage 3: Code Generation (parallel by file)
        {
            name: "Code Generation",
            stageKey: "generating_code",
            status: "generating",
            progressStart: 35,
            progressEnd: 80,
            execute: async (buildId: string) => {
                await runCodeGeneration(buildId);
            },
        },

        // Stage 4: Assembly + Validation + Repair
        {
            name: "Assembly & Validation",
            stageKey: "assembling",
            status: "assembling",
            progressStart: 80,
            progressEnd: 95,
            execute: async (buildId: string) => {
                await runAssembly(buildId);
            },
        },

        // Stage 5: Docker Preview (placeholder)
        {
            name: "Preview Setup",
            stageKey: "docker_preview",
            status: "previewing",
            progressStart: 95,
            progressEnd: 100,
            execute: async (buildId: string) => {
                await runDockerPreview(buildId);
            },
        },
    ];
}

// ── BullMQ Worker ─────────────────────────────────────────────

const buildWorker = new Worker(
    "build-main",
    async (job) => {
        const { buildId } = job.data;
        console.log(`[BuildWorker] Job ${job.id} picked up — buildId: ${buildId}`);

        const stages = buildStages(buildId);
        await runPipeline(buildId, stages);

        console.log(`[BuildWorker] Job ${job.id} completed — buildId: ${buildId}`);
    },
    {
        connection,
        concurrency: 2, // Process up to 2 builds simultaneously
    }
);

// ── Worker Events ─────────────────────────────────────────────

buildWorker.on("active", (job) => {
    console.log(`[BuildWorker] Job ${job.id} has become active`);
});

buildWorker.on("completed", (job) => {
    console.log(`[BuildWorker] Job ${job.id} marked as completed`);
});

buildWorker.on("failed", (job, error) => {
    console.error(`[BuildWorker] Job ${job?.id} failed:`, error.message);
});

buildWorker.on("error", (error) => {
    console.error("[BuildWorker] Worker error:", error);
});

// ── Health Check Server ───────────────────────────────────────
// For Cloud Run or k8s liveness probes

if (process.env.NODE_ENV === "production") {
    const port = process.env.BUILD_WORKER_PORT || "8081";
    const server = http.createServer((req, res) => {
        if (req.url === "/health" || req.url === "/") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", component: "build-worker" }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(port, () => {
        console.log(`[BuildWorker] Health check server listening on port ${port}`);
    });
} else {
    console.log("[BuildWorker] Running in development mode — no health check server");
}

console.log("[BuildWorker] Ready and listening for build jobs on queue: build-main");
