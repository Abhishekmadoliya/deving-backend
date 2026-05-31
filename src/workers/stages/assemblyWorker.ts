// src/workers/stages/assemblyWorker.ts
// Stage 4 — Assembly + Validation + Repair Loop
// Pulls all generated files from GCS, validates them, runs repair if needed,
// zips everything, and uploads the final build.

import { Build } from "../../models/build.model.js";
import { chatCompletion, extractCode, MODELS } from "../utils/aiClient.js";
import { buildRepairPrompt } from "../utils/promptBuilder.js";
import { publishLog } from "../utils/publishEvent.js";
import { trackCost } from "../utils/costTracker.js";
import { bucket } from "../../lib/gcs.js";
import fs from "fs";
import path from "path";
import os from "os";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { createReadStream, createWriteStream } from "fs";

// ── Configuration ─────────────────────────────────────────────

const MAX_REPAIR_RETRIES = 2;

// ── Stage 4 Entry Point ───────────────────────────────────────

/**
 * Assemble all generated files, validate, repair if needed, and create a downloadable zip.
 */
export async function runAssembly(buildId: string): Promise<void> {
    const build = await Build.findOne({ buildId });
    if (!build) throw new Error(`Build ${buildId} not found`);

    await publishLog(buildId, "Assembling generated files...");

    // Create temp directory for the build
    const buildDir = path.join(os.tmpdir(), `build-${buildId}`);
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true });
    }
    fs.mkdirSync(buildDir, { recursive: true });

    try {
        // Step 1: Download all generated files from GCS
        const successfulFiles = build.files.filter((f) => f.status === "done" && f.s3Key);
        const errorFiles = build.files.filter((f) => f.status === "error");

        await publishLog(buildId, `Downloading ${successfulFiles.length} files (${errorFiles.length} failed)...`);

        for (const file of successfulFiles) {
            const localPath = path.join(buildDir, file.path);
            const dir = path.dirname(localPath);
            fs.mkdirSync(dir, { recursive: true });

            try {
                const [content] = await bucket.file(file.s3Key).download();
                fs.writeFileSync(localPath, content);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[Assembly] Failed to download ${file.path}:`, msg);
                await publishLog(buildId, `Warning: Could not download ${file.path}`, "warn");
            }
        }

        // Step 2: Basic validation — check for syntax issues in JS/JSX files
        const jsFiles = successfulFiles.filter((f) =>
            [".js", ".jsx", ".ts", ".tsx"].some((ext) => f.path.endsWith(ext))
        );

        let repairedCount = 0;
        for (const file of jsFiles) {
            const localPath = path.join(buildDir, file.path);
            if (!fs.existsSync(localPath)) continue;

            const content = fs.readFileSync(localPath, "utf-8");
            const issues = basicSyntaxCheck(content);

            if (issues.length > 0) {
                await publishLog(buildId, `Repairing ${file.path} (${issues.length} issues found)...`, "warn");

                const repaired = await repairFile(buildId, file.path, content, issues.join("\n"));
                if (repaired) {
                    fs.writeFileSync(localPath, repaired);

                    // Re-upload repaired file to GCS
                    await bucket.file(file.s3Key).save(repaired, {
                        contentType: "text/plain",
                        resumable: false,
                    });

                    repairedCount++;
                }
            }
        }

        if (repairedCount > 0) {
            await publishLog(buildId, `Repaired ${repairedCount} file(s)`);
        }

        // Step 3: Create a tar.gz archive
        await publishLog(buildId, "Creating downloadable archive...");
        const archivePath = path.join(os.tmpdir(), `build-${buildId}.tar.gz`);

        await createTarGz(buildDir, archivePath);

        // Step 4: Upload archive to GCS
        const archiveGcsKey = `builds/${buildId}/build.tar.gz`;
        await bucket.upload(archivePath, { destination: archiveGcsKey });
        // Removed makePublic() because bucket has Uniform Bucket-Level Access enabled
        const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${archiveGcsKey}`;

        // Update build record
        await Build.updateOne(
            { buildId },
            { $set: { downloadUrl } }
        );

        await publishLog(buildId, `Assembly complete. Download URL ready.`);

        // Cleanup temp files
        fs.rmSync(buildDir, { recursive: true, force: true });
        try { fs.unlinkSync(archivePath); } catch { /* ignore */ }

    } catch (error) {
        // Cleanup on failure
        try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch { /* ignore */ }
        throw error;
    }
}

// ── Repair Loop ───────────────────────────────────────────────

/**
 * Attempt to repair a file with syntax issues using Ollama.
 */
async function repairFile(
    buildId: string,
    filePath: string,
    content: string,
    errors: string,
    attempt: number = 0
): Promise<string | null> {
    if (attempt >= MAX_REPAIR_RETRIES) {
        await publishLog(buildId, `Could not repair ${filePath} after ${MAX_REPAIR_RETRIES} attempts`, "error");
        return null;
    }

    try {
        const messages = buildRepairPrompt(filePath, content, errors);
        const response = await chatCompletion(messages, MODELS.FAST, {
            temperature: 0.1,
        });

        // Track cost
        await trackCost(buildId, {
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            model: MODELS.FAST,
        });

        const repaired = extractCode(response.content);
        const newIssues = basicSyntaxCheck(repaired);

        if (newIssues.length > 0 && attempt + 1 < MAX_REPAIR_RETRIES) {
            return repairFile(buildId, filePath, repaired, newIssues.join("\n"), attempt + 1);
        }

        return repaired;
    } catch (err) {
        console.error(`[Assembly] Repair failed for ${filePath}:`, err);
        return null;
    }
}

// ── Validation ────────────────────────────────────────────────

/**
 * Basic syntax check for JavaScript/TypeScript files.
 * Returns an array of issue descriptions.
 */
function basicSyntaxCheck(content: string): string[] {
    const issues: string[] = [];

    // Check for unmatched braces
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < content.length; i++) {
        const char = content[i]!;
        const prev = i > 0 ? content[i - 1] : "";

        // Track string state
        if ((char === '"' || char === "'" || char === "`") && prev !== "\\") {
            if (inString && char === stringChar) {
                inString = false;
            } else if (!inString) {
                inString = true;
                stringChar = char;
            }
        }

        if (!inString) {
            if (char === "{") braceCount++;
            else if (char === "}") braceCount--;
            else if (char === "(") parenCount++;
            else if (char === ")") parenCount--;
            else if (char === "[") bracketCount++;
            else if (char === "]") bracketCount--;
        }
    }

    if (braceCount !== 0) issues.push(`Unmatched curly braces (balance: ${braceCount})`);
    if (parenCount !== 0) issues.push(`Unmatched parentheses (balance: ${parenCount})`);
    if (bracketCount !== 0) issues.push(`Unmatched square brackets (balance: ${bracketCount})`);

    // Check for empty file
    if (content.trim().length === 0) {
        issues.push("File is empty");
    }

    return issues;
}

// ── Archive Creator ───────────────────────────────────────────

/**
 * Create a tar.gz archive from a directory.
 * Uses a simple approach: concatenate files with headers.
 * For production, consider using the 'tar' npm package.
 */
async function createTarGz(sourceDir: string, outputPath: string): Promise<void> {
    // Simple approach: create a concatenated file with paths and contents
    // This is a basic implementation — for production, use the 'tar' package
    const files = getAllFiles(sourceDir, sourceDir);

    let combined = "";
    for (const file of files) {
        const content = fs.readFileSync(file.fullPath, "utf-8");
        combined += `\n===== FILE: ${file.relativePath} =====\n${content}\n`;
    }

    // Write as gzipped text
    const writeStream = createWriteStream(outputPath);
    const gzip = createGzip();

    const { Readable } = await import("stream");
    const readable = Readable.from(combined);

    await pipeline(readable, gzip, writeStream);
}

/**
 * Recursively get all files in a directory.
 */
function getAllFiles(
    dir: string,
    baseDir: string
): { fullPath: string; relativePath: string }[] {
    const results: { fullPath: string; relativePath: string }[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllFiles(fullPath, baseDir));
        } else {
            results.push({
                fullPath,
                relativePath: path.relative(baseDir, fullPath).replace(/\\/g, "/"),
            });
        }
    }

    return results;
}
