import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);
