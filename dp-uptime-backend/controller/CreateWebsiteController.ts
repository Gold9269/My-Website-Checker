// controllers/CreateWebsiteController.ts
import type { Request, Response } from "express";
import fetch from "node-fetch";
import { Website as WebsiteModel } from "../model/Website.model.js";
import { Connection, clusterApiUrl, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

type AuthenticatedRequest = Request & { userId?: string };

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? process.env.CLERK_API_KEY ?? null;
const CLERK_DEBUG = !!(process.env.CLERK_DEBUG && process.env.CLERK_DEBUG !== "0");

// Solana settings: env overrides, fallback to given treasury public key.
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const TREASURY_PUBKEY = process.env.TREASURY_PUBKEY || 'GDSo5N8RQoRu8asoUNEuDhXSVGYdNBafjsEJ3BoNPd7F';
const REQUIRED_LAMPORTS = Math.round(0.1 * LAMPORTS_PER_SOL);

const connection = new Connection(clusterApiUrl(SOLANA_NETWORK), 'confirmed');

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
      try { console.debug("[Clerk] fetched user object:", JSON.stringify(user)); } catch { console.debug("[Clerk] fetched user object (non-serializable)"); }
    }

    let email: string | null = null;
    const primaryId = user?.primary_email_address_id ?? user?.primaryEmailAddressId ?? user?.primary_email_address ?? user?.primaryEmailAddress ?? null;
    if (primaryId && Array.isArray(user?.email_addresses)) {
      const primaryObj = (user.email_addresses as any[]).find((e) => e && (e.id === primaryId || e.id === String(primaryId)));
      if (primaryObj && typeof primaryObj.email_address === "string") {
        email = primaryObj.email_address;
      }
    }

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

function normalizeAccountKeys(accountKeysRaw: any[]): string[] {
  return (accountKeysRaw ?? []).map((k: any) => {
    if (!k) return '';
    if (typeof k === 'string') return k;
    if (k.pubkey) return String(k.pubkey);
    try { return String(k); } catch { return ''; }
  }).filter(Boolean);
}

/**
 * Sum explicit SOL transfer lamports to the treasury by scanning parsed instructions + innerInstructions.
 * If no explicit transfer found, return 0 (caller may fall back to pre/post balance diff).
 */
function sumParsedTransfersToTreasury(parsedTx: any, treasuryPubkey: string): number {
  let total = 0;

  const collectFromInstrs = (instrs: any[] | undefined) => {
    if (!instrs) return;
    for (const instr of instrs) {
      const parsed = instr?.parsed;
      if (parsed && parsed.type === 'transfer') {
        const info = parsed.info;
        try {
          if (info?.destination === treasuryPubkey && typeof info.lamports !== 'undefined') {
            const lam = Number(info.lamports);
            if (!Number.isNaN(lam) && lam > 0) total += lam;
          }
        } catch {}
      }
    }
  };

  try {
    collectFromInstrs(parsedTx.transaction?.message?.instructions);
    const inner = parsedTx.meta?.innerInstructions;
    if (Array.isArray(inner)) {
      for (const item of inner) collectFromInstrs(item.instructions);
    }
  } catch (err) {
    if (CLERK_DEBUG) console.debug("[tx] parse-sum failed", err);
  }
  return total;
}

/**
 * Wait for getParsedTransaction(txSignature, 'finalized') to return parsed metadata, with a timeout.
 * Returns parsed transaction object or null if timed out.
 */
async function waitForParsedTransaction(sig: string, timeoutMs = 20000, intervalMs = 800): Promise<any | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const parsed = await connection.getParsedTransaction(sig, 'finalized');
      if (parsed && parsed.meta) return parsed;
    } catch (err) {
      if (CLERK_DEBUG) console.debug("[tx] getParsedTransaction attempt error", err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

const CreateWebsiteController = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.userId;
    if (CLERK_DEBUG) console.debug("[CreateWebsiteController] incoming userId:", id);

    if (!id) {
      res.status(401).json({ success: false, message: "Unauthorized: missing user id" });
      return;
    }

    const { url, ownerEmail: ownerEmailFromClient, txSignature, payerPublicKey } = req.body ?? {};

    if (!url || typeof url !== "string" || !isValidUrl(url)) {
      res.status(400).json({
        success: false,
        message: "Website URL is required and must be a valid http(s) URL",
      });
      return;
    }

    if (!txSignature || typeof txSignature !== "string" || !payerPublicKey || typeof payerPublicKey !== "string") {
      res.status(402).json({ success: false, message: "Payment required: missing txSignature or payerPublicKey" });
      return;
    }

    if (!TREASURY_PUBKEY) {
      console.error("TREASURY_PUBKEY not configured on server");
      res.status(500).json({ success: false, message: "Server misconfiguration" });
      return;
    }

    // Prevent replay / reuse of the same signature
    try {
      const usedTx = await WebsiteModel.findOne({ txSignature }).lean();
      if (usedTx) {
        res.status(409).json({ success: false, message: "This transaction signature was already used to register a website" });
        return;
      }
    } catch (err) {
      // If DB check failed, log and continue to verification step (we'll still attempt to detect duplicate later)
      console.error("[DB] txSignature lookup failed:", err);
    }

    // Verify tx on chain
    let parsed: any = null;
    try {
      // Wait for RPC to index parsed transaction (finalized)
      parsed = await waitForParsedTransaction(txSignature, 20_000, 800);
      if (!parsed || !parsed.meta) {
        if (CLERK_DEBUG) console.warn("[tx] parsed transaction not available after wait", { txSignature });
        res.status(402).json({ success: false, message: "Transaction not found or not finalized yet" });
        return;
      }

      const accountKeysRaw = parsed.transaction?.message?.accountKeys || [];
      const accountKeys = normalizeAccountKeys(accountKeysRaw);

      const treasuryIndex = accountKeys.findIndex((k) => k === TREASURY_PUBKEY);
      if (treasuryIndex < 0) {
        if (CLERK_DEBUG) console.warn("[tx] treasury not in accountKeys", { treasury: TREASURY_PUBKEY, accountKeys });
        res.status(402).json({ success: false, message: "Transaction did not include the expected treasury account" });
        return;
      }

      // 1) Prefer explicit parsed instruction detection (more robust)
      let transferredLamports = sumParsedTransfersToTreasury(parsed, TREASURY_PUBKEY);

      // 2) Fallback to pre/post balance diff if no parsed transfer found
      if (!transferredLamports) {
        const pre = parsed.meta.preBalances ?? [];
        const post = parsed.meta.postBalances ?? [];
        const preBal = pre[treasuryIndex] ?? 0;
        const postBal = post[treasuryIndex] ?? 0;
        const diff = postBal - preBal;
        if (diff && diff > 0) transferredLamports = diff;
        if (CLERK_DEBUG) console.debug("[tx] pre/post diff used", { preBal, postBal, diff, transferredLamports });
      } else {
        if (CLERK_DEBUG) console.debug("[tx] parsed transfer sum used", { transferredLamports });
      }

      if (!transferredLamports || transferredLamports < REQUIRED_LAMPORTS) {
        if (CLERK_DEBUG) {
          console.warn("[tx] transferred too small", { transferredLamports, required: REQUIRED_LAMPORTS });
          res.status(402).json({
            success: false,
            message: `Transferred amount too small. Required at least ${REQUIRED_LAMPORTS} lamports`,
            debug: {
              transferredLamports,
              required: REQUIRED_LAMPORTS,
              accountKeys,
              parsedSummary: {
                hasMeta: !!parsed.meta,
                innerInstructionsCount: Array.isArray(parsed.meta?.innerInstructions) ? parsed.meta.innerInstructions.length : 0,
              },
            },
          });
          return;
        } else {
          res.status(402).json({ success: false, message: `Transferred amount too small.` });
          return;
        }
      }

      // Ensure payerPublicKey is included as one of accounts.
      if (!accountKeys.includes(payerPublicKey)) {
        if (CLERK_DEBUG) console.warn("[tx] payerPublicKey missing in accounts", { payerPublicKey, accountKeys });
        res.status(400).json({ success: false, message: "Payer public key does not match transaction accounts" });
        return;
      }

      // Optional: ensure payer was a signer (uncomment to enforce)
      // let payerIsSigner = false;
      // for (const raw of accountKeysRaw) {
      //   if (!raw) continue;
      //   const pub = typeof raw === 'string' ? raw : (raw.pubkey ? String(raw.pubkey) : String(raw));
      //   if (pub === payerPublicKey) {
      //     if (raw.signer === true || raw.isSigner === true) payerIsSigner = true;
      //     break;
      //   }
      // }
      // if (!payerIsSigner) { res.status(400).json({ success: false, message: "Payer was not a signer of the transaction" }); return; }

    } catch (err) {
      console.error("Solana tx verification failed", err);
      res.status(500).json({ success: false, message: "Failed to verify Solana transaction" });
      return;
    }

    // Check duplicate website url for the same user
    try {
      const existingWebsite = await WebsiteModel.findOne({ userId: id, url }).lean();
      if (existingWebsite) {
        res.status(409).json({
          success: false,
          message: "The website already exists in the DB.",
        });
        return;
      }
    } catch (err) {
      console.error("[DB] existingWebsite check failed", err);
      // proceed — DB might error later on create
    }

    // Clerk email lookup fallback
    let ownerEmail: string | null = null;
    ownerEmail = await fetchClerkEmail(id);
    if (CLERK_DEBUG) console.debug("[CreateWebsiteController] clerk email lookup result:", ownerEmail);
    if (!ownerEmail && ownerEmailFromClient && typeof ownerEmailFromClient === "string") {
      ownerEmail = ownerEmailFromClient;
      if (CLERK_DEBUG) console.debug("[CreateWebsiteController] using ownerEmail from client fallback:", ownerEmail);
    }

    // Persist website and txSignature together (store signature to prevent reuse)
    try {
      const newWebsite = await WebsiteModel.create({
        url,
        userId: id,
        ownerEmail,
        lastAlertAt: null,
        ticks: [],
        disabled: false,
        alertCooldownMinutes: 30,
        txSignature,
      });

      if (CLERK_DEBUG) console.debug("[CreateWebsiteController] created website:", JSON.stringify(newWebsite));

      res.status(201).json({
        success: true,
        message: "New website added successfully.",
        data: newWebsite,
      });
      return;
    } catch (err) {
      // If create fails because txSignature uniqueness, return 409
      if ((err as any)?.code === 11000) { // mongo duplicate key
        res.status(409).json({ success: false, message: "This transaction signature or website already exists." });
        return;
      }
      console.error("[DB] create failed", err);
      res.status(500).json({ success: false, error: "Failed to persist website" });
      return;
    }
  } catch (err) {
    console.error("[ERROR in CreateWebsiteController]", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong inside CreateWebsiteController.",
    });
  }
};

export default CreateWebsiteController;
