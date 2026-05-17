import { Storage } from "@google-cloud/storage";
import dotenv from "dotenv";

dotenv.config();

const storage = new Storage({
    keyFilename: process.env.GCS_KEY_PATH as string,
});

export const bucket = storage.bucket(process.env.GCS_IMAGE_BUCKET as string);