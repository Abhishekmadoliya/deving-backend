
import { Router } from "express";
import { handleGenerateDesign, handleCreateDesignSession, handleGetDesignSession } from "../../controllers/design/designController.js";
import { checkAuthorization } from "../../middleware/checkAuthorization.js";


const designRouter = Router();

// designRouter.post('/generate-designs', handleGenerateDesign)
designRouter.get("/:sessionId", checkAuthorization, handleGetDesignSession)
designRouter.post('/create-session', checkAuthorization, handleCreateDesignSession)




export default designRouter;


