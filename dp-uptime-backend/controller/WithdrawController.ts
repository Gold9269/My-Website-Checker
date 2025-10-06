// src/controller/WithdrawController.ts
import { RequestHandler } from "express";
import mongoose from "mongoose";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  SendTransactionError,
} from "@solana/web3.js";
import bs58 from "bs58";

const DEFAULT_RPC = process.env.SOLANA_RPC_URL_DEFAULT ?? "https://api.devnet.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;

// ---------------- helpers (unchanged / improved) ----------------
function loadPayerFromEnv(): Keypair {
  const raw = process.env.TREASURY_SECRET_KEY ?? "[94,210,237,25,17,78,247,176,98,159,198,15,28,86,116,66,76,41,92,214,94,37,222,228,227,29,208,194,23,194,21,17,226,15,112,126,59,100,6,7,190,147,124,22,107,165,228,156,248,148,73,178,247,56,2,99,22,215,247,60,93,172,125,122]";
  if (!raw) throw new Error("SOLANA_PAYER_PRIVATE_KEY env var not set");

  try {
    if (raw.trim().startsWith("[")) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error("invalid JSON array for secret key");
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    } else {
      const secret = bs58.decode(raw.trim());
      return Keypair.fromSecretKey(secret);
    }
  } catch (err) {
    throw new Error("Failed to parse SOLANA_PAYER_PRIVATE_KEY: " + ((err as any)?.message ?? String(err)));
  }
}

async function confirmSignatureWithRetries(connection: Connection, signature: string, attempts = 12, intervalMs = 1500): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await connection.getSignatureStatuses([signature]);
      const info = resp?.value?.[0];
      if (info) {
        if (info.err == null && (info.confirmationStatus === "confirmed" || info.confirmationStatus === "finalized" || info.confirmationStatus === "processed")) {
          return true;
        }
        if (info.err) return false;
      }
    } catch {
      // ignore transient RPC error
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function buildSignSendTxWithRetries(connection: Connection, payer: Keypair, instructions: any[], attempts = 4): Promise<string> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const latest = await connection.getLatestBlockhash("finalized");
      const tx = new Transaction().add(...instructions);
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = payer.publicKey;

      tx.sign(payer);

      const raw = tx.serialize();
      const sig = await connection.sendRawTransaction(raw, { skipPreflight: false });

      const confirmed = await confirmSignatureWithRetries(connection, sig, 12, 1500);
      if (!confirmed) {
        const statusResp = await connection.getSignatureStatuses([sig]);
        const info = statusResp?.value?.[0];
        if (info?.err) {
          throw Object.assign(new Error("Transaction failed during confirmation"), { info, signature: sig });
        }
        throw new Error("Transaction not confirmed within retries");
      }
      return sig;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const retryable = /block height exceeded|expired|not confirmed|Transaction simulation failed|Transaction was not confirmed/i.test(msg);
      if (attempt < attempts && retryable) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to send transaction after retries");
}

// Normalize DB pendingPayouts into lamports (robust)
function normalizePendingToLamports(raw: any): number {
  try {
    if (raw == null) return 0;
    if (typeof raw === "object" && raw.sol != null) {
      const s = Number(raw.sol);
      if (isNaN(s)) return 0;
      return Math.max(0, Math.floor(s * LAMPORTS_PER_SOL));
    }
    if (typeof raw === "string") {
      const t = raw.trim();
      if (t.includes(".")) {
        const n = Number(t);
        if (isNaN(n)) return 0;
        return Math.max(0, Math.floor(n * LAMPORTS_PER_SOL));
      }
      const n2 = Number(t);
      if (isNaN(n2)) return 0;
      return Math.max(0, Math.floor(n2));
    }
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || isNaN(raw)) return 0;
      if (!Number.isInteger(raw)) return Math.max(0, Math.floor(raw * LAMPORTS_PER_SOL));
      return Math.max(0, Math.floor(raw));
    }
    const coerced = Number(raw);
    if (!isNaN(coerced)) {
      if (!Number.isInteger(coerced)) return Math.max(0, Math.floor(coerced * LAMPORTS_PER_SOL));
      return Math.max(0, Math.floor(coerced));
    }
    return 0;
  } catch (err) {
    console.warn("[Withdraw] normalizePendingToLamports failed:", raw, err);
    return 0;
  }
}

// ---------------- controller ----------------
const WithdrawController: RequestHandler = (req, res, next) => {
  (async () => {
    try {
      const publicKeyStr = String(req.body?.publicKey ?? "").trim();
      if (!publicKeyStr) {
        res.status(400).json({ ok: false, error: "missing publicKey" });
        return;
      }

      const conn = mongoose.connection;
      const ValidatorModel = conn?.models?.Validator;
      if (!ValidatorModel) {
        res.status(500).json({ ok: false, error: "server misconfiguration" });
        return;
      }

      const validator = await ValidatorModel.findOne({ publicKey: publicKeyStr }).exec();
      if (!validator) {
        res.status(404).json({ ok: false, error: "validator not found" });
        return;
      }

      const pendingLamports = normalizePendingToLamports(validator.pendingPayouts);
      if (pendingLamports <= 0) {
        res.status(400).json({ ok: false, error: "no pending payouts", details: { pendingRaw: validator.pendingPayouts } });
        return;
      }

      let payer: Keypair;
      try {
        payer = loadPayerFromEnv();
      } catch (err: any) {
        console.error("WithdrawController: failed loading payer key:", err);
        res.status(500).json({ ok: false, error: "server missing payer key" });
        return;
      }

      const rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC;
      console.log("[WithdrawController] RPC:", rpcUrl);
      const connection = new Connection(rpcUrl, "confirmed");

      // rent-exempt minimum for 0 data account
      let rentExemptMin = 0;
      try {
        rentExemptMin = await connection.getMinimumBalanceForRentExemption(0);
      } catch (err) {
        console.warn("[WithdrawController] getMinimumBalanceForRentExemption failed:", err);
        rentExemptMin = 890_880; // safe fallback
      }

      const recipientPubkey = new PublicKey(publicKeyStr);

      // check recipient account
      let recipientInfo = null;
      try {
        recipientInfo = await connection.getAccountInfo(recipientPubkey);
      } catch (fetchErr) {
        console.warn("[WithdrawController] getAccountInfo failed:", fetchErr);
        recipientInfo = null;
      }

      // Add a small buffer for fees to avoid edge-case rejections
      const FEE_BUFFER = 5_000; // lamports

      // CASE A: account missing -> ensure first transfer is at least rentExemptMin (+ buffer)
      if (!recipientInfo) {
        // amount we will send in the single transfer to create & fund account
        const amountToSend = Math.max(pendingLamports, rentExemptMin + FEE_BUFFER);

        // sanity check: don't send astronomical amounts by mistake
        if (amountToSend <= 0) {
          res.status(500).json({ ok: false, error: "invalid computed create amount", details: { pendingLamports, rentExemptMin } });
          return;
        }

        // ensure payer has balance (try airdrop on devnet)
        let payerBalance = 0;
        try {
          payerBalance = await connection.getBalance(payer.publicKey);
        } catch (err) {
          console.error("[WithdrawController] getBalance failed:", err);
          res.status(500).json({ ok: false, error: "failed to read payer balance", details: String(err) });
          return;
        }

        if (payerBalance < amountToSend) {
          if ((rpcUrl || "").includes("devnet")) {
            const need = amountToSend - payerBalance;
            try {
              const aSig = await connection.requestAirdrop(payer.publicKey, need);
              const ok = await confirmSignatureWithRetries(connection, aSig, 16, 2000);
              if (!ok) {
                const newBal = await connection.getBalance(payer.publicKey);
                if (newBal < amountToSend) {
                  res.status(400).json({ ok: false, error: "payer insufficient after airdrop", details: { payerBalance: newBal, required: amountToSend } });
                  return;
                }
                payerBalance = newBal;
              } else {
                payerBalance = await connection.getBalance(payer.publicKey);
              }
            } catch (airErr) {
              console.error("[WithdrawController] airdrop failed:", airErr);
              res.status(400).json({ ok: false, error: "payer insufficient and airdrop failed", details: String(airErr) });
              return;
            }
          } else {
            res.status(400).json({ ok: false, error: "server payer has insufficient funds", details: { payerBalance, required: amountToSend } });
            return;
          }
        }

        // Send single transfer that will create the account and fund it (>= rentExemptMin)
        try {
          console.log(`[WithdrawController] recipient missing - sending ${amountToSend} lamports (will create account)`);
          const sig = await buildSignSendTxWithRetries(connection, payer, [
            SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipientPubkey, lamports: amountToSend }),
          ], 5);

          // Confirm account now exists
          const refreshed = await connection.getAccountInfo(recipientPubkey);
          if (!refreshed) {
            res.status(500).json({ ok: false, error: "topUp transfer did not create recipient account", details: { sig } });
            return;
          }

          // Clear pending payouts in DB (we funded them — if amountToSend > pendingLamports, that overpaid slightly)
          try {
            await ValidatorModel.findByIdAndUpdate(validator._id, { $set: { pendingPayouts: 0 } }).exec();
          } catch (dbErr) {
            console.error("[WithdrawController] payout succeeded but clearing DB failed:", dbErr);
            res.json({ ok: true, txSignature: sig, note: "payout succeeded but clearing DB failed; check logs" });
            return;
          }

          res.json({ ok: true, txSignature: sig });
          return;
        } catch (err: any) {
          console.error("[WithdrawController] topUp/create transfer failed:", err);
          if ((err as SendTransactionError).transactionLogs) {
            res.status(500).json({
              ok: false,
              error: "topUp transaction failed",
              details: {
                message: err.message,
                transactionLogs: (err as SendTransactionError).transactionLogs,
                signature: (err as any).signature ?? null,
              },
            });
          } else {
            res.status(500).json({ ok: false, error: "topUp transaction failed", details: String(err) });
          }
          return;
        }
      }

      // CASE B: recipient exists -> just send pendingLamports
      try {
        // ensure payer has balance to cover pendingLamports + small buffer for fees
        let payerBal = await connection.getBalance(payer.publicKey);
        const required = pendingLamports + FEE_BUFFER;
        if (payerBal < required) {
          if ((rpcUrl || "").includes("devnet")) {
            const need = required - payerBal;
            const aSig = await connection.requestAirdrop(payer.publicKey, need);
            const ok = await confirmSignatureWithRetries(connection, aSig, 16, 2000);
            if (!ok) {
              const newBal = await connection.getBalance(payer.publicKey);
              if (newBal < required) {
                res.status(400).json({ ok: false, error: "payer insufficient after airdrop", details: { payerBalance: newBal, required } });
                return;
              }
              payerBal = newBal;
            } else {
              payerBal = await connection.getBalance(payer.publicKey);
            }
          } else {
            res.status(400).json({ ok: false, error: "server payer has insufficient funds", details: { payerBalance: payerBal, required } });
            return;
          }
        }

        console.log(`[WithdrawController] sending payout ${pendingLamports} lamports to ${publicKeyStr}`);
        const payoutSig = await buildSignSendTxWithRetries(connection, payer, [
          SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipientPubkey, lamports: pendingLamports }),
        ], 5);

        const finalStatus = await connection.getSignatureStatuses([payoutSig]);
        const info = finalStatus?.value?.[0];
        if (info?.err) {
          res.status(500).json({ ok: false, error: "withdrawal failed (on-chain error)", details: info.err, signature: payoutSig });
          return;
        }

        // Clear pending payouts
        try {
          await ValidatorModel.findByIdAndUpdate(validator._id, { $set: { pendingPayouts: 0 } }).exec();
        } catch (dbErr) {
          console.error("[WithdrawController] payout succeeded but clearing DB failed:", dbErr);
          res.json({ ok: true, txSignature: payoutSig, note: "payout succeeded but clearing DB failed; check logs" });
          return;
        }

        res.json({ ok: true, txSignature: payoutSig });
        return;
      } catch (err: any) {
        console.error("WithdrawController: payout failed:", err);
        if ((err as SendTransactionError).transactionLogs) {
          res.status(500).json({
            ok: false,
            error: "transaction failed",
            details: {
              message: err.message,
              transactionLogs: (err as SendTransactionError).transactionLogs,
              signature: (err as any).signature ?? null,
            },
          });
        } else {
          res.status(500).json({ ok: false, error: "transaction failed", details: String(err) });
        }
        return;
      }
    } catch (err) {
      console.error("WithdrawController error:", err);
      throw err;
    }
  })().catch(next);
};

export default WithdrawController;
