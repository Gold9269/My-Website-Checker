import { RequestHandler } from "express";
import ValidatorModel from "../model/Validator.model.js";

const OnlineStatusController: RequestHandler = async (req, res) => {
  try {
    const publicKey = String(req.query.publicKey ?? "").trim();
    if (!publicKey) {
      res.status(400).json({ error: "publicKey query param is required" });
      return;
    }

    // Find the validator and set isOnline to true, return the updated document.
    // Exclude sensitive fields (eg. sessionToken) from the returned document.
    const validator = await ValidatorModel.findOneAndUpdate(
      { publicKey },
      { $set: { isOnline: true } },
      { new: true } 
    )
      .lean()
      .exec();

    if (!validator) {
      res.status(404).json({ error: "Validator not found" });
      return;
    }

    res.status(200).json({ message: "Validator marked online", validator });
    return;
  } catch (err) {
    console.error("ChangeOnlineStatusController error:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

export default OnlineStatusController;
