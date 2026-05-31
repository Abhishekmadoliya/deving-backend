import { HfInference } from "@huggingface/inference";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const hf = new HfInference(process.env.HfKey);

async function main() {
    try {
        const result = await hf.textToImage({
            model: "black-forest-labs/FLUX.1-dev",
            inputs: "modern SaaS dashboard UI, dark theme, clean layout",
            parameters: {
                width: 1024,
                height: 1024,
                num_inference_steps: 28,
            }
        });

        const buffer = Buffer.from(await result.arrayBuffer());
        fs.writeFileSync("output.png", buffer);
        console.log("Saved output.png");
    } catch (error) {
        console.error("Inference Error:", error);
    }
}

await main();