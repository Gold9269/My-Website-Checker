import mongoose from "mongoose";

export type WebsiteStatus = "Good" | "Bad";

export interface IWebsiteTick extends mongoose.Document {
  websiteId: mongoose.Types.ObjectId;
  validatorId: mongoose.Types.ObjectId;
  createdAt?: Date;
  status: WebsiteStatus;
  latency: number;
}

export declare const WebsiteTick: mongoose.Model<IWebsiteTick>;
export default WebsiteTick;
