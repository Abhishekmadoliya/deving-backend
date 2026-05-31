import fs from "fs";

async function main() {
    console.log("Starting Pollinations.ai image generation...");
    
    try {
        // High-fidelity base prompt focusing on premium UI design details
        const rawPrompt = "Stunning modern SaaS dashboard UI, dark mode glassmorphism, sleek sidebar navigation, elegant data visualizations with vibrant glowing neon accents (purple and cyan), ultra high resolution, clean typography (Inter font), professional Dribbble shot, photorealistic 8k render, hyperdetailed UI/UX mockup";
        const prompt = encodeURIComponent(rawPrompt);
        
        // nologo=true removes the watermark
        // model=flux explicitly uses the FLUX model
        // enhance=true uses Pollinations' internal LLM to heavily optimize the prompt for maximum quality!
        const url = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&model=flux&nologo=true&enhance=true`;
        
        console.log(`Fetching from: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        fs.writeFileSync("pollinations_output.png", buffer);
        console.log("Success! Saved image to pollinations_output.png");
    } catch (error) {
        console.error("Error generating image:", error);
    }
}

await main();
