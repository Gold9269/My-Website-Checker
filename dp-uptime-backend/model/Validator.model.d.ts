// dp-uptime-backend/model/Validator.model.d.ts
import mongoose from 'mongoose';

export interface IValidator extends mongoose.Document {
  publicKey: string;
  location: string;
  ip: string;
  pendingPayouts: number;
  ticks: mongoose.Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * The model exported at runtime — include startSession because your code calls it.
 * startSession returns a Promise<mongoose.ClientSession>.
 */
declare const ValidatorModel: mongoose.Model<IValidator> & {
  startSession?: () => Promise<mongoose.ClientSession>;
};

export default ValidatorModel;
