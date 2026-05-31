// src/workers/stages/blueprintMerge.ts
// Merges the outputs of Stage 1A (image analysis) and Stage 1B (doc parsing)
// into a single ProjectBlueprint, then saves it to MongoDB.

import { Build, type IProjectBlueprint } from "../../models/build.model.js";
import { publishLog } from "../utils/publishEvent.js";

// ── Types (matching stage outputs) ────────────────────────────

interface ImageAnalysisResult {
    pages: string[];
    components: string[];
    theme: Record<string, unknown>;
}

interface DocParsingResult {
    features: string[];
    dataModels: Record<string, unknown>[];
    apiRoutes: Record<string, unknown>[];
    rules: string[];
}

// ── Merge Entry Point ─────────────────────────────────────────

/**
 * Merge image analysis and doc parsing results into a single ProjectBlueprint.
 * Deduplicates pages, components, and features. Saves to MongoDB.
 */
export async function mergeBlueprint(
    buildId: string,
    imageResult: ImageAnalysisResult,
    docResult: DocParsingResult
): Promise<IProjectBlueprint> {
    await publishLog(buildId, "Merging image analysis and document parsing into blueprint...");

    // Deduplicate arrays (case-insensitive)
    const dedupe = (arr: string[]): string[] => {
        const seen = new Set<string>();
        return arr.filter((item) => {
            const lower = item.toLowerCase();
            if (seen.has(lower)) return false;
            seen.add(lower);
            return true;
        });
    };

    const blueprint: IProjectBlueprint = {
        pages: dedupe([...imageResult.pages]),
        components: dedupe([...imageResult.components]),
        theme: imageResult.theme || {},
        features: dedupe([...docResult.features]),
        dataModels: docResult.dataModels || [],
        apiRoutes: docResult.apiRoutes || [],
        rules: docResult.rules || [],
    };

    // Save to MongoDB
    await Build.updateOne(
        { buildId },
        { $set: { blueprint } }
    );

    await publishLog(
        buildId,
        `Blueprint merged: ${blueprint.pages.length} pages, ${blueprint.components.length} components, ${blueprint.features.length} features, ${blueprint.dataModels.length} models`
    );

    return blueprint;
}
