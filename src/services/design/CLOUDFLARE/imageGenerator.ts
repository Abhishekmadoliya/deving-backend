// lib/cloudflareImageGen.js

const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/**
 * Generate UI design image from a text prompt
 * @param {string} prompt - User's UI description
 * @returns {Buffer} - PNG image buffer
 */
export async function callCloudflareImageGenerator(prompt: string) {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
    const CF_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;

    const systemPrompt = buildUIPrompt(prompt);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CF_AI_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt: systemPrompt,
                num_steps: 8,        // flux-schnell max is 8
                width: 1024,
                height: 768,         // landscape for UI mockups
            }),
        }
    );

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Cloudflare AI error: ${JSON.stringify(err.errors)}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const jsonResponse = await response.json();
        if (jsonResponse.result && jsonResponse.result.image) {
            return Buffer.from(jsonResponse.result.image, "base64");
        }
        throw new Error(`Unexpected JSON response format: ${JSON.stringify(jsonResponse)}`);
    }

    // Fallback: Returns raw binary (image/png) if the API returned it directly
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

function buildUIPrompt(userInput: string) {
    return `A clean, modern UI design mockup: ${userInput}. 
    High fidelity wireframe, professional UI/UX design, 
    clean typography, proper spacing, light theme, 
    web application interface, desktop layout, 
    no text artifacts, photorealistic UI screenshot style`;
}


