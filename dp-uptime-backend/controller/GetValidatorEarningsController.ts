// src/controllers/GetValidatorEarningsController.ts
import { RequestHandler } from "express";
import mongoose from "mongoose";

export type Range = "day" | "week" | "month";

export type ValidatorEarningsPoint = {
  time: string; // ISO timestamp (bucket key)
  lamports: number;
  sol: number;
  solStr: string;
};

export type ValidatorEarningsResponse = {
  ok: true;
  points: ValidatorEarningsPoint[];
  pendingPayouts: {
    lamports: number;
    sol: number;
    solStr: string;
  };
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_COST_PER_VALIDATION = 100; // lamports fallback

function formatSolString(solNum: number): string {
  if (!isFinite(solNum) || isNaN(solNum)) return "0 SOL";
  return `${Number(solNum.toFixed(6)).toString().replace(/\.?0+$/, "")} SOL`;
}

interface LeanValidator {
  _id: any;
  publicKey?: string;
  pendingPayouts?: number;
  [k: string]: any;
}
interface LeanTick {
  createdAt: Date;
  [k: string]: any;
}

const GetValidatorEarningsController: RequestHandler = async (req, res) => {
  try {
    const publicKey = String(req.query.publicKey ?? "").trim();
    const r = String(req.query.range ?? "day").toLowerCase() as Range;

    if (!publicKey) {
      res.status(400).json({ ok: false, error: "missing publicKey" });
      return;
    }

    const conn = mongoose.connection;
    const ValidatorModel = conn?.models?.Validator;
    const WebsiteTickModel = conn?.models?.WebsiteTick;

    if (!ValidatorModel || !WebsiteTickModel) {
      console.error("[GetValidatorEarnings] models not found on mongoose.connection.models");
      res.status(500).json({ ok: false, error: "server misconfiguration" });
      return;
    }

    const validator = (await ValidatorModel.findOne({ publicKey }).lean<LeanValidator>().exec()) as LeanValidator | null;
    if (!validator) {
      res.status(404).json({ ok: false, error: "validator not found" });
      return;
    }

    // compute window start
    const now = new Date();
    let startDate = new Date();
    if (r === "day") {
      startDate.setHours(0, 0, 0, 0);
    } else if (r === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    } else if (r === "month") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setHours(0, 0, 0, 0);
    }

    // fetch ticks
    const validatorId = validator._id;
    const ticks = (await WebsiteTickModel.find({
      validatorId,
      createdAt: { $gte: startDate },
    })
      .select("createdAt")
      .lean<LeanTick[]>()
      .exec()) as LeanTick[];

    const COST_PER_VALIDATION = Number(process.env.COST_PER_VALIDATION ?? DEFAULT_COST_PER_VALIDATION);

    // bucket key generator
    function bucketKeyFromDate(d: Date | string): string {
      const dt = new Date(d);
      if (r === "day") {
        dt.setMinutes(0, 0, 0);
        return dt.toISOString();
      } else {
        dt.setUTCHours(0, 0, 0, 0);
        return dt.toISOString();
      }
    }

    // aggregate
    const buckets = new Map<string, number>();
    for (const t of ticks) {
      const key = bucketKeyFromDate(t.createdAt);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const points: ValidatorEarningsPoint[] = Array.from(buckets.entries())
      .map(([time, count]) => {
        const lamports = Number(count) * Number(COST_PER_VALIDATION);
        const sol = lamports / LAMPORTS_PER_SOL;
        return { time, lamports, sol, solStr: formatSolString(sol) };
      })
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const pendingLamports = Number(validator.pendingPayouts ?? 0) || 0;
    const pendingSol = pendingLamports / LAMPORTS_PER_SOL;

    const response: ValidatorEarningsResponse = {
      ok: true,
      points,
      pendingPayouts: {
        lamports: pendingLamports,
        sol: pendingSol,
        solStr: formatSolString(pendingSol),
      },
    };

    // send result (DO NOT `return res.json(...)` directly — use res.json then return void)
    res.json(response);
    return;
  } catch (err: any) {
    console.error("[GetValidatorEarnings] error:", err && err.message ? err.message : err);
    res.status(500).json({ ok: false, error: "internal" });
    return;
  }
};

export default GetValidatorEarningsController;
