# Platform Builder — System Architecture Context

> **Purpose:** This document is the canonical context file for any AI agent, developer, or LLM working on the Prompt-to-Platform backend. Every decision, contract, model usage, and data shape is defined here. Do not assume anything not stated in this file.

---

## 1. What This System Does

A user submits a natural language prompt, optional UI images (mockups, screenshots), and optional documentation (PDFs, markdown, API specs). The system autonomously generates a fully functional, multi-file application — frontend + backend + database schema — streams the generation progress to the user in real time, runs the code in a Docker sandbox, and returns a live preview URL and downloadable zip.

---

## 2. Tech Stack (Locked)

| Layer | Technology |
|---|---|
| API Server | Node.js + Express |
| Frontend | Next.js |
| Database (metadata) | MongoDB |
| File Storage (code/blobs) | S3 (or GCS) |
| Job Queue | BullMQ |
| Cache + Pub/Sub | Redis |
| Containerization | Docker + Docker Compose |
| AI — Primary | Ollama, Vertex ai, Groq |
| AI — Vision | cloudflare workers ai (image analysis) , Imagen by vertex ai |

**Do not suggest replacing any of the above.** Extensions are allowed; substitutions are not.

---

## 3. High-Level Data Flow

```
User Input (prompt + images + docs)
        │
        ▼
[POST /api/v1/build]  ←── Express API Server
        │
        ├─── Write build record → MongoDB (status: "queued")
        ├─── Upload files → S3
        ├─── Enqueue MainBuildJob → BullMQ
        │
        ▼
   Return { buildId, streamUrl } to client immediately
        │
        ▼
[GET /api/v1/build/:buildId/stream]  ←── SSE connection
        │
        ▼ (Redis pub/sub bridge)
BullMQ Workers (Node processes)
        │
        ├── Stage 1: Analysis (parallel)
        ├── Stage 2: Architecture Planning
        ├── Stage 3: Code Generation (parallel batch)
        ├── Stage 4: Assembly + Lint + Repair
        └── Stage 5: Docker Preview Spin-up
        │
        ▼
MongoDB (metadata) + S3 (files) + Docker (preview container)
```

---

## 4. API Contracts

### 4.1 POST `/api/v1/build`

**Request (multipart/form-data)**

```
prompt       string       required   Natural language description of the app
images       File[]       optional   UI mockups, screenshots (PNG, JPG, WEBP)
docs         File[]       optional   PDFs, markdown, OpenAPI specs
stack        JSON string  optional   { frontend: string, backend: string, db: string }
```

**Response 202**

```json
{
  "buildId": "uuid-v4",
  "streamUrl": "/api/v1/build/:buildId/stream",
  "status": "queued"
}
```

**Behavior:**
- Immediately writes to MongoDB, enqueues job, returns `buildId`.
- Does NOT wait for AI processing.
- Client must connect to `streamUrl` to receive real-time updates.

---

### 4.2 GET `/api/v1/build/:buildId/stream`

**Protocol:** Server-Sent Events (SSE)

**Headers set by server:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**SSE Event Schema — all events are JSON in `data:` field**

```jsonc
// Stage progress
{ "type": "stage", "stage": "analyzing_images", "progress": 10 }
{ "type": "stage", "stage": "parsing_docs", "progress": 15 }
{ "type": "stage", "stage": "planning_architecture", "progress": 25 }
{ "type": "stage", "stage": "generating_code", "progress": 40 }
{ "type": "stage", "stage": "assembling", "progress": 80 }
{ "type": "stage", "stage": "docker_preview", "progress": 95 }

// File-level streaming (real-time code generation)
{ "type": "file_start", "path": "src/models/User.js" }
{ "type": "file_chunk", "path": "src/models/User.js", "chunk": "const mongoose = require..." }
{ "type": "file_done", "path": "src/models/User.js", "s3Key": "builds/abc/src/models/User.js" }

// Error (non-fatal — worker failed, retrying)
{ "type": "error", "stage": "api_worker", "file": "src/routes/auth.js", "message": "...", "retrying": true }

// Fatal error
{ "type": "fatal", "message": "Build failed after max retries", "buildId": "..." }

// Completion
{ "type": "complete", "previewUrl": "https://preview-{buildId}.platform.com", "downloadUrl": "https://..." }
```

**Implementation pattern (Express):**

```javascript
app.get('/api/v1/build/:buildId/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const subscriber = redis.duplicate()
  await subscriber.subscribe(`build:${req.params.buildId}`)

  subscriber.on('message', (channel, message) => {
    res.write(`data: ${message}\n\n`)
  })

  req.on('close', () => {
    subscriber.unsubscribe()
    subscriber.quit()
  })
})
```

---

### 4.3 GET `/api/v1/build/:buildId`

Returns full build record from MongoDB. Used to restore state on page refresh.

**Response:**

```json
{
  "buildId": "...",
  "status": "generating | complete | failed",
  "progress": 65,
  "files": [{ "path": "...", "status": "done", "s3Key": "..." }],
  "previewUrl": "...",
  "downloadUrl": "...",
  "cost": { "inputTokens": 12400, "outputTokens": 8900, "usdCost": 0.14 }
}
```

---

## 5. MongoDB Schema

### Collection: `builds`

```javascript
{
  _id: ObjectId,
  buildId: String,           // uuid-v4, used as public reference
  userId: ObjectId,          // ref: users collection
  status: String,            // "queued" | "analyzing" | "planning" | "generating" | "assembling" | "previewing" | "complete" | "failed"
  progress: Number,          // 0–100

  input: {
    prompt: String,
    imageUrls: [String],     // S3 URLs of uploaded images
    docUrls: [String],       // S3 URLs of uploaded docs
    stack: {
      frontend: String,
      backend: String,
      db: String
    }
  },

  blueprint: {               // Output of Stage 1
    pages: [String],
    components: [String],
    theme: Object,
    features: [String],
    dataModels: [Object],
    apiRoutes: [Object],
    rules: [String]
  },

  architecture: {            // Output of Stage 2
    fileTree: [String],
    routes: [Object],
    schema: [Object],
    componentHierarchy: Object,
    stateManagement: String
  },

  files: [{
    path: String,            // e.g. "src/models/User.js"
    s3Key: String,
    status: String,          // "pending" | "generating" | "done" | "error"
    generatedAt: Date,
    retries: Number
  }],

  previewUrl: String,
  downloadUrl: String,

  cost: {
    inputTokens: Number,
    outputTokens: Number,
    usdCost: Number
  },

  error: String,             // populated on fatal failure
  createdAt: Date,
  updatedAt: Date,
  completedAt: Date
}
```

---

## 6. BullMQ Job Architecture

### Job Hierarchy (BullMQ Flow API)

```
MainBuildJob (parent)
  │
  ├── AnalysisJob (parallel children)
  │     ├── ImageAnalysisJob
  │     └── DocParsingJob
  │
  ├── ArchitecturePlanJob          ← waits for AnalysisJob
  │
  ├── CodeGenJobs (parallel batch) ← waits for ArchitecturePlanJob
  │     ├── SchemaGenJob           → generates: src/models/*.js
  │     ├── ApiRoutesGenJob        → generates: src/routes/*.js
  │     ├── FrontendPagesJob       → generates: src/pages/*.jsx (further split by page)
  │     ├── ConfigGenJob           → generates: package.json, Dockerfile, .env.example
  │     └── DbSeedJob              → generates: src/seed/*.js
  │
  ├── AssemblyJob                  ← waits for all CodeGenJobs
  │
  └── DockerPreviewJob             ← waits for AssemblyJob
```

**Queue names:**
- `build:main`
- `build:analysis`
- `build:architecture`
- `build:codegen`
- `build:assembly`
- `build:preview`

**Each job must:**
1. Update `builds.status` in MongoDB at start
2. Publish progress events to `Redis` channel `build:{buildId}`
3. On failure: retry up to 3 times, then emit `fatal` event

---

## 7. AI Pipeline — Stage by Stage

### Stage 1A — Image Analysis

**Trigger:** ImageAnalysisJob  
**Model:** `gpt-4o` (vision) or `claude-sonnet-4-20250514`  
**Input:** Base64-encoded images from S3  
**Output shape:**

```json
{
  "pages": ["Landing", "Dashboard", "Login"],
  "components": ["Navbar", "HeroSection", "CardGrid", "Footer"],
  "theme": {
    "primaryColor": "#2563EB",
    "fontStyle": "sans-serif",
    "layout": "sidebar"
  }
}
```

**System prompt directive:** Extract UI structure only. No assumptions about business logic.

---

### Stage 1B — Doc/Spec Parsing

**Trigger:** DocParsingJob  
**Model:** `claude-sonnet-4-20250514` (long context)  
**Input:** Raw text extracted from PDFs/markdown  
**Output shape:**

```json
{
  "features": ["user authentication", "dashboard analytics", "export to CSV"],
  "dataModels": [
    { "name": "User", "fields": ["email", "passwordHash", "role", "createdAt"] }
  ],
  "apiRoutes": [
    { "method": "POST", "path": "/auth/login", "description": "..." }
  ],
  "rules": ["All routes require JWT auth except /auth/*", "Role: admin can delete users"]
}
```

---

### Stage 1 Merge → `ProjectBlueprint`

Merge outputs of 1A and 1B into a single `ProjectBlueprint` object. Save to `builds.blueprint` in MongoDB.

---

### Stage 2 — Architecture Planning

**Model:** `claude-sonnet-4-20250514`  
**Input:** `ProjectBlueprint` + raw user `prompt`  
**Method:** Claude tool use (guaranteed structured JSON)

```javascript
tools: [{
  name: "generate_architecture",
  input_schema: {
    type: "object",
    properties: {
      fileTree: { type: "array", items: { type: "string" } },
      routes: { type: "array" },
      schema: { type: "array" },
      componentHierarchy: { type: "object" },
      stateManagement: { type: "string" }
    },
    required: ["fileTree", "routes", "schema"]
  }
}],
tool_choice: { type: "tool", name: "generate_architecture" }
```

Output saved to `builds.architecture`. Emitted via SSE as `{ type: "stage", stage: "planning_architecture", progress: 25 }`.

---

### Stage 3 — Code Generation (Per Worker)

**All workers follow this pattern:**

```javascript
// 1. Get assigned slice from ProjectArchitecture
// 2. Build file-specific prompt with full context
// 3. Stream from Claude API
// 4. Publish each chunk to Redis pub/sub
// 5. Save completed file to S3
// 6. Update builds.files[] in MongoDB

const stream = await anthropic.messages.stream({
  model: 'claude-sonnet-4-20250514',  // or claude-haiku-4-5-20251001 for simple files
  max_tokens: 8000,
  messages: [
    { role: 'user', content: buildFilePrompt(file, architecture, blueprint) }
  ]
})

let buffer = ''
await redis.publish(`build:${buildId}`, JSON.stringify({ type: 'file_start', path: file.path }))

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    const chunk = event.delta.text
    buffer += chunk
    await redis.publish(`build:${buildId}`, JSON.stringify({
      type: 'file_chunk',
      path: file.path,
      chunk
    }))
  }
}

// Save to S3
await s3.putObject({ Bucket: BUCKET, Key: s3Key, Body: buffer })
await db.collection('builds').updateOne(
  { buildId, 'files.path': file.path },
  { $set: { 'files.$.status': 'done', 'files.$.s3Key': s3Key } }
)

await redis.publish(`build:${buildId}`, JSON.stringify({ type: 'file_done', path: file.path }))
```

**Model assignment per worker:**

| Worker | File Types | Model |
|---|---|---|
| SchemaGenJob | `src/models/*.js` | `claude-haiku-4-5-20251001` |
| ApiRoutesGenJob | `src/routes/*.js`, `src/controllers/*.js` | `claude-sonnet-4-20250514` |
| FrontendPagesJob | `src/pages/*.jsx`, `src/components/*.jsx` | `claude-sonnet-4-20250514` |
| ConfigGenJob | `package.json`, `Dockerfile`, `.env.example` | `claude-haiku-4-5-20251001` |
| DbSeedJob | `src/seed/*.js` | `claude-haiku-4-5-20251001` |

---

### Stage 4 — Assembly + Validation + Repair Loop

**Steps:**
1. Pull all generated files from S3
2. Reconstruct file tree in `/builds/{buildId}/` directory
3. Run ESLint inside a Docker container: `docker run --rm -v /builds/{buildId}:/app node:20 npx eslint /app --ext .js,.jsx`
4. Parse ESLint output → identify broken files
5. **Repair loop** (max 2 retries per file):
   - Send broken file content + ESLint error to Claude Sonnet
   - System prompt: "Fix only the syntax/lint errors. Return only the corrected file. No explanation."
   - Replace file in S3 + directory
6. Zip entire directory → upload to S3 as `builds/{buildId}/build.zip`
7. Generate signed download URL

---

### Stage 5 — Docker Preview

```bash
# Isolated directory per build
cd /builds/{buildId}

# Spin up generated project
docker-compose up -d --build

# Map to subdomain via nginx reverse proxy
# preview-{buildId}.platform.com → localhost:{assignedPort}
```

Emit final SSE event:
```json
{ "type": "complete", "previewUrl": "https://preview-{buildId}.platform.com", "downloadUrl": "https://s3.../build.zip" }
```

---

## 8. Redis Usage

### Pub/Sub Channels

| Channel | Publisher | Subscriber |
|---|---|---|
| `build:{buildId}` | All BullMQ workers | Express SSE endpoint |

### BullMQ Queues (Redis keys managed by BullMQ)

- `bull:build:main`
- `bull:build:analysis`
- `bull:build:architecture`
- `bull:build:codegen`
- `bull:build:assembly`
- `bull:build:preview`

**Critical:** Redis pub/sub and BullMQ use the same Redis instance but operate on separate key namespaces. No conflict.

---

## 9. S3 Key Structure

```
builds/{buildId}/input/images/{filename}        ← user-uploaded images
builds/{buildId}/input/docs/{filename}          ← user-uploaded docs
builds/{buildId}/src/models/User.js             ← generated code files (mirrors project structure)
builds/{buildId}/src/routes/auth.js
builds/{buildId}/build.zip                      ← final downloadable zip
```

---

## 10. Cost Tracking

Every AI API call must record token usage:

```javascript
// After each API call, update MongoDB
await db.collection('builds').updateOne({ buildId }, {
  $inc: {
    'cost.inputTokens': response.usage.input_tokens,
    'cost.outputTokens': response.usage.output_tokens,
    'cost.usdCost': calculateCost(response.usage, model)
  }
})
```

**Pricing reference (as of architecture design):**

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| claude-sonnet-4-20250514 | $3.00 | $15.00 |
| claude-haiku-4-5-20251001 | $0.25 | $1.25 |
| gpt-4o | $2.50 | $10.00 |

---

## 11. Error Handling Rules

- **Worker failure (non-fatal):** Retry up to 3 times via BullMQ `attempts: 3`. Emit `{ type: "error", retrying: true }` via SSE on each retry.
- **Worker failure (fatal after retries):** Set `builds.status = "failed"`, emit `{ type: "fatal" }` via SSE, stop all child jobs.
- **Repair loop:** Max 2 repair attempts per file. If still broken after 2 attempts, mark file as `error` but do not fail entire build. Include error comment in file header.
- **Docker preview failure:** Non-fatal. Build is still marked `complete`. Emit `complete` event without `previewUrl`, include `downloadUrl` only.
- **SSE client disconnect:** Unsubscribe from Redis, close subscriber connection. Build job continues in background. Client can reconnect and resume via GET `/api/v1/build/:buildId`.

---

## 12. Environment Variables Required

```bash
# Server
PORT=3000
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb+srv://...

# Redis
REDIS_URL=redis://...

# S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
S3_BUCKET=platform-builds

# AI APIs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Docker
PREVIEW_DOMAIN=platform.com
PREVIEW_PORT_RANGE_START=4000
PREVIEW_PORT_RANGE_END=5000

# Build limits
MAX_BUILD_DURATION_MS=300000    # 5 minutes
MAX_FILES_PER_BUILD=50
MAX_REPAIR_RETRIES=2
MAX_JOB_RETRIES=3
```

---

## 13. What Agents Should NOT Do

- Do not use LangChain for orchestration. BullMQ is the orchestrator.
- Do not use LangGraph. The pipeline is deterministic; graph-based flow adds unnecessary complexity.
- Do not store code file contents in MongoDB. Store only S3 keys.
- Do not call AI APIs directly from the Express route handlers. All AI work happens inside BullMQ workers.
- Do not use WebSockets for streaming. Use SSE (simpler, no bidirectional need).
- Do not generate entire app in a single LLM prompt. Always split by file/worker type.
- Do not skip cost tracking on any API call.

---

## 14. Agent Task Entrypoints

When an AI agent receives a task related to this system, use this map:

| Task | Start here |
|---|---|
| Add a new file type to code generation | Section 7, Stage 3 — add a new worker + update BullMQ job hierarchy (Section 6) |
| Change streaming behavior | Section 4.2 + Section 8 |
| Add a new API endpoint | Section 4 — follow existing contract pattern |
| Modify MongoDB schema | Section 5 |
| Change AI model for a specific stage | Section 7 — model assignment table |
| Debug a failed build | Section 11 — error handling rules |
| Add cost controls | Section 10 + Section 12 (env vars) |
| Change preview mechanism | Section 7, Stage 5 |

---

*Last updated: 2026-05-30 | Stack version: Node 20, BullMQ 5.x, Redis 7.x, MongoDB 7.x*