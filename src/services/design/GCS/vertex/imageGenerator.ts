import { generateCoverImage } from "../../designService.js";

export default async function callVertexImageGenerator(prompt: string) {
    const rawImageBuffer = await generateCoverImage(prompt)

    return rawImageBuffer; // it will provided saved image path locally : /designs/design-<randomString>.png need to upload that path to gcs
}