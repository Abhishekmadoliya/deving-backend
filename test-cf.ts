import dotenv from "dotenv";
dotenv.config();
import { callCloudflareImageGenerator } from "./src/services/design/CLOUDFLARE/imageGenerator.ts";
import fs from "fs";

(async () => {
    try {
        console.log("Testing CF image generator...");
        const buff = await callCloudflareImageGenerator("a simple red square");
        console.log("Buffer size:", buff.length);
        console.log("First 50 bytes:", buff.slice(0, 50).toString());
    } catch (e) {
        console.error(e);
    }
})();
