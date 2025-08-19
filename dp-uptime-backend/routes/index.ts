import express, { RequestHandler } from "express";
import { authMiddleware } from "../middleware/index.js";
import CreateWebsiteController from '../controller/CreateWebsiteController.js';
import GetAllWebsitesController from "../controller/GetAllWebsitesController.js";
import DeleteWebsiteController from "../controller/DeleteWebsiteController.js";
import GetWebsiteStatusController from "../controller/GetWebsiteStatusController.js";
import CreateValidatorController from "../controller/CreateValidatorController.js";
import GetValidatorController from "../controller/GetValidatorController.js";

const router = express.Router();

router.get("/get-all-websites", authMiddleware as RequestHandler, GetAllWebsitesController);
router.get("/get-website-status", authMiddleware as RequestHandler, GetWebsiteStatusController);
router.get("/get-validator", authMiddleware as RequestHandler,GetValidatorController);



router.post("/create-website", authMiddleware as RequestHandler, CreateWebsiteController);
router.post("/create-validator", authMiddleware as RequestHandler,CreateValidatorController );



router.delete("/delete-website", authMiddleware as RequestHandler, DeleteWebsiteController);

export default router;
