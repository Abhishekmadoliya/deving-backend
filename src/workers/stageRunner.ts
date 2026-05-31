// src/workers/stageRunner.ts
// Utility to run pipeline stages sequentially with error handling,
// MongoDB status updates, and SSE progress publishing.

import { Build, type BuildStatus } from "../models/build.model.js";
import { publishStage, publishLog, publishFatal } from "./utils/publishEvent.js";

// ── Types ─────────────────────────────────────────────────────

export interface StageDefinition {
    /** Display name for logging and SSE events */
    name: string;
    /** SSE stage identifier (e.g., "analyzing_images") */
    stageKey: string;
    /** MongoDB status to set when this stage starts */
    status: BuildStatus;
    /** Progress percentage when this stage starts (0–100) */
    progressStart: number;
    /** Progress percentage when this stage completes */
    progressEnd: number;
    /** The actual work to perform */
    execute: (buildId: string) => Promise<void>;
}

// ── Stage Runner ──────────────────────────────────────────────

/**
 * Run a single stage with error handling and progress tracking.
 * Updates MongoDB and publishes SSE events at start and completion.
 */
export async function runStage(
    buildId: string,
    stage: StageDefinition
): Promise<void> {
    console.log(`[Build:${buildId}] Starting stage: ${stage.name}`);

    // Update MongoDB status
    await Build.updateOne(
        { buildId },
        {
            $set: {
                status: stage.status,
                progress: stage.progressStart,
            },
        }
    );

    // Publish SSE event
    await publishStage(buildId, stage.stageKey, stage.progressStart);
    await publishLog(buildId, `Starting: ${stage.name}`);

    try {
        // Execute the stage
        await stage.execute(buildId);

        // Update progress on completion
        await Build.updateOne(
            { buildId },
            { $set: { progress: stage.progressEnd } }
        );

        await publishStage(buildId, stage.stageKey, stage.progressEnd);
        await publishLog(buildId, `Completed: ${stage.name}`);

        console.log(`[Build:${buildId}] Completed stage: ${stage.name}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Build:${buildId}] Stage failed: ${stage.name}`, error);
        throw error; // Re-throw — the orchestrator decides retry vs fatal
    }
}

/**
 * Run multiple stages sequentially.
 * If any stage fails, the build is marked as failed and a fatal SSE event is emitted.
 */
export async function runPipeline(
    buildId: string,
    stages: StageDefinition[]
): Promise<void> {
    try {
        for (const stage of stages) {
            await runStage(buildId, stage);
        }

        // All stages complete
        await Build.updateOne(
            { buildId },
            {
                $set: {
                    status: "complete",
                    progress: 100,
                    completedAt: new Date(),
                },
            }
        );

        // Fetch the completed build for the SSE event
        const build = await Build.findOne({ buildId });

        const { publishEvent } = await import("./utils/publishEvent.js");
        await publishEvent(buildId, {
            type: "complete",
            previewUrl: build?.previewUrl ?? null,
            downloadUrl: build?.downloadUrl ?? null,
        });

        console.log(`[Build:${buildId}] Pipeline completed successfully`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Mark build as failed
        await Build.updateOne(
            { buildId },
            {
                $set: {
                    status: "failed",
                    error: message,
                },
            }
        );

        // Publish fatal event
        await publishFatal(buildId, `Build failed: ${message}`);

        console.error(`[Build:${buildId}] Pipeline failed:`, message);
        throw error; // Re-throw for BullMQ retry handling
    }
}
