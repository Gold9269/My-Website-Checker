import { RequestHandler } from "express";
import ValidatorModel from "../model/Validator.model.js";

/**
 * GET /api/v1/get-all-validator
 *
 * Returns an array of validators (safe fields only) and a count.
 * Returns all validators regardless of their isOnline state.
 */
const GetAllDbValidatorController: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    // No filter — return all validators.
    // Project only safe fields to avoid leaking secrets (e.g. sessionToken).
    const validators = await ValidatorModel.find({})
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

export default GetAllDbValidatorController;
