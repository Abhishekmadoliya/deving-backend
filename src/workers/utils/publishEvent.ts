// src/workers/utils/publishEvent.ts
// Publishes typed SSE events to Redis pub/sub for a specific build.
// The SSE controller in buildController.ts subscribes to these events and forwards them to the client.

import { createRedisPublisher } from "../../config/redis.js";
import type { Redis } from "ioredis";

// ── SSE Event Types ───────────────────────────────────────────

export interface StageEvent {
    type: "stage";
    stage: string;
    progress: number;
}

export interface FileStartEvent {
    type: "file_start";
    path: string;
}

export interface FileChunkEvent {
    type: "file_chunk";
    path: string;
    chunk: string;
}

export interface FileDoneEvent {
    type: "file_done";
    path: string;
    s3Key: string;
}

export interface ErrorEvent {
    type: "error";
    stage: string;
    file?: string;
    message: string;
    retrying: boolean;
}

export interface FatalEvent {
    type: "fatal";
    message: string;
    buildId: string;
}

export interface CompleteEvent {
    type: "complete";
    previewUrl: string | null;
    downloadUrl: string | null;
}

export interface LogEvent {
    type: "log";
    message: string;
    level: "info" | "warn" | "error";
}

export type BuildSSEEvent =
    | StageEvent
    | FileStartEvent
    | FileChunkEvent
    | FileDoneEvent
    | ErrorEvent
    | FatalEvent
    | CompleteEvent
    | LogEvent;

// ── Publisher ─────────────────────────────────────────────────

let _publisher: Redis | null = null;

function getPublisher(): Redis {
    if (!_publisher) {
        _publisher = createRedisPublisher();
    }
    return _publisher;
}

/**
 * Publish an SSE event to the Redis channel for a specific build.
 * All BullMQ workers call this to stream progress to the frontend.
 */
export async function publishEvent(
    buildId: string,
    event: BuildSSEEvent
): Promise<void> {
    const channel = `build:${buildId}`;
    const message = JSON.stringify(event);

    try {
        await getPublisher().publish(channel, message);
    } catch (err) {
        console.error(`[SSE] Failed to publish event to ${channel}:`, err);
    }
}

/**
 * Convenience: publish a stage progress update.
 */
export async function publishStage(
    buildId: string,
    stage: string,
    progress: number
): Promise<void> {
    await publishEvent(buildId, { type: "stage", stage, progress });
}

/**
 * Convenience: publish a log message to the client.
 */
export async function publishLog(
    buildId: string,
    message: string,
    level: "info" | "warn" | "error" = "info"
): Promise<void> {
    await publishEvent(buildId, { type: "log", message, level });
}

/**
 * Convenience: publish a fatal error and close the build.
 */
export async function publishFatal(
    buildId: string,
    message: string
): Promise<void> {
    await publishEvent(buildId, { type: "fatal", message, buildId });
}
