

import { GoogleAuth } from "google-auth-library";
// import { uploadBufferToCloudinary } from "../../config/cloudinary.js";
import { configDotenv } from "dotenv";
import fs from "fs";
import path from "path";



configDotenv();
const PROJECT_ID = process.env.VERTEX_PROJECT_ID;
const LOCATION = "us-central1";
const IMAGE_W = 1200;
const IMAGE_H = 630;
// const COVER_DIR = "blog-covers";

type DesignInput = {
    designPrompt: string;

    variantCount?: number;
};


const auth = new GoogleAuth({
    keyFilename: path.resolve(process.env.VERTEX_KEY_PATH),
    scopes: "https://www.googleapis.com/auth/cloud-platform",
});




export async function generateUI({ designInitials }: { designInitials: DesignInput }) {
    // generate ui using google vertex ai image model and also use gpt-5 for image prompt generation
    try {
        const { designPrompt } = designInitials;

        const imageUrl = await generateCoverImage(designPrompt)

        return {
            imageUrl
        }
    } catch (error) {
        throw error;
    }

}



export async function generateCoverImage(imagePrompt: string) {
    console.log(`[Image] Generating design (Direct Vertex API) for prompt: "${imagePrompt.substring(0, 50)}..."`);

    let rawImageBuffer;

    try {
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();


        const response = await fetch(
            `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/imagen-3.0-generate-001:predict`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    instances: [
                        {
                            prompt: imagePrompt,
                        },
                    ],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: "16:9",
                    },
                }),
            }
        );

        const data = await response.json() as any;

        if (!data.predictions || data.predictions.length === 0) {
            console.error("[Image] Vertex AI API Error:", JSON.stringify(data, null, 2));
            throw new Error("Imagen 3 did not return any predictions.");
        }

        const base64Res = data.predictions[0].bytesBase64Encoded;
        if (!base64Res) throw new Error("No image data in Vertex AI response.");

        rawImageBuffer = Buffer.from(base64Res, "base64");
        console.log("[Image] Vertex AI Imagen generated successfully via direct API.");
    } catch (err: any) {
        console.warn(`[Image] Vertex AI Generation failed (${err.message}).`);
        throw err;
    }

    // Ensure directory exists
    const designsDir = path.resolve("./designs");
    if (!fs.existsSync(designsDir)) {
        fs.mkdirSync(designsDir, { recursive: true });
    }

    // random string generated
    const randomString = Math.random().toString(36).substring(2, 8);
    const filename = `design-${randomString}.png`;
    const filePath = path.join(designsDir, filename);

    // upload  to ./designs
    if (rawImageBuffer) {
        fs.writeFileSync(filePath, rawImageBuffer);
    } else {
        throw new Error("Failed to generate image buffer");
    }


    console.log(`[Image] Design saved locally: ${filePath}`);
    // return `/designs/${filename}`;
    return rawImageBuffer;
}