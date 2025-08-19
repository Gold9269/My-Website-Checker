import { Website} from "../model/Website.model.js";
import { Request, Response } from "express";

type AuthenticatedRequest = Request & { userId?: string };

const DeleteWebsiteController = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.userId;

  try {
    const updatedWebsite = await Website.findOneAndUpdate(
      { userId, disabled: false },
      { disabled: true },
      { new: true }
    );

    if (!updatedWebsite) {
      res.status(404).json({
        success: false,
        message: "Website not found or already disabled",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Website disabled successfully",
      data: updatedWebsite,
    });
  } catch (err) {
    console.error("DeleteWebsiteController error:", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong while disabling website.",
    });
  }
};

export default DeleteWebsiteController;
