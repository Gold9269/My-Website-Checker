// src/controller/GetAllValidatorController.ts
import { RequestHandler } from "express";
import mongoose from "mongoose";

/**
 * GET /api/v1/get-all-validator
 *
 * Returns an array of validators (safe fields only) and a count.
 * Protected by whatever auth middleware your router attaches.
 */
const GetAllValidatorController: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const ValidatorModel = mongoose.connection.models?.Validator;
    if (!ValidatorModel) {
      res.status(500).json({ ok: false, error: "server misconfiguration: Validator model missing" });
      return;
    }

    // Find all validators. Project only safe fields to avoid leaking secrets (e.g. sessionToken).
    const validators = await ValidatorModel.find(
      {},
      {
        publicKey: 1,
        location: 1,
        ip: 1,
        pendingPayouts: 1,
        // omit ticks, sessionToken, and any other sensitive fields
      }
    )
      .lean()
      .exec();

    res.json({
      ok: true,
      count: Array.isArray(validators) ? validators.length : 0,
      validators: validators ?? [],
    });
    return;
  } catch (err) {
    // forward to error middleware
    next(err);
    return;
  }
};

export default GetAllValidatorController;
