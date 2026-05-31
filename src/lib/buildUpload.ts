// src/lib/buildUpload.ts
// Multer config for build uploads — accepts images + docs (PDF, markdown, OpenAPI specs).

import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = "uploads/builds";

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});

const ALLOWED_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const ALLOWED_DOC_EXTS = [".pdf", ".md", ".txt", ".yaml", ".yml", ".json"];
const ALL_ALLOWED = [...ALLOWED_IMAGE_EXTS, ...ALLOWED_DOC_EXTS];

const buildUpload = multer({
    storage,
    limits: {
        fileSize: 1024 * 1024 * 50, // 50 MB per file
        files: 20, // max 20 files per request
    },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALL_ALLOWED.includes(ext)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    `File type '${ext}' not allowed. Allowed: ${ALL_ALLOWED.join(", ")}`
                )
            );
        }
    },
});

/**
 * Checks if a file is an image based on its extension.
 */
export function isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ALLOWED_IMAGE_EXTS.includes(ext);
}

/**
 * Checks if a file is a document based on its extension.
 */
export function isDocFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ALLOWED_DOC_EXTS.includes(ext);
}

export default buildUpload;
