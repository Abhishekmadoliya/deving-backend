import fetch from "node-fetch";
import FormData from "form-data";
import jwt from "jsonwebtoken";
import * as eventsource from "eventsource";
const EventSource = (eventsource as any).EventSource || (eventsource as any).default || eventsource;
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/devign";
const JWT_SECRET = process.env.JWT_SECRET || "bdknvlkdnv";
const SERVER_URL = "http://localhost:8000";

async function setupTestUser() {
    await mongoose.connect(MONGO_URI);
    
    let user = await User.findOne({ email: "test@devign.com" });
    if (!user) {
        user = await User.create({
            email: "test@devign.com",
            name: "Test User",
            password: "password123", // In a real app this would be hashed
            googleId: "test",
            providerId: "local",
            avatar: "test"
        });
        console.log("Created test user:", user._id);
    } else {
        console.log("Found test user:", user._id);
    }

    // Create JWT
    const token = jwt.sign({ email: user.email, id: user._id }, JWT_SECRET, { expiresIn: '1h' });
    return { user, token };
}

async function testPipeline() {
    try {
        console.log("1. Setting up test user...");
        const { token } = await setupTestUser();
        console.log("Token generated.");

        console.log("\n2. Submitting POST /api/v1/build ...");
        const form = new FormData();
        form.append("prompt", "Create a simple landing page for a coffee shop. It needs a hero section, a menu section with 3 items, and a footer.");

        // NOTE: To test with an image, you can uncomment this and add a sample image file path
        // form.append("images", fs.createReadStream(path.join(__dirname, "test-image.jpg")));

        const response = await fetch(`${SERVER_URL}/api/v1/build`, {
            method: "POST",
            body: form,
            headers: {
                "Cookie": `token=${token}`,
                ...form.getHeaders()
            }
        });

        if (!response.ok) {
            console.error("HTTP Error:", response.status, response.statusText);
            const text = await response.text();
            console.error("Response body:", text);
            process.exit(1);
        }

        const data = await response.json() as any;
        console.log("Build created:", data);

        if (data.buildId) {
            const { buildId, streamUrl } = data;
            console.log(`\n3. Connecting to SSE stream at ${streamUrl} ...`);

            const es = new EventSource(`${SERVER_URL}${streamUrl}`, {
                headers: { "Cookie": `token=${token}` }
            });

            es.onmessage = (event) => {
                const parsed = JSON.parse(event.data);
                
                if (parsed.type === "log") {
                    console.log(`\n[LOG] ${parsed.message}`);
                } else if (parsed.type === "stage") {
                    console.log(`\n[STAGE] ${parsed.stage} - ${parsed.progress}%`);
                } else if (parsed.type === "file_start") {
                    console.log(`\n[FILE START] Writing: ${parsed.path} ...`);
                } else if (parsed.type === "file_chunk") {
                    process.stdout.write(parsed.chunk);
                } else if (parsed.type === "file_done") {
                    console.log(`\n[FILE DONE] Uploaded to GCS: ${parsed.s3Key}`);
                } else if (parsed.type === "complete") {
                    console.log(`\n[COMPLETE] Build finished successfully!`);
                    console.log(`Download URL: ${parsed.downloadUrl}`);
                    es.close();
                    mongoose.disconnect();
                    process.exit(0);
                } else if (parsed.type === "error") {
                    console.error(`\n[ERROR] File: ${parsed.file} - ${parsed.message}`);
                } else if (parsed.type === "fatal") {
                    console.error(`\n[FATAL] Pipeline failed: ${parsed.message}`);
                    es.close();
                    mongoose.disconnect();
                    process.exit(1);
                }
            };

            es.onerror = (err) => {
                console.error("\n[SSE Error]", err);
            };

            // Test GET /api/v1/build endpoint
            setTimeout(async () => {
                console.log("\n--- Testing GET /api/v1/build (list user builds) ---");
                const listRes = await fetch(`${SERVER_URL}/api/v1/build`, {
                    headers: { "Cookie": `token=${token}` }
                });
                const listData = await listRes.json();
                console.log("List Builds Response:", JSON.stringify(listData).substring(0, 150) + "...");
                
                console.log(`\n--- Testing GET /api/v1/build/${buildId} ---`);
                const getRes = await fetch(`${SERVER_URL}/api/v1/build/${buildId}`, {
                    headers: { "Cookie": `token=${token}` }
                });
                const getData = await getRes.json();
                console.log("Get Build Status:", (getData as any).status, "- Progress:", (getData as any).progress);
            }, 5000); // Check 5 seconds after starting
        }
    } catch (err) {
        console.error("Test script failed:", err);
        process.exit(1);
    }
}

testPipeline();
