// src/models/build.model.ts
// MongoDB schema for the `builds` collection — tracks entire code generation lifecycle.

import mongoose, { Schema, type Document, type Types } from "mongoose";

// ── Type Definitions ──────────────────────────────────────────

export type BuildStatus =
    | "queued"
    | "analyzing"
    | "planning"
    | "generating"
    | "assembling"
    | "previewing"
    | "complete"
    | "failed";

export type FileStatus = "pending" | "generating" | "done" | "error";

export interface IBuildFile {
    path: string;
    s3Key: string;
    status: FileStatus;
    generatedAt?: Date;
    retries: number;
}

export interface IProjectBlueprint {
    pages: string[];
    components: string[];
    theme: Record<string, unknown>;
    features: string[];
    dataModels: Record<string, unknown>[];
    apiRoutes: Record<string, unknown>[];
    rules: string[];
}

export interface IArchitecture {
    chosenStack?: string;
    fileTree: string[];
    routes?: Record<string, unknown>[];
    schema?: Record<string, unknown>[];
    componentHierarchy?: Record<string, unknown>;
    stateManagement?: string;
}

export interface IBuild extends Document {
    buildId: string;
    userId: Types.ObjectId;
    status: BuildStatus;
    progress: number;

    input: {
        prompt: string;
        imageUrls: string[];
        docUrls: string[];
        stack: {
            frontend?: string;
            backend?: string;
            db?: string;
        };
    };

    blueprint: IProjectBlueprint | null;
    architecture: IArchitecture | null;

    files: IBuildFile[];

    previewUrl: string | null;
    downloadUrl: string | null;

    cost: {
        inputTokens: number;
        outputTokens: number;
        usdCost: number;
    };

    error: string | null;

    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
}

// ── Sub-schemas ───────────────────────────────────────────────

const buildFileSchema = new Schema<IBuildFile>(
    {
        path: { type: String, required: true },
        s3Key: { type: String, default: "" },
        status: {
            type: String,
            enum: ["pending", "generating", "done", "error"],
            default: "pending",
        },
        generatedAt: { type: Date },
        retries: { type: Number, default: 0 },
    },
    { _id: false }
);

const stackSchema = new Schema(
    {
        frontend: { type: String },
        backend: { type: String },
        db: { type: String },
    },
    { _id: false }
);

const inputSchema = new Schema(
    {
        prompt: { type: String, required: true },
        imageUrls: { type: [String], default: [] },
        docUrls: { type: [String], default: [] },
        stack: { type: stackSchema, default: () => ({}) },
    },
    { _id: false }
);

const blueprintSchema = new Schema(
    {
        pages: { type: [String], default: [] },
        components: { type: [String], default: [] },
        theme: { type: Schema.Types.Mixed, default: {} },
        features: { type: [String], default: [] },
        dataModels: { type: Schema.Types.Mixed, default: [] },
        apiRoutes: { type: Schema.Types.Mixed, default: [] },
        rules: { type: [String], default: [] },
    },
    { _id: false }
);

const architectureSchema = new Schema(
    {
        chosenStack: { type: String, default: "" },
        fileTree: { type: [String], default: [] },
        routes: { type: Schema.Types.Mixed, default: [] },
        schema: { type: Schema.Types.Mixed, default: [] },
        componentHierarchy: { type: Schema.Types.Mixed, default: {} },
        stateManagement: { type: String, default: "" },
    },
    { _id: false }
);

const costSchema = new Schema(
    {
        inputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        usdCost: { type: Number, default: 0 },
    },
    { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────

const buildSchema = new Schema<IBuild>(
    {
        buildId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        status: {
            type: String,
            enum: [
                "queued",
                "analyzing",
                "planning",
                "generating",
                "assembling",
                "previewing",
                "complete",
                "failed",
            ],
            default: "queued",
        },
        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        input: {
            type: inputSchema,
            required: true,
        },

        blueprint: {
            type: blueprintSchema,
            default: null,
        },
        architecture: {
            type: architectureSchema,
            default: null,
        },

        files: {
            type: [buildFileSchema],
            default: [],
        },

        previewUrl: { type: String, default: null },
        downloadUrl: { type: String, default: null },

        cost: {
            type: costSchema,
            default: () => ({ inputTokens: 0, outputTokens: 0, usdCost: 0 }),
        },

        error: { type: String, default: null },
        completedAt: { type: Date, default: null },
    },
    {
        timestamps: true, // adds createdAt + updatedAt
    }
);

// ── Indexes ───────────────────────────────────────────────────

buildSchema.index({ userId: 1, createdAt: -1 });  // list user's builds
buildSchema.index({ status: 1 });                  // admin / queue monitor

// ── Model Export ──────────────────────────────────────────────

export const Build = mongoose.model<IBuild>("Build", buildSchema);
