// src/controllers/GetValidatorController.ts
import { RequestHandler } from "express";
import ValidatorModel from "../model/Validator.model.js";

const GetValidatorController: RequestHandler = async (req, res) => {
  try {
    const publicKey = String(req.query.publicKey ?? "").trim();
    if (!publicKey) {
      res.status(400).json({ error: "publicKey query param is required" });
      return;
    }

    const validator = await ValidatorModel.findOne({ publicKey }).lean().exec();
    if (!validator) {
      res.status(404).json({ error: "Validator not found" });
      return;
    }

    // Return validator info including pendingPayouts
    res.status(200).json({ validator });
    return;
  } catch (err) {
    console.error("GetValidatorController error:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

export default GetValidatorController;
