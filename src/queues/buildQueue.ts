// src/queues/buildQueue.ts
// BullMQ queue definitions for the code generation pipeline.
// Each stage gets its own queue for independent scaling and monitoring.

import { Queue } from "bullmq";
import { getRedisConnection } from "../config/redis.js";

const connection = getRedisConnection();

// Default job options shared across all build queues
const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: "exponential" as const,
        delay: 2000,
    },
    removeOnComplete: {
        age: 24 * 3600, // keep completed jobs for 24h
        count: 100,
    },
    removeOnFail: {
        age: 7 * 24 * 3600, // keep failed jobs for 7 days
    },
};

/** Main orchestrator queue — receives the initial build request */
export const buildMainQueue = new Queue("build-main", {
    connection,
    defaultJobOptions,
});

/** Analysis queue — image analysis + doc parsing jobs */
export const buildAnalysisQueue = new Queue("build-analysis", {
    connection,
    defaultJobOptions,
});

/** Architecture planning queue */
export const buildArchitectureQueue = new Queue("build-architecture", {
    connection,
    defaultJobOptions,
});

/** Code generation queue — parallel file generation jobs */
export const buildCodegenQueue = new Queue("build-codegen", {
    connection,
    defaultJobOptions,
});

/** Assembly queue — file validation, repair loop, zip */
export const buildAssemblyQueue = new Queue("build-assembly", {
    connection,
    defaultJobOptions,
});

/** Preview queue — Docker container spin-up */
export const buildPreviewQueue = new Queue("build-preview", {
    connection,
    defaultJobOptions,
});
