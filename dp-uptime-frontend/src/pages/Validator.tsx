// src/pages/Validator.tsx
import { useAuth } from "@clerk/clerk-react";
import React, { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * Final cleaned Validator.tsx
 * - robust fetchWithPrefixes that awaits Clerk token and falls back to local token
 * - cache: 'no-store' to avoid 304
 * - polling for /validator-earnings every 3s and updating UI
 * - withdraw flow reuses same helper
 *
 * Assumes your backend is reachable at VITE_API_BASE or http://localhost:5000
 */

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8081";
const API_BASE_RAW = (import.meta.env.VITE_API_BASE ?? "http://localhost:5000").replace(/\/$/, "");
const LAMPORTS_PER_SOL = 1_000_000_000;
const CHECK_TIMEOUT_MS = 10_000;
const EARNINGS_POLL_MS = 3000;
const WS_PING_INTERVAL_MS = 20_000;

type Point = { time: string; value: number };

export default function Validator(): JSX.Element {
  // Clerk getToken hook (top-level)
  const { getToken } = useAuth();

  // UI state
  const [publicKey, setPublicKey] = useState<string>(() => {
    try {
      return localStorage.getItem("validatorPublicKey") ?? "";
    } catch {
      return "";
    }
  });
  const [monitoring, setMonitoring] = useState(false);

  // optional manual bearer token input (for testing)
  const [tokenInput, setTokenInput] = useState<string>(() => {
    try {
      return localStorage.getItem("validator_bearer_token") ?? "";
    } catch {
      return "";
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(1000);

  const [livePoints, setLivePoints] = useState<Point[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<number | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("validatorSessionToken");
    } catch {
      return null;
    }
  });

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Save/clear manual token
  function saveBearerToken(v: string | null) {
    try {
      if (v) {
        localStorage.setItem("validator_bearer_token", v);
        setTokenInput(v);
        toast.success("Saved token");
      } else {
        localStorage.removeItem("validator_bearer_token");
        setTokenInput("");
        toast.success("Cleared token");
      }
    } catch {
      toast.error("Could not save token");
    }
  }

  function fallbackLocalToken(): string | null {
    try {
      return (
        localStorage.getItem("validator_bearer_token") ??
        localStorage.getItem("authToken") ??
        localStorage.getItem("token") ??
        localStorage.getItem("validatorSessionToken") ??
        null
      );
    } catch {
      return null;
    }
  }

  // Build candidate URLs so we work with raw API_BASE or API_BASE that already contains /api/v1
  function makeCandidateUrls(path: string) {
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    const base = API_BASE_RAW;
    const candidates: string[] = [];

    // prefer base + /api/v1
    if (!base.endsWith("/api/v1")) {
      candidates.push(base + "/api/v1" + cleanPath);
    } else {
      candidates.push(base + cleanPath);
    }

    // base as-is
    candidates.push(base + cleanPath);

    // stripped root
    const stripped = base.replace(/\/api\/v1$/, "").replace(/\/$/, "");
    if (!candidates.includes(stripped + cleanPath)) candidates.push(stripped + cleanPath);

    return Array.from(new Set(candidates));
  }

  type FetchResult = {
    ok: boolean;
    status: number;
    url: string | null;
    resp?: Response | null;
    text?: string | null;
    json?: any | null;
    error?: any | null;
  };

  // robust fetch helper that attaches Authorization (Clerk token or fallback) and uses no-store cache
  async function fetchWithPrefixes(path: string, init?: RequestInit): Promise<FetchResult> {
    const urls = makeCandidateUrls(path);
    let lastNetworkErr: any = null;

    // attempt to get Clerk token once
    let clerkToken: string | null = null;
    try {
      clerkToken = await getToken().catch(() => null);
    } catch {
      clerkToken = null;
    }
    const fallback = fallbackLocalToken();

    for (const url of urls) {
      try {
        const headers = new Headers(init?.headers ?? {});
        if (!headers.has("Accept")) headers.set("Accept", "application/json");
        if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

        const bearer = tokenInput || clerkToken || fallback;
        if (bearer && !headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${bearer}`);
        }

        const mergedInit: RequestInit = {
          ...init,
          headers,
          credentials: init?.credentials ?? "include",
          cache: (init && (init as any).cache) ?? "no-store",
        };

        console.debug("[Validator] trying URL:", url, mergedInit.method ?? "GET", {
          headers: Object.fromEntries(headers.entries()),
          cache: (mergedInit as any).cache,
        });

        const resp = await fetch(url, mergedInit);
        const text = await resp.text().catch(() => "");
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        // server returned 404 — try next candidate
        if (resp.status === 404) {
          console.debug("[Validator] 404 from", url, "- trying next candidate");
          continue;
        }

        // If 304 somehow arrives, do a forced refetch with no-store (rare because we set no-store)
        if (resp.status === 304) {
          console.debug("[Validator] 304 received for", url, "— forcing second fetch");
          try {
            const resp2 = await fetch(url, { ...mergedInit, cache: "no-store" });
            const text2 = await resp2.text().catch(() => "");
            let json2: any = null;
            try { json2 = text2 ? JSON.parse(text2) : null; } catch { json2 = null; }
            if (resp2.status === 404) continue;
            return { ok: resp2.ok, status: resp2.status, url, resp: resp2, text: text2, json: json2 };
          } catch (err2) {
            lastNetworkErr = err2;
            continue;
          }
        }

        return { ok: resp.ok, status: resp.status, url, resp, text, json };
      } catch (err) {
        console.debug("[Validator] network error trying", url, err);
        lastNetworkErr = err;
        continue;
      }
    }

    return { ok: false, status: 0, url: null, resp: null, text: null, json: null, error: lastNetworkErr };
  }

  // ---------- Earnings polling ----------
  useEffect(() => {
    if (!publicKey) return;
    let mounted = true;

    async function fetchEarnings() {
      const path = `/validator-earnings?publicKey=${encodeURIComponent(publicKey)}&range=day`;
      const result = await fetchWithPrefixes(path, { method: "GET", credentials: "include" });
      if (!mounted) return;

      if (!result.ok) {
        console.debug("[Validator] fetchEarnings failed", result.status, result.url, result.text ?? result.json);
        return;
      }

      const json = result.json ?? null;
      if (!json || !json.ok) {
        console.debug("[Validator] fetchEarnings invalid payload", result.text ?? json);
        return;
      }

      // map server points to chart points
      const points: Point[] = Array.isArray(json.points)
        ? json.points.map((p: any) => ({ time: p.time, value: Number(p.sol || 0) }))
        : [];

      // Merge history from server with any live points we have (dedupe by time)
      setLivePoints((prev) => {
        const map = new Map<string, number>();
        points.forEach((pt) => map.set(pt.time, pt.value));
        prev.forEach((pt) => {
          if (!map.has(pt.time)) map.set(pt.time, pt.value);
        });
        const arr = Array.from(map.entries()).map(([time, value]) => ({ time, value }));
        arr.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        return arr.slice(-500);
      });

      // pending payouts from server
      if (json.pendingPayouts && typeof json.pendingPayouts.sol === "number") {
        setPendingPayouts(json.pendingPayouts.sol);
      } else if (typeof json.pendingPayouts?.sol === "string") {
        setPendingPayouts(Number(json.pendingPayouts.sol || 0));
      }
    }

    // initial fetch then interval
    fetchEarnings();
    const id = window.setInterval(fetchEarnings, EARNINGS_POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [publicKey, tokenInput, sessionToken, getToken]);

  // ---------- Browser-check helper (used by WS validate messages) ----------
  async function performBrowserCheck(url: string, timeoutMs = CHECK_TIMEOUT_MS) {
    const start = Date.now();

    try {
      // server proxy (robust)
      const result = await fetchWithPrefixes(`/browser-check?url=${encodeURIComponent(url)}`, { method: "GET" });
      if (result.ok && result.json && typeof result.json.ok === "boolean") {
        const latency = typeof result.json.latency === "number" ? result.json.latency : Date.now() - start;
        return { ok: result.json.ok, latency };
      }
    } catch (err) {
      console.debug("[Validator] proxy browser-check failed:", err);
    }

    // fallback to direct fetch (no-cors)
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      await fetch(url, { method: "GET", mode: "no-cors" as RequestMode, signal: controller.signal });
      clearTimeout(id);
      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      return { ok: false, latency: Date.now() - start };
    }
  }

  // ---------- Minimal WS: subscribe for earnings and handle `earning` and `validate` messages ----------
  function safeSend(ws: WebSocket | null, obj: any) {
    if (!ws) return false;
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
        return true;
      }
      return false;
    } catch (err) {
      console.debug("[Validator] safeSend failed", err, obj);
      return false;
    }
  }

  function openWsAndRegister(pk: string) {
    if (!pk) {
      toast.error("No public key provided");
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.debug("[Validator] WS already open");
      return;
    }

    try { wsRef.current?.close(); } catch {}
    if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = async () => {
      console.debug("[Validator] ws.onopen");
      backoffRef.current = 1000;
      // start simple ping
      pingTimerRef.current = window.setInterval(() => {
        try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", data: { ts: Date.now() } })); } catch {}
      }, WS_PING_INTERVAL_MS);
      setMonitoring(true);
      toast.success("Connected to Hub");

      // subscribe to earnings
      try {
        safeSend(ws, { type: "subscribe_earnings", data: { publicKey: pk, sessionToken: sessionToken ?? localStorage.getItem("validatorSessionToken") } });
        console.debug("[Validator] subscribe_earnings sent");
      } catch (err) {
        console.debug("[Validator] subscribe_earnings error", err);
      }
    };

    ws.onmessage = async (ev) => {
      let payload: any = null;
      try {
        payload = JSON.parse(ev.data);
      } catch (err) {
        console.debug("[Validator] ws JSON parse failed", err, ev.data);
        return;
      }

      try {
        // handle earnings updates
        if (payload.type === "earning") {
          const lamports = Number(payload.data?.value || 0);
          const solValue = lamports / LAMPORTS_PER_SOL;
          const pt = { time: String(payload.data?.time ?? new Date().toISOString()), value: solValue };
          setLivePoints((prev) => {
            const next = [...prev, pt];
            if (next.length > 500) next.shift();
            return next;
          });
          if (payload.data?.pendingPayouts !== undefined) {
            const ppSol = Number(payload.data.pendingPayouts || 0) / LAMPORTS_PER_SOL;
            setPendingPayouts(ppSol);
          }
          return;
        }

        // handle validate requests from Hub
        if (payload.type === "validate") {
          const data = payload.data ?? {};
          const url = typeof data.url === "string" ? data.url : null;
          const callbackId = data.callbackId ?? null;
          const websiteId = data.websiteId ?? null;

          // always reply (if missing fields -> Bad)
          if (!url || !callbackId || !websiteId) {
            console.warn("[Validator] validate missing fields; sending Bad reply", { url, callbackId, websiteId });
            const replyBad = {
              type: "validate",
              data: {
                validatorId: localStorage.getItem("validatorId"),
                callbackId: callbackId ?? "missing-callback",
                websiteId: websiteId ?? "missing-website",
                status: "Bad",
                latency: CHECK_TIMEOUT_MS + 5000,
                sessionToken: sessionToken ?? localStorage.getItem("validatorSessionToken"),
              },
            };
            safeSend(ws, replyBad);
            return;
          }

          // run the check
          let ok = false;
          let measuredLatency = CHECK_TIMEOUT_MS + 1;
          try {
            const res = await performBrowserCheck(url, CHECK_TIMEOUT_MS);
            ok = !!res.ok;
            measuredLatency = Math.max(0, Number(res.latency) || 0);
            console.debug("[Validator] browser-check result", { url, ok, measuredLatency });
          } catch (err) {
            console.debug("[Validator] performBrowserCheck error", err);
            ok = false;
            measuredLatency = CHECK_TIMEOUT_MS + 5000;
          }

          const effectiveLatency = ok ? measuredLatency : Math.max(measuredLatency, CHECK_TIMEOUT_MS + 5000);

          const reply: any = {
            type: "validate",
            data: {
              validatorId: localStorage.getItem("validatorId"),
              callbackId,
              websiteId,
              status: ok ? "Good" : "Bad",
              latency: effectiveLatency,
              sessionToken: sessionToken ?? localStorage.getItem("validatorSessionToken"),
            },
          };

          // if no session token, try best-effort phantom sign
          if (!reply.data.sessionToken) {
            try {
              if ((window as any).solana && (window as any).solana.isPhantom) {
                const msg = `Replying to ${callbackId} at ${Date.now()}`;
                const msgBytes = new TextEncoder().encode(msg);
                const signed = await (window as any).solana.signMessage?.(msgBytes, "utf8").catch(() => null);
                const sig = (signed as any)?.signature ?? signed;
                if (sig) reply.data.signedMessage = JSON.stringify(Array.from(sig));
              }
            } catch (err) {
              console.debug("[Validator] signing reply failed", err);
            }
          }

          try {
            const okSent = safeSend(ws, reply);
            console.debug("[Validator] sent validate reply", { okSent, reply });
          } catch (err) {
            console.error("[Validator] failed to send validate reply", err, reply);
          }

          return;
        }

        // unknown message type -> log
        console.debug("[Validator] unhandled ws payload type:", payload.type);
      } catch (err) {
        console.error("[Validator] onmessage handler error:", err);
      }
    };

    ws.onclose = (ev) => {
      wsRef.current = null;
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      setMonitoring(false);
      toast.error("Disconnected from Hub");
      // schedule reconnect with backoff
      const d = backoffRef.current;
      window.setTimeout(() => {
        const pk2 = publicKey || localStorage.getItem("validatorPublicKey") || "";
        if (pk2) openWsAndRegister(pk2);
        backoffRef.current = Math.min(60_000, Math.floor(backoffRef.current * 1.6));
      }, d);
    };

    ws.onerror = (e) => {
      console.error("[Validator] WS error event:", e);
    };
  }

  function startMonitoring() {
    const pk = publicKey || localStorage.getItem("validatorPublicKey") || "";
    if (!pk) {
      // if Phantom is present, you can implement connect flow here; otherwise ask user to paste key
      toast.error("Please supply a public key (or implement Phantom connect flow)");
      return;
    }
    openWsAndRegister(pk);
  }

  function stopMonitoring() {
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
    setMonitoring(false);
  }

  // ---------- Withdraw helpers ----------
  async function fetchEarningsOnce() {
    if (!publicKey) return;
    const path = `/validator-earnings?publicKey=${encodeURIComponent(publicKey)}&range=day`;
    const result = await fetchWithPrefixes(path, { method: "GET", credentials: "include" });
    if (!result.ok) {
      console.debug("[Withdraw] fetch earnings once failed", result.status, result.url, result.text ?? result.json);
      return;
    }
    const json = result.json ?? null;
    if (!json || !json.ok) return;
    if (json.pendingPayouts && typeof json.pendingPayouts.sol === "number") {
      setPendingPayouts(json.pendingPayouts.sol);
    } else if (typeof json.pendingPayouts?.sol === "string") {
      setPendingPayouts(Number(json.pendingPayouts.sol || 0));
    }
  }

  async function handleTakeEarnings() {
    if (!publicKey) { toast.error("No publicKey set"); return; }
    if (!pendingPayouts || pendingPayouts <= 0) { toast.error("No payouts available to withdraw"); return; }

    setWithdrawLoading(true);
    try {
      const result = await fetchWithPrefixes("/withdraw", {
        method: "POST",
        body: JSON.stringify({ publicKey }),
        credentials: "include",
      });

      if (!result.ok) {
        toast.error("Withdraw failed: " + (result.json?.error ?? result.text ?? `HTTP ${result.status}`));
        console.debug("[Withdraw] failed", result.status, result.url, result.text ?? result.json);
      } else {
        toast.success("Withdraw successful — tx: " + (result.json?.txSignature ?? "unknown"));
        setPendingPayouts(0);
      }
    } catch (err) {
      console.error("[Withdraw] error", err);
      toast.error("Withdraw error: " + String(err));
    } finally {
      setWithdrawLoading(false);
      setWithdrawOpen(false);
    }
  }

  // ---------- UI helpers ----------
  const totalFromPoints = (pts: Point[]) => pts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const formatMoney = (n: number) => (isNaN(n) ? "-" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(n)} SOL`);

  function EarningsChart({ points }: { points: Point[] }) {
    return (
      <div className="w-full h-64 bg-white/5 rounded-md p-3 border border-white/5">
        {points.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">No earnings data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <XAxis dataKey="time" tickFormatter={(t) => String(t).slice(11, 19)} minTickGap={10} />
              <YAxis />
              <Tooltip formatter={(value: any) => `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`} />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try { wsRef.current?.close(); } catch {}
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (reconnectTimerRef.current) { window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Render ----------
  return (
    <div className="min-h-screen flex items-start justify-center py-12 px-4">
      <Toaster />
      <div className="w-full max-w-2xl bg-gradient-to-br from-slate-900 to-purple-900 rounded-xl p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold mb-4">Validator — Monitoring & Earnings</h1>

        <div className="mb-4">
          <label className="block text-sm text-slate-300 mb-2">Validator public key</label>
          <div className="flex gap-2">
            <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="Paste your Solana public key" className="flex-1 px-3 py-2 rounded-md bg-white/5 border border-white/10" />
            {monitoring ? <button onClick={stopMonitoring} className="px-4 py-2 bg-red-600 rounded-md">Stop</button>
              : <button onClick={startMonitoring} className="px-4 py-2 bg-green-600 rounded-md">Start Streaming</button>}
          </div>
        </div>

        <div className="flex gap-4 mb-4 items-start">
          <div>
            <div className="text-xs text-slate-300">Total (history + live)</div>
            <div className="text-xl font-semibold">{formatMoney(totalFromPoints(livePoints))}</div>
          </div>

          <div>
            <div className="text-xs text-slate-300">Pending payouts</div>
            <div className="text-xl font-semibold">{pendingPayouts === null ? "-" : formatMoney(pendingPayouts)}</div>
            <div className="mt-2">
              <button onClick={async () => { await fetchEarningsOnce(); setWithdrawOpen(true); }} className="px-3 py-1 bg-indigo-600 rounded-md text-sm">Withdraw</button>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium mb-2">Earnings (live)</h2>
          <EarningsChart points={livePoints} />
        </div>
      </div>

      {/* Withdraw Modal */}
      {withdrawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 text-gray-900">
            <h3 className="text-lg font-semibold mb-4">Withdraw Earnings</h3>
            <p className="mb-4">You have <strong>{formatMoney(Number(pendingPayouts ?? 0))}</strong> available to withdraw.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setWithdrawOpen(false)} className="px-3 py-2 rounded-md border">Cancel</button>
              <button onClick={handleTakeEarnings} disabled={withdrawLoading || (pendingPayouts ?? 0) <= 0} className="px-3 py-2 rounded-md bg-green-600 text-white disabled:opacity-60">
                {withdrawLoading ? "Processing..." : "Take it"}
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-3">If "Take it" is disabled, there are no pending payouts.</div>
          </div>
        </div>
      )}
    </div>
  );
}
