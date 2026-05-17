import type { Request, Response } from 'express';
import { systemPromptGenerateDesign } from '../../services/prompts/prompt.generateDesign.js';
import { generateUI } from '../../services/design/designService.js';
import { UserSession } from '../../models/user.session.js';
import { imageQueue } from '../../queues/imageQueue.js';

type GenerateDesignControllerInput = {
    prompt: string;
    theme: string;
    variantCount: number;
};

export async function handleGenerateDesign(req: Request, res: Response) {
    try {
        console.log("req.body", JSON.stringify(req.body));

        const { prompt, theme, variantCount } = req.body;
        // generate design prompt using systemPromptGenerateDesign
        const designPrompt = systemPromptGenerateDesign({
            prompt: prompt,
            type: "web",
            theme: theme,
            style: "modern",
            industry: "tech",
            colorPreference: "dark"
        })

        // create session for user to begin generating design ,the first step is creating ui 

        // const designSession = await createDesignSession({
        //     designPrompt,
        //     userId: req.user.userId,
        //     variantCount,
        // })

        // generate ui using that prompt
        const designResult = await generateUI({
            designInitials: {
                designPrompt: designPrompt,
                variantCount: variantCount,
            }
        })


        return res.status(200).json({
            status: 200,
            message: "Design generated successfully",
            data: designResult
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


export async function handleCreateDesignSession(req: Request, res: Response) {
    try {

        console.log("user", req.user);

        // take user id from cookies
        //    const {userID} = req.


        // create document for the session
        const newUserSession = new UserSession({
            userId: req.user?._id,
            designPrompt: req.body.designPrompt,
        })

        await newUserSession.save();

        // startBackGroundProcessing(newUserSession._id)
        await imageQueue.add("generate-design", {
            designPrompt: req.body.designPrompt,
            userId: req.user?._id,
            sessionId: newUserSession._id,
            variantCount: req.body.variantCount,
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
        const demoResultImageUrl: string = session.imageUrl;
        const demoResult = [
            {
                imageUrl: demoResultImageUrl,
                variantIndex: 0,
                status: "success",
                error: null
            },
            {
                imageUrl: demoResultImageUrl,
                variantIndex: 1,
                status: "success",
                error: null
            },
            {
                imageUrl: demoResultImageUrl,
                variantIndex: 2,
                status: "success",
                error: null
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