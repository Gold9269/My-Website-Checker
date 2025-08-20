// src/controller/WithdrawController.ts
import { RequestHandler } from "express";
import mongoose from "mongoose";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const DEFAULT_RPC = process.env.SOLANA_RPC_URL_DEFAULT ?? "https://api.testnet.solana.com";

/**
 * Parse server payer keypair from env.
 * Supports:
 *  - JSON array string: "[12,34,...]" (recommended)
 *  - base58 string
 */
function loadPayerFromEnv(): Keypair {
  const raw = process.env.SOLANA_PAYER_PRIVATE_KEY ?? "";
  if (!raw) throw new Error("SOLANA_PAYER_PRIVATE_KEY env var not set");

  try {
    if (raw.trim().startsWith("[")) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error("invalid JSON array for secret key");
      const u8 = Uint8Array.from(arr);
      return Keypair.fromSecretKey(u8);
    } else {
      const secret = bs58.decode(raw.trim());
      return Keypair.fromSecretKey(secret);
    }
  } catch (err) {
    throw new Error("Failed to parse SOLANA_PAYER_PRIVATE_KEY: " + (err as any)?.message ?? String(err));
  }
}

/**
 * POST /withdraw
 * body: { publicKey: string }
 *
 * Sends validator.pendingPayouts (lamports) from server payer to validator publicKey,
 * then sets validator.pendingPayouts = 0 on success.
 *
 * NOTE: This handler is intentionally NOT `async` at top-level to satisfy Express + TypeScript's RequestHandler typing.
 * The async work happens inside an IIFE and errors are forwarded to next(err).
 */
const WithdrawController: RequestHandler = (req, res, next) => {
  (async () => {
    try {
      const publicKey = String(req.body?.publicKey ?? "").trim();
      if (!publicKey) {
        res.status(400).json({ ok: false, error: "missing publicKey" });
        return;
      }

      const conn = mongoose.connection;
      const ValidatorModel = conn?.models?.Validator;
      if (!ValidatorModel) {
        res.status(500).json({ ok: false, error: "server misconfiguration" });
        return;
      }

      const validator = await ValidatorModel.findOne({ publicKey }).exec();
      if (!validator) {
        res.status(404).json({ ok: false, error: "validator not found" });
        return;
      }

      const pendingLamports = Number(validator.pendingPayouts ?? 0) || 0;
      if (pendingLamports <= 0) {
        res.status(400).json({ ok: false, error: "no pending payouts" });
        return;
      }

      // load payer keypair from env
      let payer: Keypair;
      try {
        payer = loadPayerFromEnv();
      } catch (err: any) {
        console.error("WithdrawController: failed loading payer key:", err);
        res.status(500).json({ ok: false, error: "server missing payer key" });
        return;
      }

      const rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC;
      const connection = new Connection(rpcUrl, "confirmed");

      // check payer balance
      const payerBalance = await connection.getBalance(payer.publicKey);
      if (payerBalance < pendingLamports) {
        // If we're on devnet, try to request an airdrop automatically (convenience only).
        if (rpcUrl.includes("devnet")) {
          try {
            const needed = pendingLamports - payerBalance;
            console.log(`[WithdrawController] Insufficient payer balance; requesting airdrop ${needed} lamports on devnet`);
            const airdropSig = await connection.requestAirdrop(payer.publicKey, needed);
            await connection.confirmTransaction(airdropSig, "confirmed");
            const newBal = await connection.getBalance(payer.publicKey);
            if (newBal < pendingLamports) {
              res.status(400).json({ ok: false, error: "server payer still has insufficient funds after airdrop", details: { payerBalance: newBal, required: pendingLamports } });
              return;
            }
          } catch (airErr) {
            console.error("Airdrop attempt failed:", airErr);
            res.status(400).json({ ok: false, error: "server payer has insufficient funds and airdrop failed", details: String(airErr) });
            return;
          }
        } else {
          res.status(400).json({ ok: false, error: "server payer has insufficient funds", details: { payerBalance, required: pendingLamports } });
          return;
        }
      }

      const recipientPubkey = new PublicKey(publicKey);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: recipientPubkey,
          lamports: pendingLamports,
        })
      );

      let signature: string;
      try {
        signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
      } catch (err: any) {
        console.error("WithdrawController: send transaction failed:", err);
        res.status(500).json({ ok: false, error: "transaction failed", details: String(err) });
        return;
      }

      // update DB atomically-ish: set pending to 0 and optionally record last payout
      validator.pendingPayouts = 0;
      // Optionally: validator.lastPayout = { lamports: pendingLamports, tx: signature, at: new Date() };
      await validator.save();

      res.json({ ok: true, txSignature: signature });
      return;
    } catch (err) {
      console.error("WithdrawController error:", err);
      // forward to express error handler
      throw err;
    }
  })().catch(next); // forward errors to express
};

export default WithdrawController;
