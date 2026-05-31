// src/workers/utils/promptBuilder.ts
// Builds context-rich prompts for each stage of the pipeline.
// Each builder function returns an array of ChatMessages ready for the AI client.

import type { ChatMessage } from "./aiClient.js";
import type { IProjectBlueprint, IArchitecture } from "../../models/build.model.js";

// ── Stage 1A: Image Analysis Prompt ───────────────────────────

export function buildImageAnalysisPrompt(imageDescription: string): ChatMessage[] {
    return [
        {
            role: "system",
            content: `You are a UI/UX design analyst. You analyze UI screenshots and mockups to extract structural information.
            
Your task: Given a description of a UI image, extract:
1. Pages/screens visible
2. UI components identified (navbar, cards, buttons, forms, etc.)
3. Theme information (colors, font style, layout type)

IMPORTANT: Extract UI structure only. Do not assume business logic. Return ONLY valid JSON.`,
        },
        {
            role: "user",
            content: `Analyze this UI design and extract its structure:

${imageDescription}

Respond with JSON in this exact format:
{
  "pages": ["page1", "page2"],
  "components": ["Navbar", "HeroSection", "CardGrid"],
  "theme": {
    "primaryColor": "#hex",
    "fontStyle": "sans-serif",
    "layout": "sidebar|full-width|centered"
  }
}`,
        },
    ];
}

// ── Stage 1B: Doc Parsing Prompt ──────────────────────────────

export function buildDocParsingPrompt(docContent: string): ChatMessage[] {
    return [
        {
            role: "system",
            content: `You are a technical document analyzer. You extract structured requirements from documentation, API specs, and markdown files.

Your task: Parse the provided documentation and extract:
1. Features described
2. Data models (entities + fields)
3. API routes (method, path, description)
4. Business rules and constraints

Return ONLY valid JSON. No explanation.`,
        },
        {
            role: "user",
            content: `Parse this documentation and extract requirements:

---
${docContent}
---

Respond with JSON in this exact format:
{
  "features": ["feature1", "feature2"],
  "dataModels": [
    { "name": "ModelName", "fields": ["field1", "field2"] }
  ],
  "apiRoutes": [
    { "method": "POST", "path": "/path", "description": "..." }
  ],
  "rules": ["rule1", "rule2"]
}`,
        },
    ];
}

// ── Stage 2: Architecture Planning Prompt ─────────────────────

export function buildArchitecturePlanPrompt(
    blueprint: IProjectBlueprint,
    userPrompt: string,
    stack: { frontend?: string; backend?: string; db?: string }
): ChatMessage[] {
    const userStackDesc = (stack.frontend || stack.backend || stack.db)
        ? `User-requested stack constraints: ${[stack.frontend, stack.backend, stack.db].filter(Boolean).join(", ")}`
        : "No specific stack requested by user.";

    return [
        {
            role: "system",
            content: `You are an expert software architect. You dynamically determine the best technology stack and design file structures, routes, schemas, and component hierarchies based on the user's requirements.

${userStackDesc}

Your task:
1. Infer the optimal "chosenStack" based on the user's prompt (e.g., "Static HTML/CSS", "MERN (React/Node/Mongo)", "PERN", "Django + React", "Vanilla JS"). If the user simply asks for a static file like index.html, choose "Static HTML/CSS".
2. If building a full-stack app, output a complete architecture including routes and schemas.
3. If building a static site or single file, output ONLY the required files in "fileTree", and leave "routes", "schema", "componentHierarchy", and "stateManagement" empty.

Return ONLY valid JSON. No explanation.`,
        },
        {
            role: "user",
            content: `User's request: "${userPrompt}"

Project Blueprint:
${JSON.stringify(blueprint, null, 2)}

Generate the architecture plan. Respond with JSON in this exact format:
{
  "chosenStack": "MERN (React/Node/Mongo)",
  "fileTree": [
    "src/models/User.js",
    "src/routes/auth.js",
    "src/pages/index.jsx",
    "package.json",
    "Dockerfile"
  ],
  "routes": [
    { "method": "POST", "path": "/api/auth/login", "handler": "src/routes/auth.js", "description": "..." }
  ],
  "schema": [
    { "model": "User", "fields": { "email": "String", "password": "String" }, "file": "src/models/User.js" }
  ],
  "componentHierarchy": {
    "App": {
      "Layout": {
        "Navbar": {},
        "Footer": {}
      }
    }
  },
  "stateManagement": "React Context"
}

IMPORTANT: Adapt the output to the complexity of the request. For a simple index.html request, chosenStack should be "Static HTML/CSS" and fileTree should just contain ["index.html"], leaving routes and schema as [], componentHierarchy as {}, and stateManagement as "".`,
        },
    ];
}

// ── Stage 3: Code Generation Prompt (per file) ────────────────

export function buildCodeGenPrompt(
    filePath: string,
    architecture: IArchitecture,
    blueprint: IProjectBlueprint,
    userPrompt: string,
    relatedFiles?: { path: string; content: string }[]
): ChatMessage[] {
    // Determine file type for context
    const isModel = filePath.includes("/models/");
    const isRoute = filePath.includes("/routes/") || filePath.includes("/controllers/");
    const isPage = filePath.includes("/pages/") || filePath.includes("/components/");
    const isConfig = ["package.json", "Dockerfile", ".env.example", "docker-compose.yml"].some((c) =>
        filePath.endsWith(c)
    );
    const isSeed = filePath.includes("/seed/");

    let fileTypeContext = "application file";
    if (isModel) fileTypeContext = "database model/schema";
    else if (isRoute) fileTypeContext = "API route/controller";
    else if (isPage) fileTypeContext = "frontend page/component";
    else if (isConfig) fileTypeContext = "configuration file";
    else if (isSeed) fileTypeContext = "database seed file";

    // Build related files context
    let relatedContext = "";
    if (relatedFiles && relatedFiles.length > 0) {
        relatedContext = "\n\nAlready generated files (use these for imports and consistency):\n";
        for (const rf of relatedFiles) {
            relatedContext += `\n--- ${rf.path} ---\n${rf.content}\n`;
        }
    }

    // Find relevant schema/routes for this file
    const relevantSchema = architecture.schema.filter((s: any) => s.file === filePath);
    const relevantRoutes = architecture.routes.filter((r: any) => r.handler === filePath);

    return [
        {
            role: "system",
            content: `You are an expert full-stack developer. You generate production-quality code for individual files in a project.

Project Tech Stack: ${architecture.chosenStack || "Determined by architecture"}

Rules:
- Generate ONLY the code for the specified file
- Use proper imports and exports
- Follow best practices for the file type and tech stack
- Include necessary error handling
- Add helpful comments where non-obvious
- Do NOT include any explanation — return ONLY the code
- Do NOT wrap the code in markdown code fences
- The code must be complete and functional`,
        },
        {
            role: "user",
            content: `Generate the code for: ${filePath}
File type: ${fileTypeContext}

User's original request: "${userPrompt}"

Project architecture:
- File tree: ${JSON.stringify(architecture.fileTree)}
- Component hierarchy: ${JSON.stringify(architecture.componentHierarchy)}
- State management: ${architecture.stateManagement}

Project features: ${JSON.stringify(blueprint.features)}
Project theme: ${JSON.stringify(blueprint.theme)}
Project pages: ${JSON.stringify(blueprint.pages)}
Project components: ${JSON.stringify(blueprint.components)}

${relevantSchema.length > 0 ? `Schema for this file: ${JSON.stringify(relevantSchema)}` : ""}
${relevantRoutes.length > 0 ? `Routes for this file: ${JSON.stringify(relevantRoutes)}` : ""}
${relatedContext}

Generate the COMPLETE code for ${filePath}. Return ONLY the raw code, no markdown fences, no explanation.`,
        },
    ];
}

// ── Stage 4: Repair Prompt (fix lint/syntax errors) ───────────

export function buildRepairPrompt(
    filePath: string,
    fileContent: string,
    errors: string
): ChatMessage[] {
    return [
        {
            role: "system",
            content: `You are a code repair specialist. Fix only the syntax/lint errors in the provided file. Return only the corrected file. No explanation.`,
        },
        {
            role: "user",
            content: `Fix the errors in this file:

File: ${filePath}

Current code:
${fileContent}

Errors:
${errors}

Return ONLY the corrected file content. No markdown fences, no explanation.`,
        },
    ];
}
