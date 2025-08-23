import { RequestHandler } from "express";
import ValidatorModel from "../model/Validator.model.js";

const OfflineStatusController: RequestHandler = async (req, res) => {
  try {
    const publicKey = String(req.query.publicKey ?? "").trim();
    if (!publicKey) {
      res.status(400).json({ error: "publicKey query param is required" });
      return;
    }

    // First fetch existing validator (exclude sensitive fields)
    const existing = await ValidatorModel.findOne({ publicKey })
      .select("-sessionToken -ticks")
      .lean()
      .exec();

    if (!existing) {
      res.status(404).json({ error: "Validator not found" });
      return;
    }

    // If already offline, return success with current document (no error)
    if (existing.isOnline === false) {
      res.status(200).json({ message: "Validator already offline", validator: existing });
      return;
    }

    // Otherwise update isOnline -> false and return updated doc (excluding sensitive fields)
    const validator = await ValidatorModel.findOneAndUpdate(
      { publicKey },
      { $set: { isOnline: false } },
      { new: true }
    )
      .select("-sessionToken -ticks")
      .lean()
      .exec();

    if (!validator) {
      // very unlikely (race), but handle gracefully
      res.status(404).json({ error: "Validator not found after update" });
      return;
    }

    res.status(200).json({ message: "Validator marked offline", validator });
    return;
  } catch (err) {
    console.error("OfflineStatusController error:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

export default OfflineStatusController;
