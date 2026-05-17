import { Queue } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const connection = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null
});


export const imageQueue = new Queue("image-generation", connection);