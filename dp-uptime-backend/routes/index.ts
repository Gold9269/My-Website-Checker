import express, { RequestHandler } from "express";
import { authMiddleware } from "../middleware/index.js";
import CreateWebsiteController from '../controller/CreateWebsiteController.js';
import GetAllWebsitesController from "../controller/GetAllWebsitesController.js";
import DeleteWebsiteController from "../controller/DeleteWebsiteController.js";
import GetWebsiteStatusController from "../controller/GetWebsiteStatusController.js";
import CreateValidatorController from "../controller/CreateValidatorController.js";
import GetValidatorController from "../controller/GetValidatorController.js";
import GetValidatorEarningsController from "../controller/GetValidatorEarningsController.js";
import WithdrawController from "../controller/WithdrawController.js";
import GetAllValidatorController from "../controller/GetAllValidatorController.js";
import { SubscribeController } from "../controller/SubscribeController.js";
import OnlineStatusController from "../controller/OnlineStatusController.js";
import OfflineStatusController from "../controller/OfflineStatusController.js";
import GetAllDbValidatorController from "../controller/GetAllDbValidatorController.js";
import GetAllDbWebsitesController from "../controller/GetAllDbWebsitesController.js";
import GetTopValidatorController from "../controller/GetTopValidatorController.js";

const router = express.Router();

router.get("/get-all-websites", authMiddleware as RequestHandler, GetAllWebsitesController);
router.get("/get-website-status", authMiddleware as RequestHandler, GetWebsiteStatusController);
router.get("/validator-earnings", authMiddleware as RequestHandler, GetValidatorEarningsController);
router.get("/validator",authMiddleware as RequestHandler, GetValidatorController);
router.get("/get-all-validator",authMiddleware as RequestHandler, GetAllValidatorController);
router.get("/get-all-db-validator", GetAllDbValidatorController);
router.get("/get-all-db-websites", GetAllDbWebsitesController);
router.get("/get-top-validators", GetTopValidatorController);


router.post("/create-website", authMiddleware as RequestHandler, CreateWebsiteController);
router.post("/create-validator", authMiddleware as RequestHandler,CreateValidatorController );
router.post("/withdraw", authMiddleware as RequestHandler, WithdrawController);
router.post("/subscribe",  authMiddleware as RequestHandler,SubscribeController);
router.post("/change-to-online",  authMiddleware as RequestHandler,OnlineStatusController);
router.post("/change-to-offline",  authMiddleware as RequestHandler,OfflineStatusController);


router.delete("/delete-website/:id", authMiddleware as RequestHandler, DeleteWebsiteController);

export default router;
