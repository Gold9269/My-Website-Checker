// controllers/CreateWebsiteController.ts
import type { Request, Response } from "express";
import fetch from "node-fetch";
import { Website as WebsiteModel } from "../model/Website.model.js";

type AuthenticatedRequest = Request & { userId?: string };

// Prefer CLERK_SECRET_KEY; fallback to CLERK_API_KEY if present
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? process.env.CLERK_API_KEY ?? null;
// CLERK_DEBUG: treat "0" as false; anything else truthy
const CLERK_DEBUG = !!(process.env.CLERK_DEBUG && process.env.CLERK_DEBUG !== "0");

/**
 * Fetch the Clerk user and try to extract an email address.
 * Handles several possible Clerk API shapes:
 *  - email_addresses (snake_case array)
 *  - emailAddresses (camelCase array)
 *  - primary_email_address / primaryEmailAddress
 *  - top-level user.email (fallback)
 */
async function fetchClerkEmail(userId: string): Promise<string | null> {
  if (!CLERK_SECRET_KEY) {
    if (CLERK_DEBUG) console.warn("[Clerk] CLERK_SECRET_KEY not configured; skipping Clerk lookup");
    return null;
  }

  const url = `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "<unable to read body>");
      console.warn(`[Clerk] fetch non-ok status=${resp.status} for user=${userId}. body=${body}`);
      return null;
    }

    const user: any = await resp.json();

    if (CLERK_DEBUG) {
      try {
        console.debug("[Clerk] fetched user object:", JSON.stringify(user));
      } catch {
        console.debug("[Clerk] fetched user object (non-serializable)");
      }
    }

    // Prefer email resolved from primary_email_address_id if present
    let email: string | null = null;

    // If Clerk exposes primary_email_address_id and an email_addresses array, use it
    const primaryId = user?.primary_email_address_id ?? user?.primaryEmailAddressId ?? user?.primary_email_address ?? user?.primaryEmailAddress ?? null;
    if (primaryId && Array.isArray(user?.email_addresses)) {
      const primaryObj = (user.email_addresses as any[]).find((e) => e && (e.id === primaryId || e.id === String(primaryId)));
      if (primaryObj && typeof primaryObj.email_address === "string") {
        email = primaryObj.email_address;
      }
    }

    // If still not found, try common shapes
    email =
      email ??
      user?.email_addresses?.[0]?.email_address ??
      user?.emailAddresses?.[0]?.emailAddress ??
      user?.primary_email_address ??
      user?.primaryEmailAddress ??
      user?.email ??
      null;

    return typeof email === "string" ? email : null;
  } catch (err) {
    console.warn("[Clerk] fetch error:", err);
    return null;
  }
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const CreateWebsiteController = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.userId;

    // Minimal safe logging (avoid dumping whole req object)
    if (CLERK_DEBUG) console.debug("[CreateWebsiteController] incoming userId:", id);

    if (!id) {
      res.status(401).json({ success: false, message: "Unauthorized: missing user id" });
      return;
    }

    const { url, ownerEmail: ownerEmailFromClient } = req.body ?? {};

    if (!url || typeof url !== "string" || !isValidUrl(url)) {
      res.status(400).json({
        success: false,
        message: "Website URL is required and must be a valid http(s) URL",
      });
      return;
    }

    // check duplicate for this user
    const existingWebsite = await WebsiteModel.findOne({ userId: id, url }).lean();
    if (existingWebsite) {
      res.status(409).json({
        success: false,
        message: "The website already exists in the DB.",
      });
      return;
    }

    // Prefer server-side Clerk email lookup (safer). Fallback to client-supplied ownerEmail if present.
    let ownerEmail: string | null = null;

    ownerEmail = await fetchClerkEmail(id);
    if (CLERK_DEBUG) console.debug("[CreateWebsiteController] clerk email lookup result:", ownerEmail);

    if (!ownerEmail && ownerEmailFromClient && typeof ownerEmailFromClient === "string") {
      ownerEmail = ownerEmailFromClient;
      if (CLERK_DEBUG) console.debug("[CreateWebsiteController] using ownerEmail from client fallback:", ownerEmail);
    }

    const newWebsite = await WebsiteModel.create({
      url,
      userId: id,
      ownerEmail,
      lastAlertAt: null,
      ticks: [],
      disabled: false,
      alertCooldownMinutes: 30,
    });

    if (CLERK_DEBUG) console.debug("[CreateWebsiteController] created website:", JSON.stringify(newWebsite));

    res.status(201).json({
      success: true,
      message: "New website added successfully.",
      data: newWebsite,
    });
  } catch (err) {
    console.error("[ERROR in CreateWebsiteController]", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong inside CreateWebsiteController.",
    });
  }
};

export default CreateWebsiteController;
