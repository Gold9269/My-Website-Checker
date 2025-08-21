import { RequestHandler } from "express";
import ValidatorModel from "../model/Validator.model.js";

/**
 * GET /api/v1/get-all-validator
 *
 * Returns an array of validators (safe fields only) and a count.
 * Only validators with isOnline === true are returned.
 */
const GetAllValidatorController: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    // Find online validators. Project only safe fields to avoid leaking secrets (e.g. sessionToken).
    const validators = await ValidatorModel.find(
      { isOnline: true },
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
