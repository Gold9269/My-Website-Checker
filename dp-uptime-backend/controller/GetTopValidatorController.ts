import { RequestHandler } from "express";
import ValidatorModel from "../model/Validator.model.js";

const GetTopValidatorController: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    // No filter (include all validators). Project only safe fields.
    const validators = await ValidatorModel.find(
      {},
      { publicKey: 1, location: 1, ip: 1, pendingPayouts: 1 }
    )
      .sort({ pendingPayouts: -1 })
      .limit(5)
      .lean()
      .exec();

    res.json({
      ok: true,
      count: Array.isArray(validators) ? validators.length : 0,
      validators: validators ?? [],
    });
    return;
  } catch (err) {
    next(err);
    return;
  }
};

export default GetTopValidatorController;
