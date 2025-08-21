import mongoose, { Schema, Document, Types } from "mongoose";

export interface IValidator extends Document {
  publicKey: string;
  location: string;
  ip: string;
  pendingPayouts: number;
  ticks: Types.ObjectId[];
  sessionToken: string;
  isOnline: boolean;
}

const ValidatorSchema: Schema = new Schema<IValidator>({
  publicKey: { type: String, required: true },
  location: { type: String, required: true },
  ip: { type: String, required: true },
  pendingPayouts: { type: Number, default: 0 },
  ticks: [{ type: Schema.Types.ObjectId, ref: "WebsiteTick" }],
  sessionToken: { type: String, default: "" },
  isOnline: { type: Boolean, default: false },
});

export default mongoose.model<IValidator>("Validator", ValidatorSchema);
