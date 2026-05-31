import { bucket } from "../../../lib/gcs.js";
export default async function uploadToGCS(rawImageBuffer: Buffer, sessionId: string) {

    if (!rawImageBuffer) throw new Error("No image path provided");

    console.log("bucket", bucket);

    const timestamp = Date.now();
    const fileName = `${sessionId}/${timestamp}-image.png`;

    try {
        await bucket.file(fileName).save(rawImageBuffer, {
            metadata: {
                contentType: "image/png",
            },
        }
        );

        const publicUrl = `https://storage.googleapis.com/${process.env.GCS_IMAGE_BUCKET}/${fileName}`;
        console.log(`[GCS] Image uploaded successfully: ${fileName}`);
        return publicUrl
    } catch (error) {
        throw error;
    }
}