
import { Router } from "express";
import { handleCreateDesignSession, handleGetDesignSession, handleCreateDesign } from "../../controllers/design/designController.js";
import { checkAuthorization } from "../../middleware/checkAuthorization.js";
import upload from "../../lib/multer.js";


const designRouter = Router();

// designRouter.post('/generate-designs', handleGenerateDesign)
designRouter.get("/:sessionId", checkAuthorization, handleGetDesignSession)
designRouter.post('/create-session', checkAuthorization, upload.array("referenceImages"), handleCreateDesignSession)
designRouter.post('/create-design/:designSessionId', checkAuthorization, upload.array("referenceImages"), handleCreateDesign);




export default designRouter;


