// src/workers/utils/costTracker.ts
// Records token usage after every AI API call.
// Updates the build record in MongoDB with accumulated costs.

import { Build } from "../../models/build.model.js";

// ── Pricing Table ─────────────────────────────────────────────
// Ollama hosted models — pricing may vary, using conservative estimates.
// Update these values based on your actual Ollama hosting costs.

const PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
    // Ollama hosted models (approximate pricing)
    "qwen3-coder-next": { inputPerMillion: 0.50, outputPerMillion: 2.00 },

    // Cloudflare Workers AI (free tier / very cheap)
    "@cf/unum/uform-gen2-qwen-500m": { inputPerMillion: 0.0, outputPerMillion: 0.0 },
    "@cf/meta/llama-3.1-8b-instruct": { inputPerMillion: 0.0, outputPerMillion: 0.0 },

    // Fallback for unknown models
    "_default": { inputPerMillion: 1.00, outputPerMillion: 3.00 },
};

/**
 * Calculate the USD cost for a given number of tokens and model.
 */
function calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
): number {
    const pricing = PRICING[model] ?? PRICING["_default"]!;
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
    return parseFloat((inputCost + outputCost).toFixed(6));
}

/**
 * Update the cost tracking fields on a build record.
 * Uses $inc to atomically accumulate costs across parallel workers.
 */
export async function trackCost(
    buildId: string,
    usage: {
        inputTokens: number;
        outputTokens: number;
        model: string;
    }
): Promise<void> {
    const usdCost = calculateCost(usage.inputTokens, usage.outputTokens, usage.model);

    try {
        await Build.updateOne(
            { buildId },
            {
                $inc: {
                    "cost.inputTokens": usage.inputTokens,
                    "cost.outputTokens": usage.outputTokens,
                    "cost.usdCost": usdCost,
                },
            }
        );
    } catch (err) {
        console.error(`[Cost] Failed to track cost for build ${buildId}:`, err);
    }
}
