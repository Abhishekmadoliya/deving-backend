import { Worker } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";

import { imageQueue } from "./queues/imageQueue.js";
import { UserSession } from "./models/user.session.js";
import enhancePrompt from "./services/prompts/enhancePrompt.js";
import uploadToGCS from "./services/design/GCS/uploadToGCS.js";


import { connectDB } from "./config/db.js";
import { callCloudflareImageGenerator } from "./services/design/CLOUDFLARE/imageGenerator.js";
dotenv.config();

connectDB();


const connection = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null
});


const worker = new Worker("image-generation",
    async (job) => {
        const { sessionId } = job.data;
        const session = await UserSession.findById(sessionId) as any;
        session.status = "processing"
        await session.save();

        // enchance prompt
        const enchancedPrompt = await enhancePrompt(session.designPrompt);
        // const rawImageBuffer = await callVertexImageGenerator(enchancedPrompt);
        const rawImageBuffer = await callCloudflareImageGenerator(enchancedPrompt);
        const imageUrl = await uploadToGCS(rawImageBuffer as Buffer, sessionId);


        session.status = "done";
        session.imageUrl = imageUrl;
        session.enhancedPrompt = enchancedPrompt;

        await session.save();
    },
    { connection }
)


worker.on("failed", async (error, job) => {
    await UserSession.findByIdAndUpdate(job?.data?.sessionId, {
        status: "failed",
        errorMessage: error?.message,
        $inc: { retryCount: 1 },
    }) as any
    console.log(error?.message);
    console.log(job);
})