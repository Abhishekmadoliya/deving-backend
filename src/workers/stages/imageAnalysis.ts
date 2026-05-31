// src/workers/stages/imageAnalysis.ts
// Stage 1A — Analyzes uploaded UI mockups/screenshots using Cloudflare Vision model.
// Extracts: pages, components, theme information.

import { Build } from "../../models/build.model.js";
import { runCloudflareAI, chatJSON, MODELS } from "../utils/aiClient.js";
import { buildImageAnalysisPrompt } from "../utils/promptBuilder.js";
import { publishLog } from "../utils/publishEvent.js";
import { trackCost } from "../utils/costTracker.js";
import { bucket } from "../../lib/gcs.js";
import fs from "fs";
import path from "path";
import os from "os";

// ── Types ─────────────────────────────────────────────────────

interface ImageAnalysisResult {
    pages: string[];
    components: string[];
    theme: {
        primaryColor?: string;
        fontStyle?: string;
        layout?: string;
    };
}

// ── Stage 1A Entry Point ──────────────────────────────────────

/**
 * Analyze all uploaded images for a build.
 * Uses Cloudflare Vision to describe each image, then Ollama to extract structured data.
 */
export async function runImageAnalysis(buildId: string): Promise<ImageAnalysisResult> {
    const build = await Build.findOne({ buildId });
    if (!build) throw new Error(`Build ${buildId} not found`);

    const imageUrls = build.input.imageUrls;

    if (!imageUrls || imageUrls.length === 0) {
        await publishLog(buildId, "No images provided — skipping image analysis", "info");
        return {
            pages: [],
            components: [],
            theme: {},
        };
    }

    await publishLog(buildId, `Analyzing ${imageUrls.length} image(s)...`);

    // Download images and analyze each with Cloudflare Vision
    const descriptions: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i]!;
        await publishLog(buildId, `Analyzing image ${i + 1}/${imageUrls.length}...`);

        try {
            // Download image from GCS to get raw bytes
            const imageBuffer = await downloadImageFromGCS(imageUrl);
            const imageBytes = [...imageBuffer]; // Convert to number array for Cloudflare API

            // Run Cloudflare Vision model
            const vlmResponse = await runCloudflareAI(MODELS.VISION, {
                image: imageBytes,
                prompt: "You are a UI/UX design analyst. Carefully analyze this design image and describe: " +
                    "1) Layout structure and grid system, " +
                    "2) Color palette with approximate hex values, " +
                    "3) Typography style (headings, body, weight), " +
                    "4) Key UI components visible (navbar, cards, buttons, forms), " +
                    "5) Overall visual style (minimal, glassmorphism, flat, neumorphic, etc), " +
                    "6) Spacing and visual hierarchy. " +
                    "Be precise and technical.",
            });

            const description = vlmResponse?.result?.description?.trim();
            if (description) {
                descriptions.push(`[Image ${i + 1}]: ${description}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[ImageAnalysis] Failed to analyze image ${i + 1}:`, message);
            await publishLog(buildId, `Warning: Failed to analyze image ${i + 1}: ${message}`, "warn");
        }
    }

    if (descriptions.length === 0) {
        await publishLog(buildId, "No image descriptions extracted — using empty analysis", "warn");
        return { pages: [], components: [], theme: {} };
    }

    // Use Ollama to extract structured data from all image descriptions
    const combinedDescriptions = descriptions.join("\n\n");
    const messages = buildImageAnalysisPrompt(combinedDescriptions);

    const response = await chatJSON<ImageAnalysisResult>(messages, MODELS.CODER, {
        temperature: 0.2,
    });

    // Track cost
    await trackCost(buildId, {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        model: MODELS.CODER,
    });

    await publishLog(buildId, `Image analysis complete: ${response.data.pages.length} pages, ${response.data.components.length} components found`);

    return response.data;
}

// ── Helper ────────────────────────────────────────────────────

/**
 * Download an image from GCS URL and return as Buffer.
 */
async function downloadImageFromGCS(imageUrl: string): Promise<Buffer> {
    // Extract GCS path from URL: https://storage.googleapis.com/bucket-name/path/to/file
    const urlObj = new URL(imageUrl);
    const gcsPath = urlObj.pathname.split("/").slice(2).join("/"); // Remove /bucket-name/

    const tempPath = path.join(os.tmpdir(), `img-${Date.now()}-${Math.random().toString(36).substring(7)}`);

    try {
        await bucket.file(gcsPath).download({ destination: tempPath });
        const buffer = fs.readFileSync(tempPath);
        return buffer;
    } finally {
        // Clean up temp file
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
}
