import mongoose from "mongoose";

export interface IWebsite extends mongoose.Document {
  url: string;
  userId: string;               
  ownerEmail?: string | null;  
  ticks: mongoose.Types.ObjectId[];
  disabled: boolean;
  lastAlertAt?: Date | null;
  alertCooldownMinutes?: number; 
  createdAt?: Date;
  updatedAt?: Date;
}

export declare const Website: mongoose.Model<IWebsite>;
export default Website;
