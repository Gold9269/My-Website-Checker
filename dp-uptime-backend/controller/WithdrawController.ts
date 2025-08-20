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
  SendTransactionError,
} from "@solana/web3.js";
import bs58 from "bs58";

const DEFAULT_RPC = process.env.SOLANA_RPC_URL_DEFAULT ?? "https://api.devnet.solana.com";

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
    throw new Error("Failed to parse SOLANA_PAYER_PRIVATE_KEY: " + ((err as any)?.message ?? String(err)));
  }
}

/**
 * Confirm a signature robustly by polling getSignatureStatuses.
 */
async function confirmSignatureWithRetries(connection: Connection, signature: string, attempts = 12, intervalMs = 1500): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await connection.getSignatureStatuses([signature]);
      const info = resp?.value?.[0];
      if (info) {
        if (info.err == null && (info.confirmationStatus === "confirmed" || info.confirmationStatus === "finalized" || info.confirmationStatus === "processed")) {
          return true;
        }
        if (info.err) {
          return false;
        }
      }
    } catch (err) {
      // ignore transient RPC errors
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Build, sign, send and confirm a transaction using a fresh blockhash each attempt.
 * Retries if we detect the blockheight-expired error or transient RPC issues.
 */
async function buildSignSendTxWithRetries(
  connection: Connection,
  payer: Keypair,
  instructions: Parameters<Transaction["add"]>,
  attempts = 4
): Promise<string> {
  // instructions: array of Instruction(s)
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // fetch fresh blockhash
      const latest = await connection.getLatestBlockhash("finalized");
      const tx = new Transaction().add(...(instructions as any));
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = payer.publicKey;

      // sign with payer - Keypair.sign is available via tx.sign(...)
      tx.sign(payer);

      // send raw transaction
      const raw = tx.serialize();
      const sig = await connection.sendRawTransaction(raw, { skipPreflight: false });
      // wait for confirmation via polling helper (do not rely solely on sendRawTransaction's internal confirm)
      const confirmed = await confirmSignatureWithRetries(connection, sig, 12, 1500);
      if (!confirmed) {
        // check final status once
        const statusResp = await connection.getSignatureStatuses([sig]);
        const info = statusResp?.value?.[0];
        if (info?.err) {
          throw Object.assign(new Error("Transaction failed during confirmation"), { info, signature: sig });
        }
        // if still not confirmed, treat as transient and let fallback below
        throw new Error("Transaction not confirmed within retries (transient)");
      }
      return sig;
    } catch (err: any) {
      // Detect blockheight expired or similar and retry
      const msg = String(err?.message ?? err);
      const isBlockheightExpired = /block height exceeded|expired/i.test(msg) || err?.name === "TransactionExpiredBlockheightExceededError";
      const isTimeout = /not confirmed in .* seconds|Transaction was not confirmed/i.test(msg) || err?.name === "TransactionExpiredTimeoutError";
      // If it's clearly a blockheight expired or timeout, we'll retry (unless last attempt)
      if (attempt < attempts && (isBlockheightExpired || isTimeout || /send transaction failed|Transaction simulation failed|transaction not confirmed/i.test(msg))) {
        // small backoff
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      // Re-throw (with logs attached if available)
      throw err;
    }
  }
  throw new Error("Failed to send transaction after retries");
}

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
      console.log("[WithdrawController] Using RPC:", rpcUrl);
      const connection = new Connection(rpcUrl, "confirmed");

      // compute rent-exempt minimum for a 0-data account
      let rentExemptMin = 0;
      try {
        rentExemptMin = await connection.getMinimumBalanceForRentExemption(0);
      } catch (err) {
        console.warn("[WithdrawController] getMinimumBalanceForRentExemption failed:", err);
        // fall back to a reasonable default (devnet typical)
        rentExemptMin = 890_880;
      }

      // check recipient existence & balance
      const recipientPubkey = new PublicKey(publicKey);
      let recipientInfo = null;
      try {
        recipientInfo = await connection.getAccountInfo(recipientPubkey);
      } catch (fetchErr) {
        console.warn("[WithdrawController] getAccountInfo failed:", fetchErr);
        recipientInfo = null;
      }

      // determine if top-up needed (recipient missing and pending < rentExemptMin)
      const needsTopUp = !recipientInfo && pendingLamports < rentExemptMin;
      const topUpAmount = needsTopUp ? rentExemptMin - pendingLamports : 0;
      const totalNeeded = pendingLamports + topUpAmount;

      // fetch payer balance
      let payerBalance = 0;
      try {
        payerBalance = await connection.getBalance(payer.publicKey);
      } catch (err) {
        console.error("[WithdrawController] failed to get payer balance:", err);
        res.status(500).json({ ok: false, error: "failed to get payer balance", details: String(err) });
        return;
      }

      // If payer lacks funds, attempt airdrop on devnet
      if (payerBalance < totalNeeded) {
        if (rpcUrl.includes("devnet")) {
          const needed = totalNeeded - payerBalance;
          try {
            console.log(`[WithdrawController] payer insufficient, requesting airdrop ${needed} lamports`);
            const aSig = await connection.requestAirdrop(payer.publicKey, needed);
            const ok = await confirmSignatureWithRetries(connection, aSig, 16, 2000);
            if (!ok) {
              // refresh balance anyway and check
              const newBal = await connection.getBalance(payer.publicKey);
              if (newBal < totalNeeded) {
                res.status(400).json({
                  ok: false,
                  error: "server payer still has insufficient funds after airdrop",
                  details: { payerBalance: newBal, required: totalNeeded },
                });
                return;
              }
              payerBalance = newBal;
            } else {
              payerBalance = await connection.getBalance(payer.publicKey);
            }
          } catch (airErr) {
            console.error("[WithdrawController] airdrop attempt failed:", airErr);
            res.status(400).json({
              ok: false,
              error: "server payer has insufficient funds and airdrop failed",
              details: String(airErr),
            });
            return;
          }
        } else {
          res.status(400).json({
            ok: false,
            error: "server payer has insufficient funds",
            details: { payerBalance, required: totalNeeded },
          });
          return;
        }
      }

      // If recipient is missing AND we need topUp, do topUp first (separate tx).
      if (needsTopUp && topUpAmount > 0) {
        try {
          console.log(`[WithdrawController] Recipient missing, sending topUp ${topUpAmount} lamports to create account`);
          const topUpSig = await buildSignSendTxWithRetries(connection, payer, [
            SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipientPubkey, lamports: topUpAmount }),
          ], 5);
          // ensure account exists now
          const refreshed = await connection.getAccountInfo(recipientPubkey);
          if (!refreshed) {
            res.status(500).json({ ok: false, error: "topUp transfer did not create recipient account", details: { topUpSig } });
            return;
          }
        } catch (err: any) {
          console.error("WithdrawController: topUp transfer failed:", err);
          if (err && (err as SendTransactionError).transactionLogs) {
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

      // Now perform payout transfer
      try {
        const payoutSig = await buildSignSendTxWithRetries(connection, payer, [
          SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipientPubkey, lamports: pendingLamports }),
        ], 5);

        // Final check of signature status
        const finalStatus = await connection.getSignatureStatuses([payoutSig]);
        const info = finalStatus?.value?.[0];
        if (info?.err) {
          res.status(500).json({ ok: false, error: "withdrawal failed (on-chain error)", details: info.err, signature: payoutSig });
          return;
        }

        // Clear pending payouts only after confirmed success
        validator.pendingPayouts = 0;
        await validator.save();

        res.json({ ok: true, txSignature: payoutSig });
        return;
      } catch (err: any) {
        console.error("WithdrawController: payout failed:", err);
        if (err && (err as SendTransactionError).transactionLogs) {
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
