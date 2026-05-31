import { imageQueue } from "./queues/imageQueue.js";
import { connectDB } from "./config/db.js";
import { UserSession } from "./models/user.session.js";

async function run() {
    console.log("[Test] Connecting to Database...");
    await connectDB();
    
    console.log("[Test] Creating a test user session...");
    const session = new UserSession({
        userId: "60c72b2f9b1d8a2c88888888", // Dummy valid ObjectId format
        designPrompt: "A futuristic coffee shop landing page in neon blue theme",
    });
    await session.save();
    console.log("[Test] Saved test session with ID:", session._id.toString());

    console.log("[Test] Enqueuing job in imageQueue...");
    const job = await imageQueue.add("generate-design", {
        designPrompt: session.designPrompt,
        userId: session.userId,
        sessionId: session._id.toString(),
        variantCount: 1,
    });
    console.log("[Test] Job added successfully! Job ID:", job.id);
    
    console.log("[Test] Exiting...");
    process.exit(0);
}

run().catch((err) => {
    console.error("[Test] Error:", err);
    process.exit(1);
});
