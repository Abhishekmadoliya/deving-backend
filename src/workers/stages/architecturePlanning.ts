// src/workers/stages/architecturePlanning.ts
// Stage 2 — Uses Ollama to plan the complete project architecture.
// Input: ProjectBlueprint + user prompt
// Output: { fileTree, routes, schema, componentHierarchy, stateManagement }

import { Build, type IArchitecture, type IProjectBlueprint } from "../../models/build.model.js";
import { chatJSON, MODELS } from "../utils/aiClient.js";
import { buildArchitecturePlanPrompt } from "../utils/promptBuilder.js";
import { publishLog } from "../utils/publishEvent.js";
import { trackCost } from "../utils/costTracker.js";

// ── Stage 2 Entry Point ───────────────────────────────────────

/**
 * Plan the full application architecture based on the blueprint.
 * Returns a structured architecture plan with file tree, routes, schemas, etc.
 */
export async function runArchitecturePlanning(buildId: string): Promise<IArchitecture> {
    const build = await Build.findOne({ buildId });
    if (!build) throw new Error(`Build ${buildId} not found`);

    const blueprint = build.blueprint;
    if (!blueprint) throw new Error(`Build ${buildId} has no blueprint — run analysis first`);

    await publishLog(buildId, "Planning application architecture...");

    const stack = build.input.stack || {};
    const messages = buildArchitecturePlanPrompt(blueprint, build.input.prompt, stack);

    const response = await chatJSON<IArchitecture>(messages, MODELS.CODER, {
        temperature: 0.3,
        maxTokens: 8000,
    });

    // Track cost
    await trackCost(buildId, {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        model: MODELS.CODER,
    });

    const architecture = response.data;

    // Validate architecture has a file tree
    if (!architecture.fileTree || architecture.fileTree.length === 0) {
        throw new Error("Architecture planning returned empty file tree");
    }

    // Sanitize stateManagement to avoid CastError if AI returns an object {} instead of ""
    if (typeof architecture.stateManagement === "object") {
        architecture.stateManagement = "";
    } else if (architecture.stateManagement !== undefined) {
        architecture.stateManagement = String(architecture.stateManagement);
    }

    // Save to MongoDB
    await Build.updateOne(
        { buildId },
        { $set: { architecture } }
    );

    // Initialize files array with pending status for each file in the tree
    const files = architecture.fileTree.map((filePath) => ({
        path: filePath,
        s3Key: "",
        status: "pending" as const,
        retries: 0,
    }));

    await Build.updateOne(
        { buildId },
        { $set: { files } }
    );

    await publishLog(
        buildId,
        `Architecture planned using ${architecture.chosenStack || 'inferred'} stack: ${architecture.fileTree.length} files, ${architecture.routes?.length ?? 0} routes, ${architecture.schema?.length ?? 0} schemas`
    );

    return architecture;
}
