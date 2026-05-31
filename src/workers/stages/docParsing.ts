// src/workers/stages/docParsing.ts
// Stage 1B — Parses uploaded documentation (markdown, text, YAML, JSON, PDF).
// Extracts: features, data models, API routes, business rules.

import { Build } from "../../models/build.model.js";
import { chatJSON, MODELS } from "../utils/aiClient.js";
import { buildDocParsingPrompt } from "../utils/promptBuilder.js";
import { publishLog } from "../utils/publishEvent.js";
import { trackCost } from "../utils/costTracker.js";
import { bucket } from "../../lib/gcs.js";
import fs from "fs";
import path from "path";
import os from "os";

// ── Types ─────────────────────────────────────────────────────

interface DocParsingResult {
    features: string[];
    dataModels: { name: string; fields: string[] }[];
    apiRoutes: { method: string; path: string; description: string }[];
    rules: string[];
}

// ── Stage 1B Entry Point ──────────────────────────────────────

/**
 * Parse all uploaded documents for a build.
 * Downloads docs from GCS, reads their content, sends to Ollama for extraction.
 */
export async function runDocParsing(buildId: string): Promise<DocParsingResult> {
    const build = await Build.findOne({ buildId });
    if (!build) throw new Error(`Build ${buildId} not found`);

    const docUrls = build.input.docUrls;

    if (!docUrls || docUrls.length === 0) {
        await publishLog(buildId, "No documents provided — skipping doc parsing", "info");
        return {
            features: [],
            dataModels: [],
            apiRoutes: [],
            rules: [],
        };
    }

    await publishLog(buildId, `Parsing ${docUrls.length} document(s)...`);

    // Download and read all documents
    const docContents: string[] = [];

    for (let i = 0; i < docUrls.length; i++) {
        const docUrl = docUrls[i]!;
        await publishLog(buildId, `Reading document ${i + 1}/${docUrls.length}...`);

        try {
            const content = await downloadAndReadDoc(docUrl);
            if (content.trim().length > 0) {
                docContents.push(`--- Document ${i + 1} (${getFilenameFromUrl(docUrl)}) ---\n${content}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[DocParsing] Failed to read document ${i + 1}:`, message);
            await publishLog(buildId, `Warning: Failed to read document ${i + 1}: ${message}`, "warn");
        }
    }

    if (docContents.length === 0) {
        await publishLog(buildId, "No document content extracted — using empty analysis", "warn");
        return { features: [], dataModels: [], apiRoutes: [], rules: [] };
    }

    // Combine all documents and send to Ollama
    const combinedContent = docContents.join("\n\n");

    // Truncate if too long (prevent token limit issues)
    const maxChars = 30000;
    const truncated = combinedContent.length > maxChars
        ? combinedContent.substring(0, maxChars) + "\n\n[... truncated for length ...]"
        : combinedContent;

    const messages = buildDocParsingPrompt(truncated);

    const response = await chatJSON<DocParsingResult>(messages, MODELS.CODER, {
        temperature: 0.2,
    });

    // Track cost
    await trackCost(buildId, {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        model: MODELS.CODER,
    });

    await publishLog(buildId, `Doc parsing complete: ${response.data.features.length} features, ${response.data.dataModels.length} models, ${response.data.apiRoutes.length} routes found`);

    return response.data;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Download a document from GCS and return its text content.
 * Supports: .md, .txt, .yaml, .yml, .json
 * PDF support: reads as raw text (basic extraction — upgrade with pdf-parse later)
 */
async function downloadAndReadDoc(docUrl: string): Promise<string> {
    const urlObj = new URL(docUrl);
    const gcsPath = urlObj.pathname.split("/").slice(2).join("/");
    const ext = path.extname(gcsPath).toLowerCase();

    const tempPath = path.join(os.tmpdir(), `doc-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);

    try {
        await bucket.file(gcsPath).download({ destination: tempPath });

        if (ext === ".pdf") {
            // Basic PDF handling — just note it for now
            // TODO: Add pdf-parse library for proper PDF extraction
            return `[PDF Document: ${getFilenameFromUrl(docUrl)} — PDF parsing not yet implemented. Upload as .md or .txt instead.]`;
        }

        // Read text-based files directly
        return fs.readFileSync(tempPath, "utf-8");
    } finally {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
}

/**
 * Extract filename from a GCS URL.
 */
function getFilenameFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.pathname.split("/");
        return parts[parts.length - 1] || "unknown";
    } catch {
        return "unknown";
    }
}
