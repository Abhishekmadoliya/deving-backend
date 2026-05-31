// src/config/redis.ts
// Shared Redis connection factory — avoids duplicating connection logic everywhere.

import { Redis } from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let _connection: Redis | null = null;

/**
 * Returns a singleton Redis connection suitable for BullMQ queues and general use.
 * Uses REDIS_URL (Upstash) if set, otherwise falls back to REDIS_HOST:REDIS_PORT.
 */
export function getRedisConnection(): Redis {
    if (_connection) return _connection;

    _connection = process.env.REDIS_URL
        ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
        : new Redis({
            host: process.env.REDIS_HOST || "localhost",
            port: Number(process.env.REDIS_PORT) || 6379,
            maxRetriesPerRequest: null,
        });

    _connection.on("connect", () => {
        const target = process.env.REDIS_URL
            ? "Upstash Redis"
            : `${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`;
        console.log(`[Redis] Connected to ${target}`);
    });

    _connection.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
    });

    return _connection;
}

/**
 * Creates a NEW Redis connection for pub/sub subscribers.
 * Each SSE client needs its own subscriber — you can't reuse
 * a connection that's in subscriber mode for other commands.
 */
export function createRedisSubscriber(): Redis {
    const subscriber = process.env.REDIS_URL
        ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
        : new Redis({
            host: process.env.REDIS_HOST || "localhost",
            port: Number(process.env.REDIS_PORT) || 6379,
            maxRetriesPerRequest: null,
        });

    return subscriber;
}

/**
 * Creates a NEW Redis connection for pub/sub publishers.
 * Workers use this to publish SSE events to channels.
 */
export function createRedisPublisher(): Redis {
    const publisher = process.env.REDIS_URL
        ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
        : new Redis({
            host: process.env.REDIS_HOST || "localhost",
            port: Number(process.env.REDIS_PORT) || 6379,
            maxRetriesPerRequest: null,
        });

    return publisher;
}
