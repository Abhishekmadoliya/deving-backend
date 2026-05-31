async function runCloudflareAI(model: string, payload: any): Promise<any> {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
    const CF_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;

    if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
        throw new Error("Missing Cloudflare API credentials in environment variables.");
    }

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CF_AI_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Cloudflare AI error: ${JSON.stringify(err)}`);
    }

    return response.json();
}

export default async function enhancePrompt(
    prompt: string,
    model: string = "flux",
    type: string = "web",
    referenceImages?: any[] // optional array of image byte arrays
): Promise<string> {

    let imageContext = "";


    console.log("prompt: ", prompt);
    console.log("model: ", model);
    console.log("type: ", type);
    console.log("referenceImages: ", referenceImages);

    // Step 1: If reference images are provided, run VLM on each in parallel
    if (referenceImages && referenceImages.length > 0) {
        const vlmResults = await Promise.allSettled(
            referenceImages.map(async (img, index) => {
                const vlmResponse = await runCloudflareAI(
                    "@cf/unum/uform-gen2-qwen-500m",
                    {
                        image: img,
                        prompt:
                            "You are a UI/UX design analyst. Carefully analyze this design image and describe: " +
                            "1) Layout structure and grid system, " +
                            "2) Color palette with approximate hex values, " +
                            "3) Typography style (headings, body, weight), " +
                            "4) Key UI components visible (navbar, cards, buttons, forms), " +
                            "5) Overall visual style (minimal, glassmorphism, flat, neumorphic, etc), " +
                            "6) Spacing and visual hierarchy. " +
                            "Be precise and technical — this will be used to generate a similar design."
                    }
                );

                const description = vlmResponse?.result?.description?.trim();
                if (!description) throw new Error(`Empty VLM response for image ${index + 1}`);
                return `[Reference Image ${index + 1}]:\n${description}`;
            })
        );

        // Collect only successful VLM responses, log failed ones
        const successfulDescriptions = vlmResults
            .map((result, index) => {
                if (result.status === "fulfilled") {
                    return result.value;
                } else {
                    console.error(`VLM failed for image ${index + 1}:`, result.reason);
                    return null;
                }
            })
            .filter(Boolean) as string[];

        imageContext = successfulDescriptions.join("\n\n");
    }

    // Step 2: Determine platform target and model style for meta-prompt
    const platformTarget =
        type === "web"
            ? "web application (desktop + responsive)"
            : "mobile application (iOS/Android style)";

    const modelStyle =
        model.toLowerCase().includes("flux")
            ? "FLUX model — supports detailed natural language, rich scene descriptions, photorealistic or illustrative rendering"
            : model.toLowerCase().includes("stable")
                ? "Stable Diffusion — responds well to structured keyword prompts, style tags, and quality boosters like 'masterpiece, highly detailed, 8k'"
                : "a general-purpose text-to-image model";

    const hasImageContext = imageContext.length > 0;
    const imageCount = referenceImages?.length ?? 0;

    // Step 3: Build meta-prompt
    const metaPrompt = `
You are an expert UI/UX design prompt engineer for AI image generation models.
Your job is to convert a simple user intent into a highly detailed, model-optimized image generation prompt for a ${platformTarget} design.

Target model: ${modelStyle}

User's intent: "${prompt}"

${hasImageContext
            ? `Reference images analysis (${imageCount} image${imageCount > 1 ? "s" : ""} provided — synthesize style, layout, color palette, and component patterns from all references below):\n\n${imageContext}\n`
            : "No reference images provided — infer a suitable design style from the user's intent alone."
        }

Generate ONE enhanced image generation prompt that:
- Describes a complete, polished ${platformTarget} UI screen
- Specifies layout (grid, sidebar, hero section, cards, etc.)
- Specifies color scheme (background, primary, accent colors)
- Describes typography style (modern sans-serif, elegant serif, etc.)
- Lists key UI components visible in the scene
- Mentions visual style (glassmorphism, flat design, dark mode, light minimal, etc.)
${hasImageContext ? "- Incorporates style cues synthesized from the reference images above" : ""}
- Ends with quality/render tags appropriate for the target model
- Is between 80–150 words
- Does NOT include any explanation — only the final prompt text

Return ONLY the enhanced prompt. No preamble, no labels, no quotes.
`.trim();

    // Step 4: Run LLM to generate the enhanced prompt
    try {
        const llmResponse = await runCloudflareAI("@cf/meta/llama-3.1-8b-instruct", {
            prompt: metaPrompt,
            max_tokens: 300,
        });

        const enhancedPrompt = llmResponse?.result?.response?.trim();

        if (!enhancedPrompt) {
            console.warn("LLM returned empty response, falling back to original prompt.");
            return prompt;
        }

        return enhancedPrompt;
    } catch (error) {
        console.error("LLM Prompt Enhancement Error:", error);
        return prompt; // Fallback to original prompt
    }
}