// src/models/Subscriber.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISubscriber extends Document {
  email: string;
  clerkUserId?: string | null;
  // timestamps provided by mongoose
  createdAt?: Date;
  updatedAt?: Date;
}

const SubscriberSchema: Schema<ISubscriber> = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    clerkUserId: { type: String, required: false, default: null },
  },
  { timestamps: true }
);

// Ensure an index on email for fast lookups and uniqueness
SubscriberSchema.index({ email: 1 }, { unique: true });

export const Subscriber: Model<ISubscriber> =
  (mongoose.models?.Subscriber as Model<ISubscriber>) ||
  mongoose.model<ISubscriber>("Subscriber", SubscriberSchema);

export default Subscriber;
