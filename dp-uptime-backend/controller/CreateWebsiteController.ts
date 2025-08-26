// controllers/CreateWebsiteController.ts
import type { Request, Response } from "express";
import fetch from "node-fetch";
import mongoose from "mongoose";
import { Website as WebsiteModel } from "../model/Website.model.js";
import {
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

type AuthenticatedRequest = Request & { userId?: string };

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? process.env.CLERK_API_KEY ?? null;
const CLERK_DEBUG = !!(process.env.CLERK_DEBUG && process.env.CLERK_DEBUG !== "0");

// Solana settings
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? null;
const TREASURY_PUBKEY = process.env.TREASURY_PUBKEY || 'GDSo5N8RQoRu8asoUNEuDhXSVGYdNBafjsEJ3BoNPd7F';
const REQUIRED_LAMPORTS = Math.round(0.1 * LAMPORTS_PER_SOL);

// Build RPC URL robustly
let rpcUrl: string;
if (SOLANA_RPC_URL && (SOLANA_RPC_URL.startsWith('http://') || SOLANA_RPC_URL.startsWith('https://'))) {
  rpcUrl = SOLANA_RPC_URL;
} else if (SOLANA_NETWORK && (SOLANA_NETWORK.startsWith('http://') || SOLANA_NETWORK.startsWith('https://'))) {
  rpcUrl = SOLANA_NETWORK;
} else {
  try {
    rpcUrl = clusterApiUrl(SOLANA_NETWORK as any);
  } catch (err) {
    if (CLERK_DEBUG) console.warn('[Solana] clusterApiUrl() failed for', SOLANA_NETWORK, err);
    rpcUrl = clusterApiUrl('devnet');
  }
}
if (CLERK_DEBUG) console.debug('[Solana] using rpcUrl:', rpcUrl);
const connection = new Connection(rpcUrl, 'confirmed');

// TransactionRefund model (separate collection — does not modify your Website schema)
const RefundSchema = new mongoose.Schema(
  {
    txSignature: { type: String, required: true, unique: true },
    requestedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    status: { type: String, enum: ['requested', 'processed', 'failed'], default: 'requested' },
    error: { type: String, default: null },
    providerResult: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);
const TransactionRefund = mongoose.models.TransactionRefund ?? mongoose.model('TransactionRefund', RefundSchema);

/* -------------------- helpers -------------------- */

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

/* -------------------- Solana on-chain refund implementation -------------------- */

/**
 * Parse treasury secret key from env. Expected format: JSON-array of bytes (e.g. [12,34,56,...])
 * Example: TREASURY_SECRET_KEY=[...]  (do NOT commit this to git; put in secure env store)
 */
function parseTreasuryKeypairFromEnv(): Keypair {
  const s = process.env.TREASURY_SECRET_KEY ?? '';
  if (!s) throw new Error("TREASURY_SECRET_KEY env var not set. Required to perform on-chain refunds.");

  // Try JSON array
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
  } catch (e) {
    // continue to next parse attempt
  }

  // If not JSON array, throw (keep simple)
  throw new Error("TREASURY_SECRET_KEY must be a JSON array of bytes (e.g. output of `solana-keygen export`), currently unsupported format.");
}

/**
 * Perform the actual on-chain refund: send lamports from treasury -> destinationPubkey.
 * - If destinationPubkey or amount not provided, attempt to derive them from the parsed transaction.
 * - Returns the refund tx signature on success.
 */
async function performExternalRefundOnSolana(txSignature: string, destinationPubkey?: string | null, amountLamports?: number | null) {
  // parse keypair
  const treasuryKeypair = parseTreasuryKeypairFromEnv();
  const treasuryPubkeyObj = new PublicKey(TREASURY_PUBKEY);
  if (!treasuryKeypair.publicKey.equals(treasuryPubkeyObj)) {
    // mismatch between supplied pubkey and keypair — warn and continue (we'll still try)
    console.warn("[refund] TREASURY_SECRET_KEY public key does not match TREASURY_PUBKEY env var. Continuing but check your config.");
  }

  // If we don't know destination or amount, examine the original tx
  let parsed: any | null = null;
  try {
    parsed = await connection.getParsedTransaction(txSignature, 'finalized');
  } catch (e) {
    // ignore — we'll throw later if necessary
    if (CLERK_DEBUG) console.debug("[refund] failed to fetch parsed tx for", txSignature, e);
  }

  // derive amount
  let refundLamports = typeof amountLamports === 'number' && amountLamports > 0 ? amountLamports : 0;
  if (!refundLamports && parsed && parsed.meta) {
    const accountKeysRaw = parsed.transaction?.message?.accountKeys || [];
    const accountKeys = normalizeAccountKeys(accountKeysRaw);
    // find treasury index
    const treasuryIndex = accountKeys.findIndex((k) => k === TREASURY_PUBKEY);
    if (treasuryIndex >= 0) {
      const pre = parsed.meta.preBalances ?? [];
      const post = parsed.meta.postBalances ?? [];
      const preBal = pre[treasuryIndex] ?? 0;
      const postBal = post[treasuryIndex] ?? 0;
      const diff = postBal - preBal;
      if (diff && diff > 0) refundLamports = diff;
    }
    // fallback to parsed transfer instructions
    if (!refundLamports) {
      refundLamports = sumParsedTransfersToTreasury(parsed, TREASURY_PUBKEY);
    }
  }

  // Determine destination
  let destination = destinationPubkey ?? null;
  if (!destination && parsed && parsed.transaction) {
    // Try to find the payer: pick first signer (conservative)
    const accountKeysRaw = parsed.transaction?.message?.accountKeys || [];
    for (const raw of accountKeysRaw) {
      // raw can be string or { pubkey, signer, ... }
      try {
        if (typeof raw === 'string') {
          // cannot reliably detect signer from string-only representation; pick first key as fallback
          destination = raw;
          break;
        } else if (raw && (raw.signer === true || raw.isSigner === true)) {
          destination = String(raw.pubkey ?? raw);
          break;
        }
      } catch {}
    }
  }

  if (!destination) throw new Error("Could not determine destination public key for refund. Provide payerPublicKey when calling initiateRefundOnce.");

  if (!refundLamports || refundLamports <= 0) {
    // default to REQUIRED_LAMPORTS if nothing found
    refundLamports = REQUIRED_LAMPORTS;
  }

  // ensure treasury has enough balance
  const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey, 'confirmed');
  if (treasuryBalance < refundLamports) {
    throw new Error(`Treasury has insufficient funds for refund. treasuryBalance=${treasuryBalance}, needed=${refundLamports}`);
  }

  // Build and send transfer tx
  const toPubKeyObj = new PublicKey(destination);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasuryKeypair.publicKey,
      toPubkey: toPubKeyObj,
      lamports: refundLamports,
    })
  );

  // Send and confirm
  const sig = await sendAndConfirmTransaction(connection, tx, [treasuryKeypair], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  if (CLERK_DEBUG) console.debug("[refund] on-chain refund sent", { txSignature, refundTxSig: sig, refundLamports, to: destination });
  return { refundTxSig: sig, refundLamports, destination };
}

/* -------------------- initiateRefundOnce (single-shot guard) -------------------- */

/**
 * Initiate a refund exactly once for a txSignature.
 * - destinationPubKey and amountLamports are optional; if provided, they will be used.
 * - If not provided, we attempt to derive them from the parsed transaction.
 */
async function initiateRefundOnce(txSignature: string, reason?: string, destinationPubKey?: string | null, amountLamports?: number | null) {
  // create single-shot refund record; unique index prevents duplicates
  try {
    await TransactionRefund.create({
      txSignature,
      requestedAt: new Date(),
      status: 'requested',
      error: reason ?? null,
    });
    if (CLERK_DEBUG) console.debug("[refund] created request record for", txSignature);
  } catch (err: any) {
    if ((err as any).code === 11000) {
      if (CLERK_DEBUG) console.debug("[refund] refund already requested for", txSignature);
      return { initiated: false, reason: 'already_requested' };
    }
    console.error("[refund] failed to create refund record:", err);
    return { initiated: false, reason: 'create_failed', error: String(err) };
  }

  // If TREASURY_SECRET_KEY is missing, mark no provider and exit (caller can log)
  if (!process.env.TREASURY_SECRET_KEY) {
    // remove the created record to avoid marking "attempted" when nothing done? No — keep record for visibility.
    await TransactionRefund.updateOne({ txSignature }, { $set: { processedAt: new Date(), status: 'failed', error: 'TREASURY_SECRET_KEY not configured' } }).exec();
    console.warn("[refund] TREASURY_SECRET_KEY not configured; cannot perform on-chain refund");
    return { initiated: false, reason: 'no_provider', error: 'TREASURY_SECRET_KEY not configured' };
  }

  // perform on-chain refund
  try {
    const providerResult = await performExternalRefundOnSolana(txSignature, destinationPubKey, amountLamports);
    await TransactionRefund.updateOne({ txSignature }, { $set: { processedAt: new Date(), status: 'processed', error: null, providerResult } }).exec();
    return { initiated: true, succeeded: true, providerResult };
  } catch (err: any) {
    await TransactionRefund.updateOne({ txSignature }, { $set: { processedAt: new Date(), status: 'failed', error: String(err) } }).exec();
    console.error("[refund] external refund failed for", txSignature, err);
    return { initiated: true, succeeded: false, error: String(err) };
  }
}

/* -------------------- create/reactivate helpers -------------------- */

/**
 * Non-transactional fallback (for standalone mongod).
 */
async function createOrReactivateWebsiteNonTransactional(params: {
  userId: string;
  url: string;
  ownerEmail?: string | null;
  txSignature: string;
}) {
  const { userId, url, ownerEmail = null, txSignature } = params;

  if (txSignature) {
    const used = await WebsiteModel.findOne({ txSignature }).exec();
    if (used) {
      const e: any = new Error('Transaction signature already used');
      e.code = 409;
      throw e;
    }
  }

  const reactivated = await WebsiteModel.findOneAndUpdate(
    { userId, url, disabled: true },
    {
      $set: {
        disabled: false,
        ownerEmail: ownerEmail ?? undefined,
        lastAlertAt: null,
        txSignature: txSignature ?? undefined,
      },
    },
    { new: true }
  ).exec();

  if (reactivated) return reactivated;

  const existing = await WebsiteModel.findOne({ userId, url }).exec();
  if (existing) {
    const e: any = new Error('Website already exists for this user');
    e.code = 409;
    throw e;
  }

  try {
    const created = await WebsiteModel.create({
      url,
      userId,
      ownerEmail,
      lastAlertAt: null,
      ticks: [],
      disabled: false,
      alertCooldownMinutes: 30,
      txSignature,
    });
    return created;
  } catch (err: any) {
    if ((err as any).code === 11000) {
      const e: any = new Error('Duplicate key on create (possible txSignature conflict)');
      e.code = 409;
      throw e;
    }
    throw err;
  }
}

/**
 * Transactional attempt — requires replica set. Caller will fall back on code 20 error.
 */
async function createOrReactivateWebsiteAtomic(params: {
  userId: string;
  url: string;
  ownerEmail?: string | null;
  txSignature: string;
}) {
  const { userId, url, ownerEmail = null, txSignature } = params;
  const session = await mongoose.startSession();
  try {
    let resultDoc: any = null;
    await session.withTransaction(async () => {
      if (txSignature) {
        const used = await WebsiteModel.findOne({ txSignature }).session(session).exec();
        if (used) {
          const e: any = new Error('Transaction signature already used');
          e.code = 409;
          throw e;
        }
      }

      const existing = await WebsiteModel.findOne({ userId, url }).session(session).exec();

      if (existing) {
        if (existing.disabled) {
          existing.disabled = false;
          existing.ownerEmail = ownerEmail ?? existing.ownerEmail;
          existing.lastAlertAt = null;
          existing.txSignature = txSignature ?? existing.txSignature;
          await existing.save({ session });
          resultDoc = existing;
          return;
        }
        const err: any = new Error('Website already exists for this user');
        err.code = 409;
        throw err;
      }

      const createdArr = await WebsiteModel.create(
        [
          {
            url,
            userId,
            ownerEmail,
            lastAlertAt: null,
            ticks: [],
            disabled: false,
            alertCooldownMinutes: 30,
            txSignature,
          },
        ],
        { session }
      );
      resultDoc = createdArr[0];
    }, {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' },
    });
    return resultDoc;
  } finally {
    session.endSession();
  }
}

/* -------------------- controller -------------------- */

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

    // Verify tx on chain
    let parsed: any = null;
    let transferredLamports = 0;
    try {
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
        const r = await initiateRefundOnce(txSignature, 'treasury_missing_in_tx', payerPublicKey, undefined);
        if (r.initiated === false) {
          console.error('[CreateWebsiteController] refund not initiated:', r);
        }
        res.status(402).json({ success: false, message: "Transaction did not include the expected treasury account" });
        return;
      }

      // 1) Prefer parsed transfer detection
      transferredLamports = sumParsedTransfersToTreasury(parsed, TREASURY_PUBKEY);

      // 2) Fallback to pre/post diff
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
        const r = await initiateRefundOnce(txSignature, 'transferred_too_small', payerPublicKey, transferredLamports || undefined);
        if (r.initiated === false) {
          console.error('[CreateWebsiteController] refund not initiated:', r);
        }
        if (CLERK_DEBUG) {
          console.warn("[tx] transferred too small", { transferredLamports, required: REQUIRED_LAMPORTS });
          res.status(402).json({
            success: false,
            message: `Transferred amount too small. Required at least ${REQUIRED_LAMPORTS} lamports`,
            debug: { transferredLamports, required: REQUIRED_LAMPORTS },
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
        const r = await initiateRefundOnce(txSignature, 'payer_public_key_mismatch', payerPublicKey, transferredLamports || undefined);
        if (r.initiated === false) {
          console.error('[CreateWebsiteController] refund not initiated:', r);
        }
        res.status(400).json({ success: false, message: "Payer public key does not match transaction accounts" });
        return;
      }
    } catch (err) {
      console.error("Solana tx verification failed", err);
      try {
        const r = await initiateRefundOnce(txSignature, 'tx_verification_error', payerPublicKey, transferredLamports || undefined);
        if (r.initiated === false) {
          console.error('[CreateWebsiteController] refund not initiated:', r);
        }
      } catch (e) { /* swallow */ }
      res.status(500).json({ success: false, message: "Failed to verify Solana transaction" });
      return;
    }

    // Clerk email lookup
    let ownerEmail: string | null = null;
    ownerEmail = await fetchClerkEmail(id);
    if (CLERK_DEBUG) console.debug("[CreateWebsiteController] clerk email lookup result:", ownerEmail);
    if (!ownerEmail && ownerEmailFromClient && typeof ownerEmailFromClient === "string") {
      ownerEmail = ownerEmailFromClient;
      if (CLERK_DEBUG) console.debug("[CreateWebsiteController] using ownerEmail from client fallback:", ownerEmail);
    }

    // Create/reactivate with transactional attempt, fallback to non-transactional if needed.
    let savedWebsite: any = null;
    try {
      try {
        savedWebsite = await createOrReactivateWebsiteAtomic({
          userId: id,
          url,
          ownerEmail,
          txSignature,
        });
      } catch (atomicErr: any) {
        const code = (atomicErr && (atomicErr as any).code) || (atomicErr && atomicErr.errorResponse && atomicErr.errorResponse.code);
        if (code === 20) {
          if (CLERK_DEBUG) console.warn('[CreateWebsiteController] Mongo does not support transactions; falling back to non-transactional flow');
          savedWebsite = await createOrReactivateWebsiteNonTransactional({
            userId: id,
            url,
            ownerEmail,
            txSignature,
          });
        } else {
          throw atomicErr;
        }
      }

      if (CLERK_DEBUG) console.debug("[CreateWebsiteController] created/reactivated website:", String(savedWebsite._id));
      res.status(201).json({
        success: true,
        message: savedWebsite.disabled ? "Website reactivated." : "New website added successfully.",
        data: savedWebsite,
      });
      return;
    } catch (err: any) {
      // Duplicate conflict -> attempt one-time refund for incoming txSignature and return 409 with refund outcome
      if (err && (err as any).code === 409) {
        try {
          const refundResult = await initiateRefundOnce(txSignature, 'duplicate_site', payerPublicKey, transferredLamports || undefined);
          if (CLERK_DEBUG) console.debug('[CreateWebsiteController] duplicate-site refund result:', refundResult);
          res.status(409).json({
            success: false,
            message: err.message ?? "Conflict",
            refund: refundResult
          });
          return;
        } catch (refundErr) {
          console.error('[CreateWebsiteController] refund attempt failed for duplicate-site:', refundErr);
          res.status(409).json({
            success: false,
            message: err.message ?? "Conflict",
            refund: { initiated: false, reason: 'initiate_failed', error: String(refundErr) }
          });
          return;
        }
      }

      // Other failures -> attempt one-time refund then 500
      try {
        const r = await initiateRefundOnce(txSignature, `db_create_failed: ${String(err)}`, payerPublicKey, transferredLamports || undefined);
        if (r.initiated === false) {
          console.error('[CreateWebsiteController] refund not initiated:', r);
        }
      } catch (refundErr) {
        console.error("[CreateWebsiteController] refund attempt failed:", refundErr);
      }

      console.error("[DB] createOrReactivateWebsite failed", err);
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
