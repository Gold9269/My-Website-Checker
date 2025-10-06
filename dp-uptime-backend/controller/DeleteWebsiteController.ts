// src/controllers/DeleteWebsiteController.ts
import { Website } from "../model/Website.model.js";
import { Request, Response } from "express";
import mongoose from "mongoose";

type AuthenticatedRequest = Request & { userId?: string };

const DeleteWebsiteController = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.userId;

  try {
    // 1. Ensure user is authenticated
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    // 2. Get website id from path param, body, or query (flexible)
    const websiteId = (req.params && req.params.id) || (req.body && req.body.id) || req.query?.id;
    if (!websiteId || typeof websiteId !== "string") {
      res.status(400).json({ success: false, message: "Website id is required" });
      return;
    }

    // 3. Validate ObjectId (defensive - avoids accidental bad queries)
    if (!mongoose.Types.ObjectId.isValid(websiteId)) {
      res.status(400).json({ success: false, message: "Invalid website id" });
      return;
    }

    // 4. Update only the specific website belonging to the authenticated user and only if it's not already disabled
    const filter = { _id: websiteId, userId: userId, disabled: false };
    const update = { disabled: true };
    const options = { new: true };

    const updatedWebsite = await Website.findOneAndUpdate(filter, update, options);

    if (!updatedWebsite) {
      // Not found OR already disabled OR doesn't belong to this user
      res.status(404).json({
        success: false,
        message: "Website not found, already disabled, or not owned by you",
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
