// models/WebsiteTick.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export type WebsiteStatus = "Good" | "Bad";

export interface IWebsiteTick extends Document {
  websiteId: Types.ObjectId;
  validatorId: Types.ObjectId;
  createdAt: Date;
  status: WebsiteStatus;
  latency: number;
}

const WebsiteTickSchema: Schema<IWebsiteTick> = new Schema({
  websiteId: { type: Schema.Types.ObjectId, ref: 'Website', required: true },
  validatorId: { type: Schema.Types.ObjectId, ref: 'Validator', required: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['Good', 'Bad'], required: true },
  latency: { type: Number, required: true },
});

export const WebsiteTick = mongoose.model<IWebsiteTick>('WebsiteTick', WebsiteTickSchema);
