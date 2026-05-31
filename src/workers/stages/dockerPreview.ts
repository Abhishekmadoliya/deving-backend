// src/workers/stages/dockerPreview.ts
// Stage 5 — Docker Preview (Placeholder)
// In the future, this will spin up a Docker container with the generated code
// and expose it via a preview URL. For now, it's a no-op that logs completion.

import { Build } from "../../models/build.model.js";
import { publishLog } from "../utils/publishEvent.js";

// ── Stage 5 Entry Point ───────────────────────────────────────

/**
 * Docker preview stage (placeholder).
 * 
 * Future implementation will:
 * 1. Pull generated files from GCS
 * 2. Spin up a Docker container with the project
 * 3. Configure nginx reverse proxy for preview-{buildId}.platform.com
 * 4. Set builds.previewUrl
 * 
 * For now: marks the build as ready without a preview URL.
 */
export async function runDockerPreview(buildId: string): Promise<void> {
    await publishLog(buildId, "Docker preview: skipped (not yet implemented)", "info");
    await publishLog(buildId, "Build is available for download", "info");

    // Future: Set previewUrl here
    // await Build.updateOne({ buildId }, { $set: { previewUrl: `https://preview-${buildId}.platform.com` } });
}
