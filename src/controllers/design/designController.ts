import type { Request, Response } from 'express';
import { systemPromptGenerateDesign } from '../../services/prompts/prompt.generateDesign.js';
import { generateUI } from '../../services/design/designService.js';
import { UserSession } from '../../models/user.session.js';
import { imageQueue } from '../../queues/imageQueue.js';
import enhancePrompt from '../../services/prompts/enhancePrompt.js';

type GenerateDesignControllerInput = {
    prompt: string;
    theme: string;
    variantCount: number;
};

// export async function handleGenerateDesign(req: Request, res: Response) {
//     try {
//         console.log("req.body", JSON.stringify(req.body));

//         const { prompt, theme, variantCount } = req.body;
//         // generate design prompt using systemPromptGenerateDesign
//         const designPrompt = systemPromptGenerateDesign({
//             prompt: prompt,
//             type: "web",
//             theme: theme,
//             style: "modern",
//             industry: "tech",
//             colorPreference: "dark"
//         })

//         // create session for user to begin generating design ,the first step is creating ui 

//         // const designSession = await createDesignSession({
//         //     designPrompt,
//         //     userId: req.user.userId,
//         //     variantCount,
//         // })

//         // generate ui using that prompt
//         const designResult = await generateUI({
//             designInitials: {
//                 designPrompt: designPrompt,
//                 variantCount: variantCount,
//             }
//         })


//         return res.status(200).json({
//             status: 200,
//             message: "Design generated successfully",
//             data: designResult
//         })
//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 500,
//             message: "Internal server error",
//             error: error
//         })
//     }
// }


export async function handleCreateDesignSession(req: Request, res: Response) {
    try {

        const { designPrompt, model, type } = req.body;
        const refferenceImages = req.files as Express.Multer.File[];
        
        // Pass the file paths to the worker instead of converting to integer arrays here
        const filePaths = refferenceImages ? refferenceImages.map((file) => file.path) : [];

        console.log("user", req.user);

        // create document for the session
        const newUserSession = new UserSession({
            userId: req.user?._id,
            designPrompt: designPrompt,
            model: model || "flux",
        })

        await newUserSession.save();

        await imageQueue.add("generate-design", {
            designPrompt: designPrompt,
            userId: req.user?._id,
            sessionId: newUserSession._id,
            variantCount: req.body.variantCount,
            model: model || "flux",
            type: type || "web",
            referenceImagePaths: filePaths
        })

        return res.status(201).json({
            status: 201,
            message: "Design session created successfully",
            data: newUserSession._id
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error
        })
    }
}


export async function handleGetDesignSession(req: Request, res: Response) {
    try {
        const { sessionId } = req.params;
        const session = await UserSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({
                status: 404,
                message: "Design session not found",
            })
        }

        // fetch result from background processing using jobId
        // const result = await imageQueue.getJob(session.jobId as string)
        // const demoResultImageUrl: string = "https://imgs.search.brave.com/FtX06_olhnkXqJ1ntNuuH3zakbIBQhhaE_RTQiirlow/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pLmdy/YXBoaWNtYW1hLmNv/bS9ibG9nL3dwLWNv/bnRlbnQvdXBsb2Fk/cy8yMDIwLzA3LzA5/MTQ1NjE1L3N0b2Nr/c25hcC1mcmVlLXN0/b2NrLXBob3RvZ3Jh/cGh5LXdlYnNpdGUu/anBn";
        const demoResultImageUrl: string | null = session.imageUrl || null;
        const apiStatus = session.status === "done" ? "success" : session.status;
        const demoResult = [
            {
                imageUrl: demoResultImageUrl,
                variantIndex: 0,
                status: apiStatus,
                error: session.errorMessage || null
            },
            {
                imageUrl: demoResultImageUrl,
                variantIndex: 1,
                status: apiStatus,
                error: session.errorMessage || null
            },
            {
                imageUrl: demoResultImageUrl,
                variantIndex: 2,
                status: apiStatus,
                error: session.errorMessage || null
            }
        ]

        return res.status(200).json({
            status: 200,
            message: "Design session found successfully",
            data: demoResult
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error
        })
    }
}


export async function handleCreateDesign(req: Request, res: Response) {
    try {
        const { designSessionId } = req.params;
        const { designPrompt, model, type } = req.body;

        const refferenceImages = req.files as Express.Multer.File[];
        const filePaths = refferenceImages ? refferenceImages.map((file) => file.path) : [];

        if (!designSessionId) {
            return res.status(400).json({
                status: 400,
                message: "Design session ID is required",
            });
        }

        if (!designPrompt) {
            return res.status(400).json({
                status: 400,
                message: "Prompt is required",
            });
        }

        const designSession = await UserSession.findById(designSessionId);
        if (!designSession) {
            return res.status(404).json({
                status: 404,
                message: "Design session not found",
            })
        }

        // Push current prompt and image metadata to history
        if (designSession.designPrompt) {
            designSession.history = designSession.history || [];
            designSession.history.push({
                prompt: designSession.designPrompt,
                enhancedPrompt: designSession.enhancedPrompt,
                imageUrl: designSession.imageUrl,
                model: designSession.model,
            });
        }

        // Update session details for new generation
        designSession.designPrompt = designPrompt;
        designSession.status = "queued";
        designSession.imageUrl = null;
        designSession.enhancedPrompt = undefined;
        designSession.errorMessage = null;
        if (model) designSession.model = model;

        await designSession.save();

        console.log("background processing started -------------------------------> , ", designSessionId, " for user ", req.user?._id);
        await imageQueue.add("generate-design", {
            designPrompt: designPrompt,
            userId: req.user?._id,
            sessionId: designSessionId,
            variantCount: 1,
            model: model || designSession.model || "flux",
            type: type || "web",
            referenceImagePaths: filePaths
        })

        return res.status(201).json({
            status: 201,
            message: "Design session updated and generation queued successfully",
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error
        })
    }
}