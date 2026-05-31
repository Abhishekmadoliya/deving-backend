// src/workers/utils/aiClient.ts
// Unified AI client — wraps Ollama (primary) with streaming support.
// Secondary providers can be added later without changing the worker code.

import { Ollama } from "ollama";
import dotenv from "dotenv";

dotenv.config();

// ── Ollama Client (Primary) ──────────────────────────────────

const ollama = new Ollama({
    host: process.env.OLLAMA_HOST || "https://ollama.com",
    headers: {
        Authorization: "Bearer " + process.env.OLLAMA_API_KEY,
    },
});

// ── Types ─────────────────────────────────────────────────────

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface AIResponse {
    content: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
}

export interface AIStreamCallbacks {
    onChunk: (chunk: string) => Promise<void> | void;
    onComplete: (fullContent: string, usage: { inputTokens: number; outputTokens: number }) => Promise<void> | void;
    onError?: (error: Error) => Promise<void> | void;
}

// ── Available Models ──────────────────────────────────────────

export const MODELS = {
    // Primary code generation model
    CODER: "qwen3-coder-next",
    // Fast model for simpler tasks (configs, seeds, schemas)
    FAST: "qwen3-coder-next",
    // Vision model for image analysis (Cloudflare Workers AI)
    VISION: "@cf/unum/uform-gen2-qwen-500m",
    // Text model for prompt enhancement (Cloudflare Workers AI)
    TEXT_CF: "@cf/meta/llama-3.1-8b-instruct",
} as const;

// ── Non-streaming Chat ────────────────────────────────────────

/**
 * Send a chat completion request to Ollama (non-streaming).
 * Returns the full response content and token usage.
 */
export async function chatCompletion(
    messages: ChatMessage[],
    model: string = MODELS.CODER,
    options?: {
        temperature?: number;
        maxTokens?: number;
    }
): Promise<AIResponse> {
    try {
        const response = await ollama.chat({
            model,
            messages,
            stream: false,
            options: {
                temperature: options?.temperature ?? 0.3,
                num_predict: options?.maxTokens ?? 8000,
            },
        });

        return {
            content: response.message.content,
            model,
            inputTokens: response.prompt_eval_count ?? 0,
            outputTokens: response.eval_count ?? 0,
        };
    } catch (error) {
        console.error(`[AI] Ollama chat error (model: ${model}):`, error);
        throw error;
    }
}

// ── Streaming Chat ────────────────────────────────────────────

/**
 * Send a streaming chat completion request to Ollama.
 * Calls onChunk for each token, then onComplete with the full content.
 * This is used for code generation to stream file content to the frontend.
 */
export async function chatStream(
    messages: ChatMessage[],
    callbacks: AIStreamCallbacks,
    model: string = MODELS.CODER,
    options?: {
        temperature?: number;
        maxTokens?: number;
    }
): Promise<AIResponse> {
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
        const stream = await ollama.chat({
            model,
            messages,
            stream: true,
            options: {
                temperature: options?.temperature ?? 0.3,
                num_predict: options?.maxTokens ?? 8000,
            },
        });

        for await (const chunk of stream) {
            const text = chunk.message.content;
            if (text) {
                buffer += text;
                await callbacks.onChunk(text);
            }

            // Capture token usage from the final chunk
            if (chunk.done) {
                inputTokens = chunk.prompt_eval_count ?? 0;
                outputTokens = chunk.eval_count ?? 0;
            }
        }

        await callbacks.onComplete(buffer, { inputTokens, outputTokens });

        return {
            content: buffer,
            model,
            inputTokens,
            outputTokens,
        };
    } catch (error) {
        if (callbacks.onError) {
            await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
    }
}

// ── JSON Chat (structured output) ─────────────────────────────

/**
 * Chat completion that expects a JSON response.
 * Automatically retries once if JSON parsing fails.
 */
export async function chatJSON<T = Record<string, unknown>>(
    messages: ChatMessage[],
    model: string = MODELS.CODER,
    options?: {
        temperature?: number;
        maxTokens?: number;
    }
): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    // Add JSON instruction to the last message
    const enhancedMessages = [...messages];
    const lastMsg = enhancedMessages[enhancedMessages.length - 1];
    if (lastMsg) {
        enhancedMessages[enhancedMessages.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, no code fences. Just raw JSON.",
        };
    }

    const response = await chatCompletion(enhancedMessages, model, options);
    let content = response.content.trim();

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    try {
        const data = JSON.parse(content) as T;
        return {
            data,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
        };
    } catch {
        // Retry once with stricter instructions
        console.warn("[AI] JSON parse failed, retrying with stricter prompt...");

        const retryMessages: ChatMessage[] = [
            ...messages,
            {
                role: "assistant",
                content,
            },
            {
                role: "user",
                content: "Your previous response was not valid JSON. Please respond with ONLY raw valid JSON. No explanation, no markdown fences, no text before or after the JSON.",
            },
        ];

        const retryResponse = await chatCompletion(retryMessages, model, options);
        let retryContent = retryResponse.content.trim();
        retryContent = retryContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

        const data = JSON.parse(retryContent) as T;
        return {
            data,
            inputTokens: response.inputTokens + retryResponse.inputTokens,
            outputTokens: response.outputTokens + retryResponse.outputTokens,
        };
    }
}

// ── Cloudflare Workers AI (Vision + Text) ─────────────────────

/**
 * Run a model on Cloudflare Workers AI.
 * Used for vision (image analysis) and lightweight text tasks.
 */
export async function runCloudflareAI(model: string, payload: Record<string, unknown>): Promise<any> {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
    const CF_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;

    if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
        throw new Error("Missing Cloudflare API credentials (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_AI_TOKEN).");
    }

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CF_AI_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Cloudflare AI error (${model}): ${JSON.stringify(err)}`);
    }

    return response.json();
}

// ── Code Extraction Helper ────────────────────────────────────

/**
 * Extract code from a response that might be wrapped in markdown code fences.
 */
export function extractCode(text: string, language?: string): string {
    // Try language-specific fence first
    if (language) {
        const langRegex = new RegExp(`\`\`\`${language}\\s*\\n([\\s\\S]*?)\`\`\``, "i");
        const match = text.match(langRegex);
        if (match?.[1]) return match[1].trim();
    }

    // Try generic fence
    const genericMatch = text.match(/```\w*\s*\n([\s\S]*?)```/i);
    if (genericMatch?.[1]) return genericMatch[1].trim();

    // No fences — return as-is
    return text.trim();
}
