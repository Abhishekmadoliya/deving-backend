// src/scripts/triggerBuild.ts
// Test script to trigger a build and listen to its SSE stream

import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import EventSource from "eventsource";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testBuild() {
    console.log("Triggering new build...");

    const form = new FormData();
    form.append("prompt", "Create a simple counter component in React with tailwind CSS");
    
    // We'll skip images and docs for a simple test, just testing codeGen
    
    try {
        const response = await fetch("http://localhost:8000/api/v1/build", {
            method: "POST",
            body: form,
            headers: {
                // If we need auth, we'd add it here. For now assuming auth is mocked or bypassed for this endpoint,
                // Wait, the endpoint uses `checkAuthorization` middleware.
                // We'll see if it passes. If it fails, we'll need to generate a token or bypass it for testing.
            }
        });

        const data = await response.json();
        console.log("Response:", data);

        if (data.success && data.data) {
            const { buildId, streamUrl } = data.data;
            console.log(`\nConnecting to SSE stream at ${streamUrl} ...`);

            const es = new EventSource(`http://localhost:8000${streamUrl}`);

            es.onmessage = (event) => {
                const parsed = JSON.parse(event.data);
                if (parsed.type === "log") {
                    console.log(`[LOG] ${parsed.message}`);
                } else if (parsed.type === "stage") {
                    console.log(`[STAGE] ${parsed.stage} (${parsed.progress}%)`);
                } else if (parsed.type === "file_chunk") {
                    process.stdout.write(parsed.chunk);
                } else if (parsed.type === "file_done") {
                    console.log(`\n[FILE DONE] ${parsed.path}`);
                } else if (parsed.type === "complete") {
                    console.log(`\n[COMPLETE] Build finished! Download: ${parsed.downloadUrl}`);
                    es.close();
                } else if (parsed.type === "error" || parsed.type === "fatal") {
                    console.error(`\n[ERROR]`, parsed);
                }
            };

            es.onerror = (err) => {
                console.error("[SSE Error]", err);
            };
        }
    } catch (err) {
        console.error("Test failed:", err);
    }
}

testBuild();
