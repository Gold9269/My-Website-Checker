// Hub/index.ts — final fixed version (connect first, then import & rebind backend model schemas)
// Nodemailer-based email sending (replaces SendGrid), logic otherwise left intact.

import dotenv from "dotenv";
dotenv.config();

import util from 'util';
process.on('uncaughtException', (err: any) => {
  console.error('UNCAUGHT EXCEPTION:');
  console.error(util.inspect(err, { showHidden: true, depth: null }));
  process.exit(1);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED REJECTION:');
  console.error(util.inspect(reason, { showHidden: true, depth: null }));
  process.exit(1);
});

import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";
import nodemailer from "nodemailer";

import type { SignupIncomingMessage, IncomingMessage } from "../dp-uptime-backend/common/index.ts";

// ---- placeholders which will be registered to this (Hub) mongoose after connect ----
let ValidatorModel: any = null;
let Website: any = null;
let WebsiteTick: any = null;

// config
const ALERT_CONSECUTIVE_REQUIRED = Number(process.env.ALERT_CONSECUTIVE_REQUIRED ?? "1"); // require N consecutive bad ticks
const ALERT_CONSECUTIVE_LOOKBACK = Number(process.env.ALERT_CONSECUTIVE_LOOKBACK ?? "3"); // how many last ticks to examine when N>1

// ---------- Nodemailer setup (robust, verbose) ----------
let mailTransporter: any = null;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "no-reply@example.com";

function mask(s: string | undefined) {
  if (!s) return "<missing>";
  if (s.length <= 6) return "******";
  return s.slice(0,3) + "..." + s.slice(-3);
}

console.log("[HUB] SMTP env snapshot:",
  {
    SMTP_HOST: process.env.SMTP_HOST ? "present" : "missing",
    SMTP_PORT: process.env.SMTP_PORT ?? "(default 587)",
    SMTP_USER: mask(process.env.SMTP_USER),
    SMTP_PASS: process.env.SMTP_PASS ? "present" : "missing",
    EMAIL_FROM: process.env.EMAIL_FROM ?? "(missing)"
  }
);

const SMTP_HOST = (process.env.SMTP_HOST || "").trim();
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = (process.env.SMTP_PASS || "").trim();
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  try {
    const secure = SMTP_PORT === 465; // common convention
    mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      logger: true,
      debug: true,
    } as any);

    // Verify but keep transporter even if verification fails so sendMail returns actionable errors
    mailTransporter.verify()
      .then(() => {
        console.log("[HUB] Nodemailer transporter verified");
      })
      .catch((err: any) => {
        console.warn("[HUB] Nodemailer verification failed (but transporter kept):", err && err.message ? err.message : err);
      });
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
  const msg = {
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
  };
  console.log("[HUB] sending email msg:", { from: EMAIL_FROM, to, subject });
  try {
    const info = await mailTransporter.sendMail(msg);
    console.log("[HUB] Email sent:", info && (info.messageId ?? info.response));
    return info;
  } catch (err:any) {
    console.error("[HUB] sendEmail_Nodemailer error:", err && err.message ? err.message : err);
    throw err;
  }
}

// ---------------- helpers ----------------
async function verifyMessage(message: string, publicKey: string, signature: string): Promise<boolean> {
  if (!signature) {
    // no signature provided
    console.warn('[HUB] verifyMessage called with undefined signature');
    return false;
  }

  let sigArr: number[] | undefined;
  try {
    sigArr = JSON.parse(signature);
    if (!Array.isArray(sigArr)) throw new Error('signature not array');
  } catch (err) {
    console.warn('[HUB] verifyMessage JSON.parse failed:', err);
    return false;
  }

  try {
    const messageBytes = nacl_util.decodeUTF8(message);
    return nacl.sign.detached.verify(
      messageBytes,
      new Uint8Array(sigArr),
      new PublicKey(publicKey).toBytes()
    );
  } catch (err) {
    console.warn('[HUB] verifyMessage error during verify:', err);
    return false;
  }
}

// check last N ticks to require consecutive bad ticks
async function hasConsecutiveBadTicks(websiteId: any, required: number, lookback: number) {
  if (required <= 1) return true; // no consecutive requirement
  const n = Math.max(required, lookback);
  const recent = await WebsiteTick.find({ websiteId }).sort({ createdAt: -1 }).limit(n).lean();
  if (recent.length < required) return false;
  // check last `required` entries
  const slice = recent.slice(0, required);
  return slice.every((t: any) => String(t.status).toLowerCase() === 'bad');
}

// ---------------- state ----------------
// NOTE: added sessionToken optional field
const availableValidators: { validatorId: string; socket: WebSocket; publicKey: string; sessionToken?: string | null }[] = [];
const CALLBACKS: { [callbackId: string]: (data: IncomingMessage) => void } = {};
const COST_PER_VALIDATION = 100;

// ---------------- broadcast helper ----------------
async function broadcastEarningToValidator(validatorId: string, earnedLamports: number) {
  try {
    // fetch fresh validator doc to get up-to-date pendingPayouts
    const vdoc: any = await ValidatorModel.findById(validatorId).lean();
    const pending = vdoc ? Number(vdoc.pendingPayouts || 0) : null;

    // find connected sockets for this validatorId
    const targets = availableValidators.filter(v => String(v.validatorId) === String(validatorId));
    if (targets.length === 0) {
      console.debug('[HUB] broadcastEarning: no connected sockets for validator', validatorId);
      return;
    }

    const payload = {
      type: 'earning',
      data: {
        time: Date.now(),
        value: Number(earnedLamports || 0),       // lamports earned this tick
        pendingPayouts: pending,                 // current pending (lamports)
      }
    };

    for (const t of targets) {
      try {
        t.socket.send(JSON.stringify(payload));
      } catch (sendErr) {
        console.warn('[HUB] broadcastEarning: failed to send to socket for', validatorId, sendErr);
      }
    }
  } catch (err) {
    console.error('[HUB] broadcastEarningToValidator error:', err);
  }
}

// ---------------- signup handler ----------------
async function signupHandler(ws: WebSocket, { ip, publicKey, signedMessage, callbackId }: SignupIncomingMessage) {
  if (mongoose.connection.readyState !== 1) {
    console.warn('[HUB] DB not connected — cannot process signup right now');
    return;
  }

  try {
    const validator = await ValidatorModel.findOne({ publicKey });
    if (validator) {
      console.log("Existing validator found:", validator._id?.toString?.());
      // NOTE: no sessionToken generation here (client may manage a token)
      ws.send(JSON.stringify({ type: "signup", data: { validatorId: validator._id, callbackId } }));
      addAvailableValidator(validator._id.toString(), ws, validator.publicKey);
      return;
    }

    const newValidator = await ValidatorModel.create({ ip, publicKey, location: "unknown" });
    console.log("Created validator:", newValidator._id?.toString?.());
    ws.send(JSON.stringify({ type: "signup", data: { validatorId: newValidator._id, callbackId } }));
    addAvailableValidator(newValidator._id.toString(), ws, newValidator.publicKey);
  } catch (err) {
    console.error('[HUB] signupHandler DB error:', err);
  }
}

// ---------------- transactional persist with fallback ----------------
async function persistTickAndPayoutFallback(
  websiteId: any,
  websiteOwnerId: any,
  validatorId: any,
  status: string,
  latency: number
) {
  // Try transactions first (if available)
  try {
    const session = await ValidatorModel.startSession();
    try {
      await session.startTransaction();

      // create the tick inside the transaction
      const created = await WebsiteTick.create(
        [{ websiteId, validatorId, status, latency, createdAt: new Date() }],
        { session }
      );

      const tickDoc = Array.isArray(created) ? created[0] : created;
      const tickId = tickDoc._id;

      // push tick id into website.ticks but only if website.userId === websiteOwnerId
      const websiteUpdateRes: any = await Website.updateOne(
        { _id: websiteId, userId: websiteOwnerId },
        { $push: { ticks: tickId } },
        { session }
      );

      const matched = websiteUpdateRes.matchedCount ?? (websiteUpdateRes as any).n ?? (websiteUpdateRes as any).nMatched ?? 0;
      const modified = websiteUpdateRes.modifiedCount ?? (websiteUpdateRes as any).nModified ?? 0;

      if (matched === 0 && modified === 0) {
        // Owner mismatch or website missing: abort and fallback
        await session.abortTransaction();
        session.endSession();
        console.warn('[HUB] Website update matched 0 docs (owner mismatch or missing) — aborting transaction and falling back');
        // fall through to fallback (non-transactional)
      } else {
        // update validator payouts in same transaction
        await ValidatorModel.updateOne(
          { _id: validatorId },
          { $inc: { pendingPayouts: COST_PER_VALIDATION } },
          { session }
        );

        await session.commitTransaction();
        session.endSession();
        console.log('[HUB] Created WebsiteTick and updated validator payouts (transactional)');

        // broadcast earning to validator(s) (COST_PER_VALIDATION is lamports-like unit here)
        try { await broadcastEarningToValidator(String(validatorId), COST_PER_VALIDATION); } catch (e) { /* noop */ }

        return;
      }
    } catch (txErr: any) {
      try { await session.abortTransaction(); } catch (_) {}
      session.endSession();
      console.warn('[HUB] Transactional path failed — falling back to non-transactional writes:', txErr && txErr.message ? txErr.message : txErr);
    }
  } catch (startErr: any) {
    console.warn('[HUB] startSession failed (transactions unavailable) — falling back:', startErr && startErr.message ? startErr.message : startErr);
  }

  // Fallback: plain writes
  try {
    const tickDoc = await WebsiteTick.create({ websiteId, validatorId, status, latency, createdAt: new Date() });

    // push tick id into website.ticks only if user matches
    const pushRes: any = await Website.updateOne(
      { _id: websiteId, userId: websiteOwnerId },
      { $push: { ticks: tickDoc._id } }
    );

    const matchedPush = pushRes.matchedCount ?? (pushRes as any).n ?? 0;
    const modifiedPush = pushRes.modifiedCount ?? (pushRes as any).nModified ?? 0;

    if (matchedPush === 0 && modifiedPush === 0) {
      console.warn('[HUB] Non-transactional push: website not found or owner mismatch. Tick created but not linked to website.');
    } else {
      console.log('[HUB] Pushed tick id into website.ticks (non-transactional)');
    }

    // update validator pending payouts (non-transactional)
    const payoutRes: any = await ValidatorModel.updateOne({ _id: validatorId }, { $inc: { pendingPayouts: COST_PER_VALIDATION } });
    const payoutMatched = payoutRes.matchedCount ?? (payoutRes as any).n ?? 0;
    if (payoutMatched === 0) {
      console.warn('[HUB] Validator update matched 0 docs — validatorId may be invalid.');
    } else {
      console.log('[HUB] Updated validator pending payouts (non-transactional)');

      // broadcast earning to validator(s)
      try { await broadcastEarningToValidator(String(validatorId), COST_PER_VALIDATION); } catch (e) { /* noop */ }
    }
  } catch (fallbackErr) {
    console.error('[HUB] Non-transactional fallback failed:', fallbackErr);
    throw fallbackErr;
  }
}

// ---------------- notification helper ----------------
async function tryNotifyOwnerIfNeeded(websiteId: any, websiteOwnerId: any, status: string, latency: number) {
  try {
    // we only notify on Bad status by default
    if (String(status).toLowerCase() !== 'bad') return;

    const websiteDoc: any = await Website.findById(websiteId).lean();
    if (!websiteDoc) {
      console.warn('[HUB] notify: website not found');
      return;
    }
    const ownerEmail = websiteDoc.ownerEmail ?? null;
    if (!ownerEmail) {
      console.log('[HUB] notify: no ownerEmail; skipping notification');
      return;
    }

    // consecutive-check
    if (ALERT_CONSECUTIVE_REQUIRED > 1) {
      const ok = await hasConsecutiveBadTicks(websiteId, ALERT_CONSECUTIVE_REQUIRED, ALERT_CONSECUTIVE_LOOKBACK);
      if (!ok) {
        console.log('[HUB] notify: not enough consecutive bad ticks; skipping');
        return;
      }
    }

    const cooldownMinutes = websiteDoc.alertCooldownMinutes ?? 15;
    const lastAlertAt = websiteDoc.lastAlertAt ? new Date(websiteDoc.lastAlertAt).getTime() : 0;
    const now = Date.now();
    if (now - lastAlertAt < (cooldownMinutes * 60 * 1000)) {
      console.log('[HUB] notify: cooldown in effect; skipping email');
      return;
    }

    // Compose and send email (Nodemailer)
    const subject = `Alert: ${websiteDoc.url} appears down`;
    const text = `Your website ${websiteDoc.url} was reported down at ${new Date().toLocaleString()}. Latency: ${latency} ms.`;
    const html = `<p>Your website <strong>${websiteDoc.url}</strong> was reported down at <strong>${new Date().toLocaleString()}</strong>.</p>\n                  <p>Latency: <strong>${latency} ms</strong></p>`;

    try {
      const info = await sendEmail_Nodemailer(ownerEmail, subject, text, html);
      // update lastAlertAt (non-transactional)
      await Website.updateOne({ _id: websiteId }, { $set: { lastAlertAt: new Date() } });
      console.log('[HUB] Sent downtime email to', ownerEmail, 'info:', info && (info.messageId ?? info.response));
    } catch (emailErr) {
      console.error('[HUB] Failed sending email:', emailErr);
    }
  } catch (err) {
    console.error('[HUB] Notification error:', err);
  }
}

// ---------------- cron job (controlled lifecycle) ----------------
const CRON_INTERVAL_MS = Number(process.env.CRON_INTERVAL_MS ?? 60_000);
let cronInterval: NodeJS.Timeout | null = null;

function addAvailableValidator(validatorId: string, socket: WebSocket, publicKey: string, sessionToken?: string | null) {
  const exists = availableValidators.find(v => v.validatorId === validatorId || v.socket === socket);
  if (exists) {
    // update sessionToken if provided
    if (sessionToken) exists.sessionToken = sessionToken;
    return;
  }
  availableValidators.push({ validatorId, socket, publicKey, sessionToken: sessionToken ?? null });
  console.log('[HUB] Validator added to availableValidators:', validatorId);
  startCronIfNeeded();
}

function removeAvailableValidatorBySocket(socket: WebSocket) {
  const before = availableValidators.length;
  for (let i = availableValidators.length - 1; i >= 0; i--) {
    if (availableValidators[i].socket === socket) availableValidators.splice(i, 1);
  }
  if (availableValidators.length !== before) {
    console.log('[HUB] Removed validator(s) for closed socket. remaining:', availableValidators.length);
  }
  stopCronIfIdle();
}

function startCronIfNeeded() {
  if (!cronInterval && availableValidators.length > 0) {
    console.log('[HUB] Starting cron (validators available). Interval ms =', CRON_INTERVAL_MS);
    startCron();
  }
}

function stopCronIfIdle() {
  if (cronInterval && availableValidators.length === 0) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[HUB] Cron stopped — no validators available');
  }
}

async function runCronIteration() {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.warn('[HUB] Skipping cron iteration — DB not connected');
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
          console.warn('[HUB] failed to send validate to validator socket, removing it soon if closed:', sendErr);
        }

        CALLBACKS[callbackId] = async (data: IncomingMessage) => {
          try {
            if (data.type !== 'validate') return;
            const { validatorId, status, latency, signedMessage, sessionToken } = data.data;

            let verified = false;

            // 1) If a signedMessage is present, validate signature
            if (signedMessage) {
              verified = await verifyMessage(`Replying to ${callbackId}`, validator.publicKey, signedMessage);
              if (!verified) {
                console.warn('[HUB] validate reply signature failed verification (signedMessage present)');
              }
            } else if (sessionToken) {
              // 2) If sessionToken present, accept only if it matches what we have for this validator entry
              if (validator.sessionToken && validator.sessionToken === sessionToken) {
                verified = true;
              } else {
                // If the validator record has no stored sessionToken, we accept sessionToken (best-effort) but log warn.
                if (!validator.sessionToken) {
                  console.warn('[HUB] validate reply contained sessionToken but Hub has no stored token for this validator — accepting best-effort');
                  verified = true;
                } else {
                  console.warn('[HUB] validate reply sessionToken mismatch — rejecting');
                  verified = false;
                }
              }
            } else {
              console.warn('[HUB] validate reply contained neither signedMessage nor sessionToken — rejecting');
              verified = false;
            }

            if (!verified) return;

            // Persist tick and payouts (owner check done inside persistTickAndPayoutFallback)
            await persistTickAndPayoutFallback(
              website._id,
              website.userId,      // owner check (Clerk id)
              validatorId,
              status,
              latency
            );

            // Attempt notification
            await tryNotifyOwnerIfNeeded(website._id, website.userId, status, latency);

          } catch (err) {
            console.error('[HUB] Error in CALLBACK handler:', err);
          }
        };
      }
    }
  } catch (err) {
    console.error('Cron job iteration failed:', err);
  }
}

function startCron() {
  if (cronInterval) return;
  // run once immediately, then every CRON_INTERVAL_MS
  runCronIteration().catch((e) => console.error('[HUB] initial cron iteration failed:', e));
  cronInterval = setInterval(() => runCronIteration().catch((e) => console.error('[HUB] cron iteration failed:', e)), CRON_INTERVAL_MS);
}

function stopCron() {
  if (!cronInterval) return;
  clearInterval(cronInterval);
  cronInterval = null;
}

// ---------------- mongoose setup & connect ----------------
mongoose.set('bufferCommands', false);
mongoose.set('debug', function (coll: string, method: string, query: any, doc: any) {
  try {
    const q = JSON.stringify(query);
    const d = doc ? JSON.stringify(doc) : '';
    console.debug('[MONGOOSE]', coll, method, q, d);
  } catch {
    console.debug('[MONGOOSE]', coll, method);
  }
});
mongoose.connection.on('connecting', () => console.log('[HUB:MONGO] connecting...'));
mongoose.connection.on('connected', () => console.log('[HUB:MONGO] connected'));
mongoose.connection.on('reconnected', () => console.log('[HUB:MONGO] reconnected'));
mongoose.connection.on('disconnected', () => console.warn('[HUB:MONGO] disconnected'));
mongoose.connection.on('close', () => console.warn('[HUB:MONGO] connection closed'));
mongoose.connection.on('error', (err) => console.error('[HUB:MONGO] error:', err && (err as any).message ? (err as any).message : err));

async function connectWithRetries(uri: string, attempts = 5, waitMs = 2000) {
  const opts: any = { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 10000 };
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`[HUB] Attempting MongoDB connect (attempt ${i}/${attempts}) -> ${uri}`);
      await mongoose.connect(uri, opts);
      console.log('[HUB] MongoDB connected from HUB');
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
  if (!importedValidator || !importedValidator.schema) throw new Error('Validator model import missing schema');

  const wmod = await import("../dp-uptime-backend/model/Website.model.ts");
  const importedWebsite = (wmod as any).default ?? (wmod as any).Website ?? wmod;
  if (!importedWebsite || !importedWebsite.schema) throw new Error('Website model import missing schema');

  const tmod = await import("../dp-uptime-backend/model/WebsiteTick.model.ts");
  const importedWebsiteTick = (tmod as any).default ?? (tmod as any).WebsiteTick ?? tmod;
  if (!importedWebsiteTick || !importedWebsiteTick.schema) throw new Error('WebsiteTick model import missing schema');

  const conn = mongoose.connection;

  const vName = importedValidator.modelName ?? 'Validator';
  const vColl = importedValidator.collection && importedValidator.collection.name ? importedValidator.collection.name : undefined;
  if (conn.models && conn.models[vName]) {
    ValidatorModel = conn.models[vName];
  } else {
    ValidatorModel = conn.model(vName, importedValidator.schema, vColl);
  }

  const wName = importedWebsite.modelName ?? 'Website';
  const wColl = importedWebsite.collection && importedWebsite.collection.name ? importedWebsite.collection.name : undefined;
  if (conn.models && conn.models[wName]) {
    Website = conn.models[wName];
  } else {
    Website = conn.model(wName, importedWebsite.schema, wColl);
  }

  const tName = importedWebsiteTick.modelName ?? 'WebsiteTick';
  const tColl = importedWebsiteTick.collection && importedWebsiteTick.collection.name ? importedWebsiteTick.collection.name : undefined;
  if (conn.models && conn.models[tName]) {
    WebsiteTick = conn.models[tName];
  } else {
    WebsiteTick = conn.model(tName, importedWebsiteTick.schema, tColl);
  }

  console.log('[HUB] Imported backend model schemas and registered them on Hub mongoose connection.');
  console.log('[HUB] Bound models ->', {
    mongooseDb: conn.name,
    Validator: { name: ValidatorModel.modelName, collection: ValidatorModel.collection?.name },
    Website: { name: Website.modelName, collection: Website.collection?.name },
    WebsiteTick: { name: WebsiteTick.modelName, collection: WebsiteTick.collection?.name },
  });
}

// ---------------- bootstrap ----------------
(async function bootstrap() {
  try {
    const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/dp-uptime';

    // 1) Connect first (so models rebind to a connected mongoose)
    await connectWithRetries(MONGO_URI, 5, 2000);

    // 2) Import backend model modules and rebind schemas to this mongoose
    await importAndRebindModels();

    // 3) Start server & ws after models are registered
    const app = express();
    app.use(express.json());
    app.get('/health', (_req, res) => {
      res.json({ mongooseReadyState: mongoose.connection.readyState, validators: availableValidators.length });
    });

    // Temporary debug endpoint to test email sending
    app.get('/test-email', async (_req, res) => {
      try {
        if (!mailTransporter) return res.status(500).json({ ok: false, msg: 'mailTransporter not configured' });
        const to = process.env.SMTP_USER || process.env.EMAIL_FROM;
        const info = await sendEmail_Nodemailer(to!, 'HUB test email', 'This is a test from HUB', '<b>test</b>');
        res.json({ ok: true, info });
      } catch (err) {
        console.error('/test-email error:', err);
        res.status(500).json({ ok: false, error: String(err) });
      }
    });

    const port = process.env.HUB_PORT ? Number(process.env.HUB_PORT) : 8081;
    const server = app.listen(port, () => console.log(`[HUB] Server running on :${port}`));
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
      ws.on('message', async (message: string | Buffer) => {
        try {
          const data: IncomingMessage = JSON.parse(message.toString());
          console.log('[HUB] got message from validator:', data.type, data.data);

          if (data.type === 'signup') {
            const verified = await verifyMessage(`Signed message for ${data.data.callbackId}, ${data.data.publicKey}`, data.data.publicKey, data.data.signedMessage);
            if (verified) {
              await signupHandler(ws, data.data as SignupIncomingMessage);
            } else {
              console.warn('[HUB] signup signature verification failed');
            }
          } else if (data.type === 'resume') {
            try {
              const maybePublicKey = data.data?.publicKey ?? null;
              const maybeValidatorId = data.data?.validatorId ?? null;
              const incomingSessionToken = data.data?.sessionToken ?? null;
              let dbValidator: any = null;
              if (maybePublicKey) dbValidator = await ValidatorModel.findOne({ publicKey: maybePublicKey }).lean();
              else if (maybeValidatorId) dbValidator = await ValidatorModel.findById(maybeValidatorId).lean();

              if (dbValidator) {
                addAvailableValidator(dbValidator._id.toString(), ws, dbValidator.publicKey, incomingSessionToken ?? null);
                ws.send(JSON.stringify({ type: 'resume', data: { ok: true, validatorId: dbValidator._id.toString() } }));
              } else {
                ws.send(JSON.stringify({ type: 'resume', data: { ok: false } }));
              }
            } catch (err) {
              console.warn('[HUB] resume handler error:', err);
              ws.send(JSON.stringify({ type: 'resume', data: { ok: false } }));
            }
          } else if (data.type === 'validate') {
            if (CALLBACKS[data.data.callbackId]) {
              CALLBACKS[data.data.callbackId](data);
              delete CALLBACKS[data.data.callbackId];
            } else {
              console.warn('[HUB] Received validate reply but no callback found for', data.data.callbackId);
            }
          } else if (data.type === 'subscribe_earnings') {
            try {
              const pk = data.data && data.data.publicKey;
              const incomingSessionToken = data.data?.sessionToken ?? null;
              if (pk) {
                const v = await ValidatorModel.findOne({ publicKey: pk }).lean();
                if (v) {
                  addAvailableValidator(v._id.toString(), ws, v.publicKey, incomingSessionToken ?? null);
                  ws.send(JSON.stringify({ type: 'subscribed', data: { ok: true, validatorId: v._id.toString() } }));
                } else {
                  ws.send(JSON.stringify({ type: 'subscribed', data: { ok: false, error: 'validator not found' } }));
                }
              } else {
                ws.send(JSON.stringify({ type: 'subscribed', data: { ok: false, error: 'missing publicKey' } }));
              }
            } catch (err) {
              console.warn('[HUB] subscribe_earnings handler error:', err);
              ws.send(JSON.stringify({ type: 'subscribed', data: { ok: false, error: String(err) } }));
            }
          } else {
            console.warn('[HUB] Unknown message type from validator:', (data as any).type);
          }
        } catch (err) {
          console.error('Failed parsing/handling WS message:', err);
        }
      });

      ws.on('close', () => {
        removeAvailableValidatorBySocket(ws);
      });

      ws.on('error', () => {
        removeAvailableValidatorBySocket(ws);
      });
    });

    console.log('[HUB] bootstrap complete — running');
  } catch (err) {
    console.error('[HUB] Failed to bootstrap:', err);
    process.exit(1);
  }
})();
