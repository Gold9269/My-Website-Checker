import { Request,Response } from "express";
import { Website as WebsiteModel} from "../model/Website.model.js";
type AuthenticatedRequest = Request & { userId?: string };
const GetAllWebsitesController=async(req:AuthenticatedRequest,res:Response): Promise<void> => {
    try {
        const id=req.userId;
        const websites = await WebsiteModel.find({
        userId:id,
        disabled: false
        }).populate('ticks');

        res.status(200).json({
        websites
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Something went wrong inside DeleteWebsiteController.' });
    }
}
export default GetAllWebsitesController