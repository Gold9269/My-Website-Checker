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
      // tls: { rejectUnauthorized: false } // uncomment for self-signed certs in dev only
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
  const messageBytes = nacl_util.decodeUTF8(message);
  try {
    return nacl.sign.detached.verify(
      messageBytes,
      new Uint8Array(JSON.parse(signature)),
      new PublicKey(publicKey).toBytes()
    );
  } catch (err) {
    console.warn('[HUB] verifyMessage error:', err);
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
const availableValidators: { validatorId: string; socket: WebSocket; publicKey: string }[] = [];
const CALLBACKS: { [callbackId: string]: (data: IncomingMessage) => void } = {};
const COST_PER_VALIDATION = 100;

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
      ws.send(JSON.stringify({ type: "signup", data: { validatorId: validator._id, callbackId } }));
      availableValidators.push({ validatorId: validator._id.toString(), socket: ws, publicKey: validator.publicKey });
      return;
    }

    const newValidator = await ValidatorModel.create({ ip, publicKey, location: "unknown" });
    console.log("Created validator:", newValidator._id?.toString?.());
    ws.send(JSON.stringify({ type: "signup", data: { validatorId: newValidator._id, callbackId } }));
    availableValidators.push({ validatorId: newValidator._id.toString(), socket: ws, publicKey: newValidator.publicKey });
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

// ---------------- cron job ----------------
function startCronJobs() {
  setInterval(async () => {
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

          // include websiteId in the payload so validator can reply with it
          validator.socket.send(JSON.stringify({ type: "validate", data: { url: website.url, callbackId, websiteId: website._id } }));

          CALLBACKS[callbackId] = async (data: IncomingMessage) => {
            try {
              if (data.type !== 'validate') return;
              const { validatorId, status, latency, signedMessage } = data.data;

              const verified = await verifyMessage(`Replying to ${callbackId}`, validator.publicKey, signedMessage);
              if (!verified) {
                console.warn('[HUB] validate reply signature failed verification');
                return;
              }

              // <-- IMPORTANT: pass website.userId as websiteOwnerId
              await persistTickAndPayoutFallback(
                website._id,
                website.userId,      // owner check (Clerk id)
                validatorId,
                status,
                latency
              );

              // After successful persist, attempt notify (non-blocking)
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
  }, 60 * 1000);
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
  // import backend modules (they export mongoose.model(...) from backend's mongoose)
  const vmod = await import("../dp-uptime-backend/model/Validator.model.ts");
  const importedValidator = (vmod as any).default ?? vmod;
  if (!importedValidator || !importedValidator.schema) throw new Error('Validator model import missing schema');

  const wmod = await import("../dp-uptime-backend/model/Website.model.ts");
  const importedWebsite = (wmod as any).default ?? (wmod as any).Website ?? wmod;
  if (!importedWebsite || !importedWebsite.schema) throw new Error('Website model import missing schema');

  const tmod = await import("../dp-uptime-backend/model/WebsiteTick.model.ts");
  const importedWebsiteTick = (tmod as any).default ?? (tmod as any).WebsiteTick ?? tmod;
  if (!importedWebsiteTick || !importedWebsiteTick.schema) throw new Error('WebsiteTick model import missing schema');

  // Use the Hub's active connection to create models explicitly on that connection.
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
          } else if (data.type === 'validate') {
            if (CALLBACKS[data.data.callbackId]) {
              CALLBACKS[data.data.callbackId](data);
              delete CALLBACKS[data.data.callbackId];
            } else {
              console.warn('[HUB] Received validate reply but no callback found for', data.data.callbackId);
            }
          } else {
            console.warn('[HUB] Unknown message type from validator:', (data as any).type);
          }
        } catch (err) {
          console.error('Failed parsing/handling WS message:', err);
        }
      });

      ws.on('close', () => {
        const idx = availableValidators.findIndex(v => v.socket === ws);
        if (idx !== -1) availableValidators.splice(idx, 1);
      });
    });

    // 4) start cron jobs
    startCronJobs();
    console.log('[HUB] bootstrap complete — running');
  } catch (err) {
    console.error('[HUB] Failed to bootstrap:', err);
    process.exit(1);
  }
})();
