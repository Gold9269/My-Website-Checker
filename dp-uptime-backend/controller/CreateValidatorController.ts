// controllers/CreateValidatorController.ts
import { Request, Response, NextFunction } from "express";
import ValidatorModel from "../model/Validator.model.js";
import { validationResult } from "express-validator";

/**
 * Creates a validator document.
 * IMPORTANT: This function returns Promise<void> (does not return res).
 */
export default async function CreateValidatorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // If you're using express-validator in the route, check results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: "Invalid input", errors: errors.array() });
      return;
    }

    const { publicKey, location, ip, signedMessage, signature } = req.body ?? {};

    if (!publicKey || typeof publicKey !== "string") {
      res.status(400).json({ message: "publicKey is required" });
      return;
    }

    // optional: duplicate check
    const existing = await ValidatorModel.findOne({ publicKey }).lean().exec();
    if (existing) {
      res.status(409).json({ message: "Validator already exists for this publicKey" });
      return;
    }

    const validator = new ValidatorModel({
      publicKey,
      location: location || "Unknown",
      ip: ip || "0.0.0.0",
      pendingPayouts: 0,
      ticks: [],
    });

    await validator.save();

    // IMPORTANT: do not `return res...` — just send response and return void
    res.status(201).json({ message: "Validator created", validatorId: validator._id });
    return;
  } catch (err) {
    // pass to express error handler
    next(err);
    return;
  }
}