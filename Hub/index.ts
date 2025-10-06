// Hub/index.ts — final fixed, runtime-safe version (with owner-id / validator-id casting and improved diagnostics)
import dotenv from "dotenv";
dotenv.config();

import util from "util";
import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";
import nodemailer from "nodemailer";

/**
 * NOTE: previously there was a `import type { SignupIncomingMessage, IncomingMessage } from "../dp-uptime-backend/common/index.ts";`
 * To be safe at runtime we keep these as `any`-aliases here.
 */
type SignupIncomingMessage = any;
type IncomingMessage = any;

// ---------------- safer global handlers ----------------
process.on("uncaughtException", (err: unknown) => {
  try {
    console.error("UNCAUGHT EXCEPTION:");
    if (err instanceof Error) {
      console.error("name:", err.name);
      console.error("message:", err.message);
      if (err.stack) console.error("stack:", err.stack);
      else console.error("error (no stack):", util.inspect(err, { depth: null }));
    } else {
      console.error("Non-Error thrown:", util.inspect(err, { showHidden: true, depth: null }));
      try {
        console.error("JSON:", JSON.stringify(err));
      } catch { /* ignore */ }
    }
  } catch (logErr) {
    console.error("Failed logging uncaughtException:", logErr);
  } finally {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason: unknown) => {
  try {
    console.error("UNHANDLED REJECTION:");
    if (reason instanceof Error) {
      console.error("message:", reason.message);
      if (reason.stack) console.error("stack:", reason.stack);
      else console.error("error (no stack):", util.inspect(reason, { depth: null }));
    } else {
      console.error("Reason:", util.inspect(reason, { showHidden: true, depth: null }));
      try {
        console.error("JSON:", JSON.stringify(reason));
      } catch { /* ignore */ }
    }
  } catch (logErr) {
    console.error("Failed logging unhandledRejection:", logErr);
  } finally {
    process.exit(1);
  }
});

// ---------------- placeholders which will be registered after mongoose connect ----
let ValidatorModel: any = null;
let Website: any = null;
let WebsiteTick: any = null;

// config
const ALERT_CONSECUTIVE_REQUIRED = Number(process.env.ALERT_CONSECUTIVE_REQUIRED ?? "1");
const ALERT_CONSECUTIVE_LOOKBACK = Number(process.env.ALERT_CONSECUTIVE_LOOKBACK ?? "3");

// ---------- Nodemailer setup ----------
let mailTransporter: any = null;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "no-reply@example.com";

function mask(s: string | undefined) {
  if (!s) return "<missing>";
  if (s.length <= 6) return "******";
  return s.slice(0, 3) + "..." + s.slice(-3);
}

console.log("[HUB] SMTP env snapshot:", {
  SMTP_HOST: process.env.SMTP_HOST ? "present" : "missing",
  SMTP_PORT: process.env.SMTP_PORT ?? "(default 587)",
  SMTP_USER: mask(process.env.SMTP_USER),
  SMTP_PASS: process.env.SMTP_PASS ? "present" : "missing",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "(missing)",
});

const SMTP_HOST = (process.env.SMTP_HOST || "").trim();
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = (process.env.SMTP_PASS || "").trim();
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  try {
    const secure = SMTP_PORT === 465;
    mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      logger: true,
      debug: true,
    } as any);

    mailTransporter
      .verify()
      .then(() => console.log("[HUB] Nodemailer transporter verified"))
      .catch((err: any) => console.warn("[HUB] Nodemailer verification failed (kept transporter):", err && err.message ? err.message : err));
  } catch (err) {
    console.warn("[HUB] Failed to create Nodemailer transporter:", err);
    mailTransporter = null;
  }
} else {
  console.warn("[HUB] SMTP config incomplete — email notifications will be skipped until env is set");
  mailTransporter = null;
}

async function sendEmail_Nodemailer(to: string, subject: string, text: string, html?: string) {
  if (!mailTransporter) {
    console.warn("[HUB] Mail transporter not configured — skipping email to", to);
    return;
  }
  const msg = { from: EMAIL_FROM, to, subject, text, html };
  console.log("[HUB] sending email msg:", { from: EMAIL_FROM, to, subject });
  try {
    const info = await mailTransporter.sendMail(msg);
    console.log("[HUB] Email sent:", info && (info.messageId ?? info.response));
    return info;
  } catch (err: any) {
    console.error("[HUB] sendEmail_Nodemailer error:", err && err.message ? err.message : err);
    // rethrow so caller can handle logging/state if needed
    throw err;
  }
}

// ---------------- helpers ----------------
async function verifyMessage(message: string, publicKey: string, signature: string): Promise<boolean> {
  if (!signature) {
    console.warn("[HUB] verifyMessage: missing signature");
    return false;
  }
  let sigArr: number[] | undefined;
  try {
    sigArr = JSON.parse(signature);
    if (!Array.isArray(sigArr)) throw new Error("signature is not an array");
  } catch (err) {
    console.warn("[HUB] verifyMessage JSON.parse failed:", err);
    return false;
  }
  try {
    const messageBytes = nacl_util.decodeUTF8(message);
    return nacl.sign.detached.verify(messageBytes, new Uint8Array(sigArr), new PublicKey(publicKey).toBytes());
  } catch (err) {
    console.warn("[HUB] verifyMessage verify failed:", err);
    return false;
  }
}

async function hasConsecutiveBadTicks(websiteId: any, required: number, lookback: number) {
  if (required <= 1) return true;
  const n = Math.max(required, lookback);
  const recent = await WebsiteTick.find({ websiteId }).sort({ createdAt: -1 }).limit(n).lean();
  if (recent.length < required) return false;
  const slice = recent.slice(0, required);
  return slice.every((t: any) => String(t.status).toLowerCase() === "bad");
}

// ---------------- state ----------------
// availableValidators now tracks optional tabId and lastNotified fields
const availableValidators: {
  validatorId: string;
  socket: WebSocket;
  publicKey: string;
  sessionToken?: string | null;
  tabId?: string | null;
  lastNotifiedFromTab?: string | null;
  lastNotifiedAt?: number | null;
}[] = [];

const CALLBACKS: { [callbackId: string]: (data: IncomingMessage) => void } = {};
const COST_PER_VALIDATION = 100;

// ---------------- broadcast helper ----------------
async function broadcastEarningToValidator(validatorId: string, earnedLamports: number) {
  try {
    const vdoc: any = await ValidatorModel.findById(validatorId).lean();
    const pending = vdoc ? Number(vdoc.pendingPayouts || 0) : null;
    const targets = availableValidators.filter((v) => String(v.validatorId) === String(validatorId));
    if (targets.length === 0) {
      console.debug("[HUB] broadcastEarning: no connected sockets for validator", validatorId);
      return;
    }
    const payload = { type: "earning", data: { time: Date.now(), value: Number(earnedLamports || 0), pendingPayouts: pending } };
    for (const t of targets) {
      try {
        t.socket.send(JSON.stringify(payload));
      } catch (sendErr) {
        console.warn("[HUB] broadcastEarning: failed to send to socket for", validatorId, sendErr);
      }
    }
  } catch (err) {
    console.error("[HUB] broadcastEarningToValidator error:", err);
  }
}

// ---------------- signup handler ----------------
async function signupHandler(ws: WebSocket, { ip, publicKey, signedMessage, callbackId }: SignupIncomingMessage) {
  if (mongoose.connection.readyState !== 1) {
    console.warn("[HUB] DB not connected — cannot process signup right now");
    return;
  }
  try {
    const validator = await ValidatorModel.findOne({ publicKey });
    if (validator) {
      console.log("Existing validator found:", validator._id?.toString?.());
      ws.send(JSON.stringify({ type: "signup", data: { validatorId: validator._id, callbackId } }));
      addAvailableValidator(validator._id.toString(), ws, validator.publicKey, null, null);
      return;
    }
    const newValidator = await ValidatorModel.create({ ip, publicKey, location: "unknown" });
    console.log("Created validator:", newValidator._id?.toString?.());
    ws.send(JSON.stringify({ type: "signup", data: { validatorId: newValidator._id, callbackId } }));
    addAvailableValidator(newValidator._id.toString(), ws, newValidator.publicKey, null, null);
  } catch (err) {
    console.error("[HUB] signupHandler DB error:", err);
  }
}

// ---------------- transactional persist with fallback ----------------
async function persistTickAndPayoutFallback(websiteId: any, websiteOwnerId: any, validatorId: any, status: string, latency: number) {
  function castId(id: any) {
    try {
      if (!id) return id;
      return mongoose.Types.ObjectId.isValid(String(id)) ? mongoose.Types.ObjectId(String(id)) : id;
    } catch {
      return id;
    }
  }
  const castValidatorId = castId(validatorId);
  const castWebsiteId = castId(websiteId);
  const castWebsiteOwnerId = castId(websiteOwnerId);

  // Try transaction first
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const created = await WebsiteTick.create([{ websiteId: castWebsiteId, validatorId: castValidatorId, status, latency, createdAt: new Date() }], { session });
        const tickDoc = Array.isArray(created) ? created[0] : created;
        const tickId = tickDoc._id;
        console.debug("[HUB] Tx: created tick", tickId?.toString?.());

        const websiteUpdateRes: any = await Website.updateOne({ _id: castWebsiteId, userId: castWebsiteOwnerId }, { $push: { ticks: tickId } }, { session });
        const matched = websiteUpdateRes.matchedCount ?? (websiteUpdateRes as any).n ?? (websiteUpdateRes as any).nMatched ?? 0;
        const modified = websiteUpdateRes.modifiedCount ?? (websiteUpdateRes as any).nModified ?? 0;
        console.debug("[HUB] Tx: website update result", { matched, modified });

        if (matched === 0 && modified === 0) {
          console.warn("[HUB] Tx: website update matched 0 — Dumping values for debug:",
            {
              castWebsiteId: String(castWebsiteId),
              castWebsiteOwnerId: String(castWebsiteOwnerId),
              websiteIdType: Object.prototype.toString.call(castWebsiteId),
              websiteOwnerIdType: Object.prototype.toString.call(castWebsiteOwnerId),
            }
          );
          throw new Error("Website update matched 0 docs (owner mismatch or missing) - aborting tx for fallback");
        }

        const updatedValidator = await ValidatorModel.findByIdAndUpdate(castValidatorId, { $inc: { pendingPayouts: COST_PER_VALIDATION } }, { new: true, session, lean: true }).exec();
        if (!updatedValidator) {
          throw new Error("Validator findByIdAndUpdate returned null in transaction");
        }
        console.log("[HUB] Tx: updated validator pendingPayouts ->", updatedValidator._id?.toString?.(), updatedValidator.pendingPayouts);

        try {
          await broadcastEarningToValidator(String(updatedValidator._id), COST_PER_VALIDATION);
        } catch (bErr) {
          console.warn("[HUB] Tx: broadcast failed:", bErr);
        }
      });
      session.endSession();
      console.log("[HUB] Transactional persist completed successfully");
      return;
    } catch (txErr: any) {
      try { await session.abortTransaction(); } catch { /* */ }
      session.endSession();
      console.warn("[HUB] Transaction failed, will fallback. reason:", txErr && txErr.message ? txErr.message : txErr);
    }
  } catch (startErr: any) {
    console.warn("[HUB] startSession failed (transactions unavailable) — falling back:", startErr && startErr.message ? startErr.message : startErr);
  }

  // Fallback
  try {
    const tickDoc = await WebsiteTick.create({ websiteId: castWebsiteId, validatorId: castValidatorId, status, latency, createdAt: new Date() });
    console.debug("[HUB] Fallback: created tick", tickDoc._id?.toString?.());

    // Try guarded push first (preserves owner check); if that doesn't match, do an unguarded push as a last resort
    const pushRes: any = await Website.updateOne({ _id: castWebsiteId, userId: castWebsiteOwnerId }, { $push: { ticks: tickDoc._id } });
    const matchedPush = pushRes.matchedCount ?? (pushRes as any).n ?? 0;
    const modifiedPush = pushRes.modifiedCount ?? (pushRes as any).nModified ?? 0;
    if (matchedPush === 0 && modifiedPush === 0) {
      // Owner mismatch or website not found under that owner — log and attempt unguarded push so tick is linked
      console.warn("[HUB] Non-transactional push: website not found or owner mismatch. Dumping values:",
        { castWebsiteId: String(castWebsiteId), castWebsiteOwnerId: String(castWebsiteOwnerId), pushRes });
      try {
        const unguardedPushRes: any = await Website.updateOne({ _id: castWebsiteId }, { $push: { ticks: tickDoc._id } });
        const matchedU = unguardedPushRes.matchedCount ?? (unguardedPushRes as any).n ?? 0;
        const modifiedU = unguardedPushRes.modifiedCount ?? (unguardedPushRes as any).nModified ?? 0;
        if (matchedU === 0 && modifiedU === 0) {
          console.warn("[HUB] Unguarded push also failed — website may not exist. pushRes:", unguardedPushRes);
        } else {
          console.log("[HUB] Unguarded push succeeded — tick linked despite owner mismatch.");
        }
      } catch (unguardErr) {
        console.error("[HUB] Unguarded push attempt failed:", unguardErr);
      }
      console.warn("[HUB] Non-transactional push: website not found or owner mismatch. Tick created but owner-guard failed.");
    } else {
      console.log("[HUB] Pushed tick id into website.ticks (non-transactional)");
    }

    // Update validator pending payouts (non-transactional), using cast id
    const updatedValidator = await ValidatorModel.findByIdAndUpdate(castValidatorId, { $inc: { pendingPayouts: COST_PER_VALIDATION } }, { new: true, lean: true }).exec();
    if (!updatedValidator) {
      console.warn("[HUB] Validator update matched 0 docs — validatorId may be invalid.", { castValidatorId: String(castValidatorId) });
      try {
        const maybeValidator = await ValidatorModel.findById(castValidatorId).lean();
        console.warn("[HUB] Validator findById check (post-failure) ->", maybeValidator ? { id: String(maybeValidator._id), pendingPayouts: maybeValidator.pendingPayouts } : "not found");
      } catch (vErr) {
        console.error("[HUB] Validator findById after failed update threw:", vErr);
      }
    } else {
      console.log("[HUB] Updated validator pending payouts (non-transactional) ->", updatedValidator._id?.toString?.(), updatedValidator.pendingPayouts);
      try { await broadcastEarningToValidator(String(updatedValidator._id), COST_PER_VALIDATION); } catch (e) { /* noop */ }
    }
  } catch (fallbackErr) {
    console.error("[HUB] Non-transactional fallback failed:", fallbackErr);
    throw fallbackErr;
  }
}

// ---------------- notification helper ----------------
async function tryNotifyOwnerIfNeeded(websiteId: any, websiteOwnerId: any, status: string, latency: number) {
  try {
    console.debug("[HUB] notify: invoked", { websiteId: String(websiteId), websiteOwnerId: String(websiteOwnerId), status, latency });
    if (String(status).toLowerCase() !== "bad") {
      console.debug("[HUB] notify: status not 'bad', skipping");
      return;
    }
    const websiteDoc: any = await Website.findById(websiteId).lean();
    if (!websiteDoc) {
      console.warn("[HUB] notify: website not found", { websiteId: String(websiteId) });
      return;
    }

    // defensive ownerEmail lookup: many apps use different fields; fallbacks included
    const ownerEmail = websiteDoc.ownerEmail ?? websiteDoc.email ?? websiteDoc.owner?.email ?? null;
    if (!ownerEmail) {
      console.log("[HUB] notify: no ownerEmail; skipping notification", { websiteId: String(websiteId), websiteDoc });
      return;
    }

    if (ALERT_CONSECUTIVE_REQUIRED > 1) {
      const ok = await hasConsecutiveBadTicks(websiteId, ALERT_CONSECUTIVE_REQUIRED, ALERT_CONSECUTIVE_LOOKBACK);
      if (!ok) {
        console.log("[HUB] notify: not enough consecutive bad ticks; skipping");
        return;
      }
    }

    const cooldownMinutes = websiteDoc.alertCooldownMinutes ?? 15;
    const lastAlertAt = websiteDoc.lastAlertAt ? new Date(websiteDoc.lastAlertAt).getTime() : 0;
    const now = Date.now();
    if (now - lastAlertAt < cooldownMinutes * 60 * 1000) {
      console.log("[HUB] notify: cooldown in effect; skipping email", {
        websiteId: String(websiteId),
        lastAlertAt: lastAlertAt ? new Date(lastAlertAt).toISOString() : "<none>",
        cooldownMinutes,
      });
      return;
    }

    if (!mailTransporter) {
      console.warn("[HUB] notify: mailTransporter not configured — cannot send email", { to: ownerEmail });
      return;
    }

    const subject = `Alert: ${websiteDoc.url} appears down`;
    const text = `Your website ${websiteDoc.url} was reported down at ${new Date().toLocaleString()}. Latency: ${latency} ms.`;
    const html = `<p>Your website <strong>${websiteDoc.url}</strong> was reported down at <strong>${new Date().toLocaleString()}</strong>.</p>\n<p>Latency: <strong>${latency} ms</strong></p>`;

    try {
      const info = await sendEmail_Nodemailer(ownerEmail, subject, text, html);
      try {
        await Website.updateOne({ _id: websiteId }, { $set: { lastAlertAt: new Date() } });
      } catch (uErr) {
        console.warn("[HUB] notify: failed updating lastAlertAt on website:", uErr);
      }
      console.log("[HUB] Sent downtime email to", ownerEmail, "info:", info && (info.messageId ?? info.response));
    } catch (emailErr) {
      console.error("[HUB] Failed sending email:", emailErr);
    }
  } catch (err) {
    console.error("[HUB] Notification error:", err);
  }
}

// ---------------- cron job ----------------
const CRON_INTERVAL_MS = Number(process.env.CRON_INTERVAL_MS ?? 60_000);
let cronInterval: NodeJS.Timeout | null = null;

function addAvailableValidator(validatorId: string, socket: WebSocket, publicKey: string, sessionToken?: string | null, tabId?: string | null) {
  // If a record for the same socket exists, update it
  const existsSocket = availableValidators.find((v) => v.socket === socket);
  if (existsSocket) {
    existsSocket.sessionToken = sessionToken ?? existsSocket.sessionToken;
    existsSocket.tabId = tabId ?? existsSocket.tabId;
    return;
  }

  // If a validator entry with same validatorId & same tabId exists, replace its socket
  for (let i = 0; i < availableValidators.length; i++) {
    const v = availableValidators[i];
    if (String(v.validatorId) === String(validatorId) && tabId && v.tabId && v.tabId === tabId) {
      // replace socket in-place
      try { v.socket.close(); } catch { /* ignore */ }
      v.socket = socket;
      v.publicKey = publicKey;
      v.sessionToken = sessionToken ?? v.sessionToken;
      v.tabId = tabId;
      console.log("[HUB] Replaced existing validator socket for same validatorId+tabId:", validatorId, tabId);
      return;
    }
  }

  // Otherwise push new entry
  availableValidators.push({ validatorId, socket, publicKey, sessionToken: sessionToken ?? null, tabId: tabId ?? null, lastNotifiedFromTab: null, lastNotifiedAt: null });
  console.log("[HUB] Validator added to availableValidators:", validatorId, tabId ?? "<no-tab>");
  startCronIfNeeded();
}

function removeAvailableValidatorBySocket(socket: WebSocket) {
  const before = availableValidators.length;
  for (let i = availableValidators.length - 1; i >= 0; i--) {
    if (availableValidators[i].socket === socket) availableValidators.splice(i, 1);
  }
  if (availableValidators.length !== before) {
    console.log("[HUB] Removed validator(s) for closed socket. remaining:", availableValidators.length);
  }
  stopCronIfIdle();
}

function startCronIfNeeded() {
  if (!cronInterval && availableValidators.length > 0) {
    console.log("[HUB] Starting cron (validators available). Interval ms =", CRON_INTERVAL_MS);
    startCron();
  }
}

function stopCronIfIdle() {
  if (cronInterval && availableValidators.length === 0) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log("[HUB] Cron stopped — no validators available");
  }
}

async function runCronIteration() {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.warn("[HUB] Skipping cron iteration — DB not connected");
      return;
    }
    const websitesToMonitor = await Website.find({ disabled: false });
    for (const website of websitesToMonitor) {
      for (const validator of availableValidators) {
        const callbackId = randomUUID();
        console.log(`[HUB] sending validate to validator=${validator.validatorId} url=${website.url} websiteId=${website._id} callbackId=${callbackId}`);
        try {
          validator.socket.send(JSON.stringify({ type: "validate", data: { url: website.url, callbackId, websiteId: website._id } }));
        } catch (sendErr) {
          console.warn("[HUB] failed to send validate to validator socket, removing it soon if closed:", sendErr);
        }
        const serverValidatorId = validator.validatorId;
        CALLBACKS[callbackId] = async (data: IncomingMessage) => {
          try {
            if (data.type !== "validate") return;
            const { status, latency, signedMessage, sessionToken } = data.data;
            let verified = false;
            if (signedMessage) {
              verified = await verifyMessage(`Replying to ${callbackId}`, validator.publicKey, signedMessage);
              if (!verified) console.warn("[HUB] validate reply signature failed verification (signedMessage present)");
            } else if (sessionToken) {
              if (validator.sessionToken && validator.sessionToken === sessionToken) verified = true;
              else {
                if (!validator.sessionToken) {
                  console.warn("[HUB] validate reply contained sessionToken but Hub has no stored token for this validator — accepting best-effort");
                  verified = true;
                } else {
                  console.warn("[HUB] validate reply sessionToken mismatch — rejecting");
                  verified = false;
                }
              }
            } else {
              console.warn("[HUB] validate reply contained neither signedMessage nor sessionToken — rejecting");
              verified = false;
            }
            if (!verified) return;
            await persistTickAndPayoutFallback(website._id, website.userId, serverValidatorId, status, latency);
            await tryNotifyOwnerIfNeeded(website._id, website.userId, status, latency);
          } catch (err) {
            console.error("[HUB] Error in CALLBACK handler:", err);
          }
        };
      }
    }
  } catch (err) {
    console.error("Cron job iteration failed:", err);
  }
}

function startCron() {
  if (cronInterval) return;
  runCronIteration().catch((e) => console.error("[HUB] initial cron iteration failed:", e));
  cronInterval = setInterval(() => runCronIteration().catch((e) => console.error("[HUB] cron iteration failed:", e)), CRON_INTERVAL_MS);
}

function stopCron() {
  if (!cronInterval) return;
  clearInterval(cronInterval);
  cronInterval = null;
}

// ---------------- mongoose setup & connect ----------------
mongoose.set("bufferCommands", false);
mongoose.set("debug", function (coll: string, method: string, query: any, doc: any) {
  try {
    const q = JSON.stringify(query);
    const d = doc ? JSON.stringify(doc) : "";
    console.debug("[MONGOOSE]", coll, method, q, d);
  } catch {
    console.debug("[MONGOOSE]", coll, method);
  }
});
mongoose.connection.on("connecting", () => console.log("[HUB:MONGO] connecting..."));
mongoose.connection.on("connected", () => console.log("[HUB:MONGO] connected"));
mongoose.connection.on("reconnected", () => console.log("[HUB:MONGO] reconnected"));
mongoose.connection.on("disconnected", () => console.warn("[HUB:MONGO] disconnected"));
mongoose.connection.on("close", () => console.warn("[HUB:MONGO] connection closed"));
mongoose.connection.on("error", (err) => console.error("[HUB:MONGO] error:", err && (err as any).message ? (err as any).message : err));

async function connectWithRetries(uri: string, attempts = 5, waitMs = 2000) {
  const opts: any = { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 10000 };
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`[HUB] Attempting MongoDB connect (attempt ${i}/${attempts}) -> ${uri}`);
      await mongoose.connect(uri, opts);
      console.log("[HUB] MongoDB connected from HUB");
      return;
    } catch (err) {
      console.error(`[HUB] MongoDB connect attempt ${i} failed:`, err && (err as any).message ? (err as any).message : err);
      if (i < attempts) {
        console.log(`[HUB] Retrying in ${waitMs}ms...`);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
}

// ---------------- Import backend model modules AND rebind their schemas to THIS mongoose instance ----
async function importAndRebindModels() {
  const vmod = await import("../dp-uptime-backend/model/Validator.model.ts");
  const importedValidator = (vmod as any).default ?? vmod;
  if (!importedValidator || !importedValidator.schema) throw new Error("Validator model import missing schema");

  const wmod = await import("../dp-uptime-backend/model/Website.model.ts");
  const importedWebsite = (wmod as any).default ?? (wmod as any).Website ?? wmod;
  if (!importedWebsite || !importedWebsite.schema) throw new Error("Website model import missing schema");

  const tmod = await import("../dp-uptime-backend/model/WebsiteTick.model.ts");
  const importedWebsiteTick = (tmod as any).default ?? (tmod as any).WebsiteTick ?? tmod;
  if (!importedWebsiteTick || !importedWebsiteTick.schema) throw new Error("WebsiteTick model import missing schema");

  const conn = mongoose.connection;

  const vName = importedValidator.modelName ?? "Validator";
  const vColl = importedValidator.collection && importedValidator.collection.name ? importedValidator.collection.name : undefined;
  if (conn.models && conn.models[vName]) ValidatorModel = conn.models[vName];
  else ValidatorModel = conn.model(vName, importedValidator.schema, vColl);

  const wName = importedWebsite.modelName ?? "Website";
  const wColl = importedWebsite.collection && importedWebsite.collection.name ? importedWebsite.collection.name : undefined;
  if (conn.models && conn.models[wName]) Website = conn.models[wName];
  else Website = conn.model(wName, importedWebsite.schema, wColl);

  const tName = importedWebsiteTick.modelName ?? "WebsiteTick";
  const tColl = importedWebsiteTick.collection && importedWebsiteTick.collection.name ? importedWebsiteTick.collection.name : undefined;
  if (conn.models && conn.models[tName]) WebsiteTick = conn.models[tName];
  else WebsiteTick = conn.model(tName, importedWebsiteTick.schema, tColl);

  console.log("[HUB] Imported backend model schemas and registered them on Hub mongoose connection.");
  console.log("[HUB] Bound models ->", {
    mongooseDb: conn.name,
    Validator: { name: ValidatorModel.modelName, collection: ValidatorModel.collection?.name },
    Website: { name: Website.modelName, collection: Website.collection?.name },
    WebsiteTick: { name: WebsiteTick.modelName, collection: WebsiteTick.collection?.name },
  });
}

// ----------------bootstrap----------------
(async function bootstrap() {
  try {
    const MONGO_URI = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/dp-uptime";
    await connectWithRetries(MONGO_URI, 5, 2000);
    await importAndRebindModels();

    const app = express();
    app.use(express.json());
    app.get("/health", (_req, res) => {
      res.json({ mongooseReadyState: mongoose.connection.readyState, validators: availableValidators.length });
    });

    app.get("/test-email", async (_req, res) => {
      try {
        if (!mailTransporter) return res.status(500).json({ ok: false, msg: "mailTransporter not configured" });
        const to = process.env.SMTP_USER || process.env.EMAIL_FROM;
        const info = await sendEmail_Nodemailer(to!, "HUB test email", "This is a test from HUB", "<b>test</b>");
        res.json({ ok: true, info });
      } catch (err) {
        console.error("/test-email error:", err);
        res.status(500).json({ ok: false, error: String(err) });
      }
    });

    // Force-notify route for diagnostics (call to independently test notification logic)
    app.post("/force-notify/:websiteId", async (req, res) => {
      try {
        const websiteId = req.params.websiteId;
        if (!websiteId) return res.status(400).json({ ok: false, error: "missing websiteId" });
        const websiteDoc = await Website.findById(websiteId).lean();
        if (!websiteDoc) return res.status(404).json({ ok: false, error: "website not found" });

        console.log("[HUB] /force-notify called for", websiteId, "ownerEmail:", websiteDoc.ownerEmail ?? websiteDoc.email);
        await tryNotifyOwnerIfNeeded(websiteId, websiteDoc.userId, "bad", 1234);
        res.json({ ok: true, msg: "notification attempted (check logs)" });
      } catch (err) {
        console.error("/force-notify error:", err);
        res.status(500).json({ ok: false, error: String(err) });
      }
    });

    const port = process.env.HUB_PORT ? Number(process.env.HUB_PORT) : 8081;
    const server = app.listen(port, () => console.log(`[HUB] Server running on :${port}`));
    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws: WebSocket) => {
      ws.on("message", async (message: string | Buffer) => {
        try {
          const data: IncomingMessage = JSON.parse(message.toString());
          console.log("[HUB] got message from validator:", data.type, data.data);

          if (data.type === "signup") {
            const verified = await verifyMessage(`Signed message for ${data.data.callbackId}, ${data.data.publicKey}`, data.data.publicKey, data.data.signedMessage);
            if (verified) await signupHandler(ws, data.data as SignupIncomingMessage);
            else console.warn("[HUB] signup signature verification failed");
          } else if (data.type === "resume") {
            try {
              const maybePublicKey = data.data?.publicKey ?? null;
              const maybeValidatorId = data.data?.validatorId ?? null;
              const incomingSessionToken = data.data?.sessionToken ?? null;
              const incomingTabId = data.data?.tabId ?? null;
              let dbValidator: any = null;
              if (maybePublicKey) dbValidator = await ValidatorModel.findOne({ publicKey: maybePublicKey }).lean();
              else if (maybeValidatorId) dbValidator = await ValidatorModel.findById(maybeValidatorId).lean();

              if (dbValidator) {
                addAvailableValidator(dbValidator._id.toString(), ws, dbValidator.publicKey, incomingSessionToken ?? null, incomingTabId ?? null);
                ws.send(JSON.stringify({ type: "resume", data: { ok: true, validatorId: dbValidator._id.toString() } }));
              } else {
                ws.send(JSON.stringify({ type: "resume", data: { ok: false } }));
              }
            } catch (err) {
              console.warn("[HUB] resume handler error:", err);
              ws.send(JSON.stringify({ type: "resume", data: { ok: false } }));
            }
          } else if (data.type === "validate") {
            if (CALLBACKS[data.data.callbackId]) {
              CALLBACKS[data.data.callbackId](data);
              delete CALLBACKS[data.data.callbackId];
            } else {
              console.warn("[HUB] Received validate reply but no callback found for", data.data.callbackId);
            }
          } else if (data.type === "subscribe_earnings") {
            try {
              const pk = data.data && data.data.publicKey;
              const incomingSessionToken = data.data?.sessionToken ?? null;
              const incomingTabId = data.data?.tabId ?? null;
              if (!pk) {
                ws.send(JSON.stringify({ type: "subscribed", data: { ok: false, error: "missing publicKey" } }));
                return;
              }

              const v = await ValidatorModel.findOne({ publicKey: pk }).lean();
              if (!v) {
                ws.send(JSON.stringify({ type: "subscribed", data: { ok: false, error: "validator not found" } }));
                return;
              }

              // Find an existing connected validator entry for this validator id
              const existing = availableValidators.find((a) => String(a.validatorId) === String(v._id));

              if (existing) {
                // If same tabId (client reconnect for same tab), replace socket (allow reconnect)
                if (existing.tabId && incomingTabId && existing.tabId === incomingTabId) {
                  console.log("[HUB] subscribe_earnings: same tab reconnect (replace socket)", v._id.toString(), incomingTabId);
                  try { existing.socket.close(); } catch { /* ignore */ }
                  addAvailableValidator(v._id.toString(), ws, v.publicKey, incomingSessionToken ?? null, incomingTabId ?? null);
                  ws.send(JSON.stringify({ type: "subscribed", data: { ok: true, validatorId: v._id.toString() } }));
                  return;
                }

                // different tab/device -> reject subscription and notify existing socket (but avoid rapid duplicate notifications)
                console.warn("[HUB] subscribe_earnings: duplicate connection detected for validator", v._id.toString(), { existingTabId: existing.tabId, incomingTabId });

                ws.send(JSON.stringify({ type: "subscribed", data: { ok: false, error: "duplicate_connection", message: "Multiple connections for this wallet detected (another tab/device)." } }));

                // send duplicate_detected to existing socket only if not recently notified for this incomingTabId
                const NOW = Date.now();
                const NOTIFY_WINDOW_MS = 30_000; // avoid notifying about same incomingTabId more than once in this window
                const lastFrom = existing.lastNotifiedFromTab ?? null;
                const lastAt = existing.lastNotifiedAt ?? 0;
                if (!(lastFrom === incomingTabId && (NOW - lastAt) < NOTIFY_WINDOW_MS)) {
                  try {
                    existing.socket.send(JSON.stringify({ type: "duplicate_detected", data: { message: "Another connection for this wallet detected (another tab/device).", incomingTabId } }));
                    existing.lastNotifiedFromTab = incomingTabId ?? null;
                    existing.lastNotifiedAt = NOW;
                  } catch (sendErr) {
                    console.warn("[HUB] failed to notify existing socket about duplicate", sendErr);
                  }
                } else {
                  console.debug("[HUB] skipping duplicate_detected notify (already notified recently) for", v._id.toString(), incomingTabId);
                }
                return;
              }

              // No existing entry: accept and register
              addAvailableValidator(v._id.toString(), ws, v.publicKey, incomingSessionToken ?? null, incomingTabId ?? null);
              ws.send(JSON.stringify({ type: "subscribed", data: { ok: true, validatorId: v._id.toString() } }));
            } catch (err) {
              console.warn("[HUB] subscribe_earnings handler error:", err);
              ws.send(JSON.stringify({ type: "subscribed", data: { ok: false, error: String(err) } }));
            }
          } else {
            console.warn("[HUB] Unknown message type from validator:", (data as any).type);
          }
        } catch (err) {
          console.error("Failed parsing/handling WS message:", err);
        }
      });

      ws.on("close", () => removeAvailableValidatorBySocket(ws));
      ws.on("error", () => removeAvailableValidatorBySocket(ws));
    });

    console.log("[HUB] bootstrap complete — running");
  } catch (err) {
    console.error("[HUB] Failed to bootstrap:", err);
    process.exit(1);
  }
})();
