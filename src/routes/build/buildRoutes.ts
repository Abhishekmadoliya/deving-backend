// src/routes/build/buildRoutes.ts
// API routes for the code generation pipeline.

import { Router } from "express";
import {
    handleCreateBuild,
    handleGetBuildStream,
    handleGetBuild,
    handleListBuilds,
    handleDownloadBuildInzip,
} from "../../controllers/build/buildController.js";
import { checkAuthorization } from "../../middleware/checkAuthorization.js";
import buildUpload from "../../lib/buildUpload.js";

const buildRouter = Router();

// POST /api/v1/build — Create a new build (multipart: prompt + images + docs)
buildRouter.post(
    "/",
    checkAuthorization,
    buildUpload.fields([
        { name: "images", maxCount: 10 },
        { name: "docs", maxCount: 10 },
    ]),
    handleCreateBuild
);

// GET /api/v1/build/:buildId/stream — SSE real-time stream
buildRouter.get("/:buildId/stream", handleGetBuildStream);

// GET /api/v1/build/:buildId — Get build details (status, files, etc.)
buildRouter.get("/:buildId", checkAuthorization, handleGetBuild);

// GET /api/v1/build — List all builds for the authenticated user
buildRouter.get("/", checkAuthorization, handleListBuilds);

// POST /api/v1/build/download/:buildId
buildRouter.post("/download/:buildId", checkAuthorization, handleDownloadBuildInzip)

export default buildRouter;
