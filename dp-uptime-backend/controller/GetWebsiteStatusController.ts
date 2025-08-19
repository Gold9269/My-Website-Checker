import { Request,Response } from "express";
import { Website as WebsiteModel} from "../model/Website.model.js";
import { Types } from 'mongoose';
type AuthenticatedRequest = Request & { userId?: string };
const GetWebsiteStatusController=async(req:AuthenticatedRequest,res:Response): Promise<void> => {
    const websiteId = req.query.websiteId! as unknown as string;
    const id=req.userId;
    try {
        const data = await WebsiteModel.findOne({
        _id: new Types.ObjectId(websiteId),
        userId: new Types.ObjectId(id),
        disabled: false
        }).populate('ticks');
        if(!data){
            res.status(404).json(
                {
                    success:false,
                    message:"Not able to find the webiste to return status."
                }
            )
        }
        res.status(200).json(
            {
                success:true,
                message:"Successfully get the status of the website",
                data:data
            }
        )
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Something went wrong inside GetWebsiteStatusController.' });    
    }
}
export default GetWebsiteStatusController;