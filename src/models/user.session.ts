import { Schema, model, Types } from "mongoose";

const generationHistorySchema = new Schema(
    {
        prompt: { type: String, required: true },
        enhancedPrompt: { type: String },
        imageUrl: { type: String },
        model: { type: String },
    },
    { _id: false, timestamps: true }
);

const imagemetaSchema = new Schema(
    {
        width: Number,
        height: Number,
        size: Number,       // bytes
        format: String,     // "png" | "webp"
    },
    { _id: false }
);

const userSessionSchema = new Schema(
    {
        // ── Identity (you have these) ──────────────────
        userId: {
            // type: String,
            type: Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        designPrompt: {
            type: String,
            required: true,
        },

        // ── Prompt pipeline ───────────────────────────
        enhancedPrompt: {
            type: String,           // stored after backend enrichment
        },
        model: {
            type: String,
            // enum: ["flux", "dall-e-3", "stable-diffusion"],
            default: "flux",
        },

        // ── Job tracking ──────────────────────────────
        status: {
            type: String,
            enum: ["queued", "processing", "done", "failed"],
            default: "queued",
        },
        jobId: {
            type: String,           // BullMQ job ID for lookup/cancellation
        },

        // ── Image output ──────────────────────────────
        imageUrl: {
            type: String,           // GCS public / signed URL
        },
        imageMeta: {
            type: imagemetaSchema,
        },

        // ── Error state ───────────────────────────────
        errorMessage: {
            type: String,           // populated only when status === "failed"
        },
        retryCount: {
            type: Number,
            default: 0,
        },

        // ── Regeneration history ──────────────────────
        history: {
            type: [generationHistorySchema],
            default: [],            // append previous gen before each PATCH
        },
    },
    {
        timestamps: true,         // adds createdAt + updatedAt automatically
    }
);

// ── Indexes ────────────────────────────────────────
userSessionSchema.index({ userId: 1, createdAt: -1 }); // list user's sessions
userSessionSchema.index({ jobId: 1 });                  // worker callback lookup
userSessionSchema.index({ status: 1 });                 // queue monitor / admin

export const UserSession = model("UserSession", userSessionSchema);