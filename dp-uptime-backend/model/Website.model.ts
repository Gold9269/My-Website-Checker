// models/Website.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IWebsite extends Document {
  url: string;
  userId: string;         // Clerk user id (owner)
  ownerEmail?: string;    // owner email for notifications
  ticks: Types.ObjectId[];
  disabled: boolean;
  lastAlertAt?: Date | null;
  alertCooldownMinutes?: number; // per-website alert cooldown
}

const WebsiteSchema: Schema<IWebsite> = new Schema(
  {
    url: { type: String, required: true, trim: true },
    userId: { type: String, ref: "User", required: true },
    ownerEmail: { type: String, default: null },
    ticks: [{ type: Schema.Types.ObjectId, ref: "WebsiteTick" }],
    disabled: { type: Boolean, default: false },
    lastAlertAt: { type: Date, default: null },
    alertCooldownMinutes: { type: Number, default: 15 }, // default: 15 minutes
  },
  { timestamps: true }
);

// Use existing model if registered (prevents overwrite errors)
export const Website =
  mongoose.models.Website ?? mongoose.model<IWebsite>("Website", WebsiteSchema);

export default Website;
