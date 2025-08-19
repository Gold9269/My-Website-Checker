// Validators/index_impl.ts
import { randomUUID } from "crypto";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";
import WebSocket from "ws";
import bs58 from "bs58";
import fetch from "node-fetch"; // remove if Node provides global fetch (Node 18+)
import dotenv from "dotenv";
dotenv.config();

import type { SignupOutgoingMessage, ValidateOutgoingMessage, OutgoingMessage } from "../dp-uptime-backend/common/index.ts";

// Utility to parse PRIVATE_KEY env robustly (JSON array, base58, base64, or CSV)
function normalizeSecretKeyBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 64 || bytes.length === 32) return bytes;
  if (bytes.length === 65) {
    if (bytes[0] === 0) {
      console.warn('PRIVATE_KEY: dropping leading 0x00 byte (65 -> 64)');
      return bytes.slice(1);
    }
    if (bytes[bytes.length - 1] === 0) {
      console.warn('PRIVATE_KEY: dropping trailing 0x00 byte (65 -> 64)');
      return bytes.slice(0, 64);
    }
  }
  throw new Error(`bad secret key size (expected 32 or 64 bytes, got ${bytes.length})`);
}
function parsePrivateKeyEnv(envVal?: string): Uint8Array {
  if (!envVal) throw new Error('PRIVATE_KEY is not set in .env');
  let raw = envVal.trim().replace(/^"(.+)"$/, '$1').replace(/^'(.+)'$/, '$1');

  // JSON array
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeSecretKeyBytes(Uint8Array.from(parsed));
  } catch { /* not JSON */ }

  // base64 candidate
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length % 4 === 0) {
      const buf = Buffer.from(raw, 'base64');
      return normalizeSecretKeyBytes(Uint8Array.from(buf));
    }
  } catch { /* ignore */ }

  // base58
  try {
    const buf = bs58.decode(raw);
    return normalizeSecretKeyBytes(Uint8Array.from(buf));
  } catch { /* ignore */ }

  // comma-separated numbers
  try {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0 && parts.every(p => /^-?\d+$/.test(p))) {
      return normalizeSecretKeyBytes(Uint8Array.from(parts.map(Number)));
    }
  } catch { /* ignore */ }

  throw new Error('PRIVATE_KEY must be a JSON array, base64, base58, or comma-separated numbers.');
}

const CALLBACKS: { [callbackId: string]: (data: SignupOutgoingMessage) => void } = {};
let validatorId: string | null = null;
const WS_URL = process.env.WS_URL ?? 'ws://localhost:8081';

export async function main() {
  const secretKeyBytes = parsePrivateKeyEnv(process.env.PRIVATE_KEY);
  let keypair: Keypair;
  if (secretKeyBytes.length === 64) {
    keypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyBytes));
  } else {
    keypair = Keypair.fromSeed(Uint8Array.from(secretKeyBytes));
  }
  console.log('[VALIDATOR] pubkey:', keypair.publicKey.toBase58());

  const ws = new WebSocket(WS_URL);

  ws.on("open", async () => {
    console.log('[VALIDATOR] connected to', WS_URL);
    const callbackId = randomUUID();
    CALLBACKS[callbackId] = (data: SignupOutgoingMessage) => {
      validatorId = data.validatorId;
      console.log('[VALIDATOR] registered validatorId:', validatorId);
    };

    const signedMessage = await signMessage(
      `Signed message for ${callbackId}, ${keypair.publicKey.toBase58()}`,
      keypair
    );

    ws.send(
      JSON.stringify({
        type: "signup",
        data: {
          callbackId,
          ip: "127.0.0.1",
          publicKey: keypair.publicKey.toBase58(),
          signedMessage,
        },
      })
    );
  });

  ws.on("message", async (msg) => {
    try {
      const data: OutgoingMessage = JSON.parse(msg.toString());
      console.log('[VALIDATOR] incoming:', data.type, data.data);
      if (data.type === "signup") {
        CALLBACKS[(data.data as SignupOutgoingMessage).callbackId]?.(data.data as SignupOutgoingMessage);
        delete CALLBACKS[(data.data as SignupOutgoingMessage).callbackId];
      } else if (data.type === "validate") {
        await validateHandler(ws, data.data as ValidateOutgoingMessage, keypair);
      }
    } catch (err) {
      console.error('[VALIDATOR] Failed parsing message:', err);
    }
  });

  ws.on("close", () => {
    console.log("[VALIDATOR] WebSocket closed");
  });

  ws.on("error", (err) => {
    console.error("[VALIDATOR] WebSocket error:", err);
  });
}

async function validateHandler(ws: WebSocket, payload: ValidateOutgoingMessage, keypair: Keypair) {
  const { url, callbackId, websiteId } = payload;
  console.log(`[VALIDATOR] Validating ${url} (websiteId=${websiteId} callbackId=${callbackId})`);
  const startTime = Date.now();
  const signature = await signMessage(`Replying to ${callbackId}`, keypair);

  try {
    const response = await fetch(url);
    const endTime = Date.now();
    const latency = endTime - startTime;
    const status = response.status;
    console.log(`[VALIDATOR] ${url} -> ${status} (${latency}ms)`);

    ws.send(
      JSON.stringify({
        type: "validate",
        data: {
          callbackId,
          status: status === 200 ? "Good" : "Bad",
          latency,
          websiteId,
          validatorId,
          signedMessage: signature,
        },
      })
    );
    console.log(`[VALIDATOR] sent validate response callbackId=${callbackId} websiteId=${websiteId}`);
  } catch (error) {
    console.error('[VALIDATOR] fetch error:', error);
    ws.send(
      JSON.stringify({
        type: "validate",
        data: {
          callbackId,
          status: "Bad",
          latency: 1000000000,
          websiteId,
          validatorId,
          signedMessage: signature,
        },
      })
    );
  }
}

async function signMessage(message: string, keypair: Keypair) {
  const messageBytes = nacl_util.decodeUTF8(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return JSON.stringify(Array.from(signature));
}
