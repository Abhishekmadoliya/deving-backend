

import { Ollama } from "ollama";
import { configDotenv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


configDotenv({
    path: path.resolve(__dirname, "../../../.env"),
});

console.log("OLLAMA_HOST:", process.env.OLLAMA_HOST);
console.log("OLLAMA_API_KEY:", process.env.OLLAMA_API_KEY ? "Loaded (starts with " + process.env.OLLAMA_API_KEY.substring(0, 5) + ")" : "Not Loaded");

// Configuration
const ollama = new Ollama({
    host: process.env.OLLAMA_HOST || "https://ollama.com",
    headers: {
        Authorization: "Bearer " + process.env.OLLAMA_API_KEY,
    },
});


async function generateWithOllama(prompt: string) {
    const response = await ollama.chat({
        model: "qwen3-coder-next",
        messages: [{ role: "user", content: prompt }],
        stream: false,
    });
    return response.message.content;
}



const prompt = `


Generate an HTML CSS code in singel index.html file for a modern and responsive navigation bar.

Requirements:
- Layout: Horizontal navigation bar with logo on the left and navigation links on the right.
- Design:
  - Use a clean, modern design with smooth hover effects.
  - Implement a responsive layout that collapses into a hamburger menu on smaller screens (below 768px).
  - The navigation bar should have a height of 70px.
  - Use a light gray background color (#F5F5F5) for the navbar.
  - Use dark text (#333333) for links and a distinct color for the active link.
  - The logo should be displayed as text "BrandName".
- Links:
  - Include four navigation links: Home, About, Services, and Contact.
  - Highlight the "About" link as active (e.g., with a different background color or border).
- Responsiveness:
  - On mobile devices, the navigation should collapse into a hamburger menu.
  - Clicking the hamburger icon should toggle the visibility of the navigation links.
  - Ensure smooth transitions for the mobile menu opening and closing.

Output: Provide the complete HTML code with inline CSS or a separate CSS file that can be easily integrated into a project.

`;

function extractHtml(text: string): string {
    const match = text.match(/```html([\s\S]*?)```/i);
    if (match) {
        return match[1].trim();
    }
    const matchAny = text.match(/```([\s\S]*?)```/i);
    if (matchAny) {
        return matchAny[1].trim();
    }
    return text.trim();
}

generateWithOllama(prompt).then((response) => {
    console.log("Raw Response:\n", response);
    if (response) {
        const cleanHtml = extractHtml(response);
        const outputPath = path.resolve(__dirname, "../../../index.html");
        fs.writeFileSync(outputPath, cleanHtml);
        console.log(`\nSuccessfully saved clean HTML code to: ${outputPath}`);
    }
}).catch((error) => {
    console.error(error);
});