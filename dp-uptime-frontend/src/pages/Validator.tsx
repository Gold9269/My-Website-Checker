// src/pages/Validator.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Globe,
  Moon,
  Sun,
  Network,
} from "lucide-react";
import { useAuth, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";
import toast, { Toaster } from "react-hot-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useValidator } from "../context/validator";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8081";
const API_BASE_RAW = (import.meta.env.VITE_API_BASE ?? "http://localhost:5000").replace(/\/$/, "");
const LAMPORTS_PER_SOL = 1_000_000_000;
const CHECK_TIMEOUT_MS = 10_000;
const EARNINGS_POLL_MS = 3000;
const WS_PING_INTERVAL_MS = 20_000;

// new: how often to poll the backend for validator count (ms)
const VALIDATOR_POLL_MS = 10_000;

type Point = { time: string; value: number };

const backendUrl = "http://localhost:5000";

/* ------------------ Navbar (same look as tracker) ------------------ */
function Navbar({
  isDark,
  toggleTheme,
  nodesOnline = 0,
  onGetStarted,
}: {
  isDark: boolean;
  toggleTheme: () => void;
  nodesOnline?: number;
  onGetStarted?: () => void;
}): JSX.Element {
  const { validator, pendingPayoutsSol, setValidator: setValidatorInContext } = (() => {
    try { return useValidator(); } catch { return { validator: null, pendingPayoutsSol: null, setValidator: undefined } as any; }
  })();

  const handleDisconnectValidator = async () => {
    try {
      try { localStorage.removeItem("validatorPublicKey"); } catch {}
      try { if ((window as any).solana?.disconnect) await (window as any).solana.disconnect(); } catch (err) { console.warn("Phantom disconnect failed:", err); }
      if (typeof setValidatorInContext === "function") setValidatorInContext(null);
      toast.success("Wallet disconnected (local state cleared)");
    } catch (err) {
      console.error("Disconnect failed:", err);
      toast.error("Failed to disconnect");
    }
  };

  const navBgClass = isDark ? "bg-[#071025] bg-opacity-95 border-slate-800/40 shadow-2xl" : "bg-white/95 border-gray-200/60 shadow";

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 ${navBgClass} backdrop-blur-md border-b`}> 
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Clickable brand that navigates home */}
          <div
            className="flex items-center space-x-3 cursor-pointer"
            title="Go home"
            onClick={() => { try { window.location.assign("/"); } catch { /* ignore */ } }}
            role="button"
            aria-label="DecentWatch home"
          >
            <div className="relative">
              <Network className={`w-8 h-8 ${isDark ? "text-blue-300" : "text-blue-600"} animate-pulse`} />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
            </div>
            <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>DecentWatch</span>
          </div>

          <div className="flex items-center space-x-6">
            <div className={`hidden md:flex items-center space-x-2 px-3 py-1 rounded-full ${isDark ? 'bg-emerald-900/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">{nodesOnline} Nodes Online</span>
            </div>

            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`p-2 rounded-full transition-all duration-300 hover:scale-110 ${isDark ? 'bg-yellow-400/10 text-yellow-300' : 'bg-slate-100 text-slate-700'}`}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {validator ? (
              <>
                <div className={`hidden sm:flex items-center px-3 py-1 rounded-full ${isDark ? 'bg-slate-700/40 text-slate-200' : 'bg-white/90 text-slate-800'} border ${isDark ? 'border-slate-600' : 'border-gray-200'}`}>
                  <span className="text-xs font-medium mr-2">Pending</span>
                  <span className="text-sm font-semibold">{pendingPayoutsSol ?? 0} SOL</span>
                </div>

                <button
                  onClick={handleDisconnectValidator}
                  className="px-3 py-1 rounded-md text-sm font-medium transition-colors mr-2 bg-white text-slate-700 border border-slate-300 shadow-sm"
                  type="button"
                >
                  Disconnect Wallet
                </button>
              </>
            ) : null}

            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton>
                  <button className={`${isDark ? 'px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-200' : 'px-4 py-2 rounded-lg text-sm font-medium bg-white text-slate-700'}`} onClick={() => window.location.assign("/tracker")}>Sign in</button>
                </SignInButton>

                <SignUpButton>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white" onClick={() => window.location.assign("/tracker")}>Sign up</button>
                </SignUpButton>
              </SignedOut>

              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

/* ------------------ Validator page (logic preserved, improved polling) ------------------ */
export default function Validator(): JSX.Element {
  const { getToken } = useAuth();

  // theme
  const savedTheme = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (savedTheme === "dark") return true;
    if (savedTheme === "light") return false;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
    return true;
  });
  useEffect(() => { try { if (isDarkMode) { document.documentElement.classList.add("dark"); localStorage.setItem("theme", "dark"); } else { document.documentElement.classList.remove("dark"); localStorage.setItem("theme", "light"); } } catch {} }, [isDarkMode]);

  // state & refs (unchanged)
  const [publicKey, setPublicKey] = useState<string>(() => { try { return localStorage.getItem("validatorPublicKey") ?? ""; } catch { return ""; } });
  const [monitoring, setMonitoring] = useState(false);
  const [tokenInput, setTokenInput] = useState<string>(() => { try { return localStorage.getItem("validator_bearer_token") ?? ""; } catch { return ""; } });

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(1000);

  // NEW: flag to indicate a user-initiated stop (prevents automatic reconnect)
  const userRequestedDisconnectRef = useRef<boolean>(false);

  const [livePoints, setLivePoints] = useState<Point[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<number | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => { try { return localStorage.getItem("validatorSessionToken"); } catch { return null; } });

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // NEW: validators count state (used to show nodes in Navbar)
  const [validatorsCount, setValidatorsCount] = useState<number | null>(null);
  const validatorsPollRef = useRef<number | null>(null);
  const validatorsBackoffRef = useRef<number>(1);

  function saveBearerToken(v: string | null) {
    try {
      if (v) { localStorage.setItem("validator_bearer_token", v); setTokenInput(v); toast.success("Saved token"); }
      else { localStorage.removeItem("validator_bearer_token"); setTokenInput(""); toast.success("Cleared token"); }
    } catch { toast.error("Could not save token"); }
  }

  function fallbackLocalToken(): string | null {
    try {
      return localStorage.getItem("validator_bearer_token") ?? localStorage.getItem("authToken") ?? localStorage.getItem("token") ?? localStorage.getItem("validatorSessionToken") ?? null;
    } catch { return null; }
  }

  function makeCandidateUrls(path: string) {
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    const base = API_BASE_RAW;
    const candidates: string[] = [];
    if (!base.endsWith("/api/v1")) { candidates.push(base + "/api/v1" + cleanPath); } else { candidates.push(base + cleanPath); }
    candidates.push(base + cleanPath);
    const stripped = base.replace(/\/api\/v1$/, "").replace(/\/$/, "");
    if (!candidates.includes(stripped + cleanPath)) candidates.push(stripped + cleanPath);
    return Array.from(new Set(candidates));
  }

  type FetchResult = { ok: boolean; status: number; url: string | null; resp?: Response | null; text?: string | null; json?: any | null; error?: any | null; };

  async function fetchWithPrefixes(path: string, init?: RequestInit): Promise<FetchResult> {
    const urls = makeCandidateUrls(path);
    let lastNetworkErr: any = null;
    let clerkToken: string | null = null;
    try { clerkToken = await getToken().catch(() => null); } catch { clerkToken = null; }
    const fallback = fallbackLocalToken();

    for (const url of urls) {
      try {
        const headers = new Headers(init?.headers ?? {});
        if (!headers.has("Accept")) headers.set("Accept", "application/json");
        if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        const bearer = tokenInput || clerkToken || fallback;
        if (bearer && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${bearer}`);
        const mergedInit: RequestInit = { ...init, headers, credentials: init?.credentials ?? "include", cache: (init && (init as any).cache) ?? "no-store" };

        const resp = await fetch(url, mergedInit);
        const text = await resp.text().catch(() => "");
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        if (resp.status === 404) { continue; }
        if (resp.status === 304) {
          try {
            const resp2 = await fetch(url, { ...mergedInit, cache: "no-store" });
            const text2 = await resp2.text().catch(() => "");
            let json2: any = null;
            try { json2 = text2 ? JSON.parse(text2) : null; } catch { json2 = null; }
            if (resp2.status === 404) continue;
            return { ok: resp2.ok, status: resp2.status, url, resp: resp2, text: text2, json: json2 };
          } catch (err2) { lastNetworkErr = err2; continue; }
        }
        return { ok: resp.ok, status: resp.status, url, resp, text, json };
      } catch (err) {
        lastNetworkErr = err;
        continue;
      }
    }
    return { ok: false, status: 0, url: null, resp: null, text: null, json: null, error: lastNetworkErr };
  }

  // ---------- NEW: validator-count polling ----------
  // tries to call /get-all-validator; if server returns array or { validators: [...] } we use the length
  async function fetchValidatorsCount(): Promise<boolean> {
    try {
      const res = await fetchWithPrefixes("/get-all-validator", { method: "GET", credentials: "include" });
      if (!res.ok) {
        // try /validators/count (optional alternative endpoint)
        const res2 = await fetchWithPrefixes("/validators/count", { method: "GET", credentials: "include" });
        if (res2.ok && res2.json && typeof res2.json.count === "number") {
          setValidatorsCount(res2.json.count);
          return true;
        }
        console.debug("[Validator] fetchValidatorsCount non-OK", res.status, res.url);
        return false;
      }
      const body = res.json ?? null;
      if (!body) {
        console.debug("[Validator] fetchValidatorsCount empty body");
        setValidatorsCount(0);
        return true;
      }
      if (Array.isArray(body)) {
        setValidatorsCount(body.length);
        return true;
      }
      if (Array.isArray(body.validators)) {
        setValidatorsCount(body.validators.length);
        return true;
      }
      // maybe body has count property
      if (typeof body.count === "number") {
        setValidatorsCount(body.count);
        return true;
      }
      // fallback: set 0 (explicit)
      setValidatorsCount(0);
      return true;
    } catch (err) {
      console.debug("[Validator] fetchValidatorsCount error", err);
      return false;
    }
  }

  // polling effect: visibility-aware + exponential backoff on failure
  useEffect(() => {
    let mounted = true;
    async function tick() {
      if (!mounted) return;
      const ok = await fetchValidatorsCount();
      if (!mounted) return;
      if (ok) {
        validatorsBackoffRef.current = 1;
        // schedule next normal poll
        validatorsPollRef.current = window.setTimeout(tick, VALIDATOR_POLL_MS);
      } else {
        // backoff on failure
        validatorsBackoffRef.current = Math.min(8, validatorsBackoffRef.current * 2 || 2);
        const delay = Math.min(VALIDATOR_POLL_MS * validatorsBackoffRef.current, 60_000);
        validatorsPollRef.current = window.setTimeout(tick, delay);
      }
    }

    // visibility handling: if tab hidden, pause polling; resume on visible
    function onVisibilityChange() {
      if (document.hidden) {
        if (validatorsPollRef.current) { window.clearTimeout(validatorsPollRef.current); validatorsPollRef.current = null; }
      } else {
        // kick off an immediate fetch when tab becomes visible
        void tick();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    // immediate fetch & start polling
    void tick();

    // respond to storage events (other tabs updating validator state)
    function onStorage(e: StorageEvent) {
      if (e.key === "validatorPublicKey" || e.key === "validatorSessionToken") {
        // quick refresh when relevant keys change
        void fetchValidatorsCount();
      }
    }
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      try { if (validatorsPollRef.current) window.clearTimeout(validatorsPollRef.current); } catch {}
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [tokenInput, sessionToken, getToken]);

  // ---------- REPLACED: Earnings effect (WS-first + fallback polling with backoff, batching) ----------
  useEffect(() => {
    if (!publicKey) return;
    let mounted = true;

    // batching for incoming points to avoid rapid re-renders
    let batchedPoints: Point[] | null = null;
    let flushTimer: number | null = null;
    const FLUSH_MS = 250;

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;

        // take a snapshot copy of batchedPoints so the updater closes over a stable immutable array
        const toFlush = batchedPoints ? batchedPoints.slice() : null;
        // clear the shared buffer immediately so new incoming points start a fresh batch
        batchedPoints = null;

        if (!toFlush || toFlush.length === 0) return;

        setLivePoints((prev) => {
          const map = new Map<string, number>();
          prev.forEach(p => map.set(p.time, p.value));
          // iterate over snapshot copy (no risk of null)
          toFlush.forEach(p => map.set(p.time, p.value));
          const arr = Array.from(map.entries()).map(([time, value]) => ({ time, value }));
          arr.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          return arr.slice(-500);
        });
      }, FLUSH_MS);
    }

    function queuePoints(newPts: Point[]) {
      if (!batchedPoints) batchedPoints = [];
      batchedPoints.push(...newPts);
      scheduleFlush();
    }

    async function fetchEarningsNow() {
      const path = `/validator-earnings?publicKey=${encodeURIComponent(publicKey)}&range=day`;
      try {
        const result = await fetchWithPrefixes(path, { method: "GET", credentials: "include" });
        if (!mounted) return false;
        if (!result.ok) {
          console.debug("[Validator] fetchEarnings failed", result.status, result.url);
          return false;
        }
        const json = result.json ?? null;
        if (!json || !json.ok) {
          console.debug("[Validator] fetchEarnings invalid payload", result.text ?? json);
          return false;
        }
        const points: Point[] = Array.isArray(json.points) ? json.points.map((p: any) => ({ time: p.time, value: Number(p.sol || 0) })) : [];
        if (points.length) queuePoints(points);

        if (json.pendingPayouts && typeof json.pendingPayouts.sol === "number") setPendingPayouts(json.pendingPayouts.sol);
        else if (typeof json.pendingPayouts?.sol === "string") setPendingPayouts(Number(json.pendingPayouts.sol || 0));
        return true;
      } catch (err) {
        console.debug("[Validator] fetchEarningsNow error", err);
        return false;
      }
    }

    // visibility helper
    function isVisible() { try { return !document.hidden; } catch { return true; } }

    // fallback polling when WS closed
    let pollTimer: number | null = null;
    let backoffMultiplier = 1;
    const BASE_POLL_MS = EARNINGS_POLL_MS;
    const MAX_POLL_MS = 30_000;

    async function pollOnce() {
      if (!mounted) return;
      if (!isVisible()) {
        // re-evaluate soon
        pollTimer = window.setTimeout(pollOnce, Math.min(BASE_POLL_MS * backoffMultiplier, MAX_POLL_MS));
        return;
      }

      const ok = await fetchEarningsNow();
      if (ok) backoffMultiplier = 1;
      else backoffMultiplier = Math.min(10, backoffMultiplier * 2);
      pollTimer = window.setTimeout(pollOnce, Math.min(BASE_POLL_MS * backoffMultiplier, MAX_POLL_MS));
    }

    function startFallbackPolling() {
      if (pollTimer) return;
      pollOnce();
    }
    function stopFallbackPolling() {
      if (pollTimer) { window.clearTimeout(pollTimer); pollTimer = null; }
      backoffMultiplier = 1;
    }

    // initial fetch to populate history
    fetchEarningsNow();

    // watch websocket status and toggle polling accordingly
    const wsCheckInterval = window.setInterval(() => {
      try {
        const ws = wsRef.current;
        const isWsOpen = !!(ws && ws.readyState === WebSocket.OPEN);
        if (isWsOpen) {
          stopFallbackPolling();
        } else {
          // only poll if tab visible
          if (isVisible()) startFallbackPolling();
        }
      } catch (err) {
        // on weird error, start polling as fallback
        startFallbackPolling();
      }
    }, 1000);

    // visibility change handler
    function onVisibilityChange() {
      if (!isVisible()) {
        stopFallbackPolling();
      } else {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) startFallbackPolling();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // cleanup
    return () => {
      mounted = false;
      try { if (wsCheckInterval) window.clearInterval(wsCheckInterval); } catch {}
      stopFallbackPolling();
      if (flushTimer) { window.clearTimeout(flushTimer); flushTimer = null; }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [publicKey, tokenInput, sessionToken, getToken]);

  // ---------- Browser-check helper (used by WS validate messages) ----------
  async function performBrowserCheck(url: string, timeoutMs = CHECK_TIMEOUT_MS) {
    const start = Date.now();
    try {
      const result = await fetchWithPrefixes(`/browser-check?url=${encodeURIComponent(url)}`, { method: "GET" });
      if (result.ok && result.json && typeof result.json.ok === "boolean") {
        const latency = typeof result.json.latency === "number" ? result.json.latency : Date.now() - start;
        return { ok: result.json.ok, latency };
      }
    } catch (err) { console.debug("[Validator] proxy browser-check failed:", err); }

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

  function safeSend(ws: WebSocket | null, obj: any) {
    if (!ws) return false;
    try { if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(obj)); return true; } return false; } catch (err) { console.debug("[Validator] safeSend failed", err, obj); return false; }
  }

  function openWsAndRegister(pk: string) {
    if (!pk) { toast.error("No public key provided"); return; }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    try { wsRef.current?.close(); } catch {}
    if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }

    // ensure any scheduled reconnect is cleared (we are explicitly opening now)
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = async () => {
      backoffRef.current = 1000;
      pingTimerRef.current = window.setInterval(() => { try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", data: { ts: Date.now() } })); } catch {} }, WS_PING_INTERVAL_MS);
      setMonitoring(true);
      toast.success("Connected to Hub");
      try { safeSend(ws, { type: "subscribe_earnings", data: { publicKey: pk, sessionToken: sessionToken ?? localStorage.getItem("validatorSessionToken") } }); } catch (err) { console.debug("[Validator] subscribe_earnings error", err); }
      // when a new WS connection is established, refresh the validators count (helps update other tabs quickly)
      void fetchValidatorsCount();
    };

    ws.onmessage = async (ev) => {
      let payload: any = null;
      try { payload = JSON.parse(ev.data); } catch (err) { console.debug("[Validator] ws JSON parse failed", err, ev.data); return; }

      try {
        if (payload.type === "earning") {
          const lamports = Number(payload.data?.value || 0);
          const solValue = lamports / LAMPORTS_PER_SOL;
          const pt = { time: String(payload.data?.time ?? new Date().toISOString()), value: solValue };
          // batch small incoming updates: push straight into state with single update
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

        if (payload.type === "validate") {
          const data = payload.data ?? {};
          const url = typeof data.url === "string" ? data.url : null;
          const callbackId = data.callbackId ?? null;
          const websiteId = data.websiteId ?? null;

          if (!url || !callbackId || !websiteId) {
            const replyBad = { type: "validate", data: { validatorId: localStorage.getItem("validatorId"), callbackId: callbackId ?? "missing-callback", websiteId: websiteId ?? "missing-website", status: "Bad", latency: CHECK_TIMEOUT_MS + 5000, sessionToken: sessionToken ?? localStorage.getItem("validatorSessionToken") } };
            safeSend(ws, replyBad);
            return;
          }

          let ok = false;
          let measuredLatency = CHECK_TIMEOUT_MS + 1;
          try {
            const res = await performBrowserCheck(url, CHECK_TIMEOUT_MS);
            ok = !!res.ok;
            measuredLatency = Math.max(0, Number(res.latency) || 0);
          } catch {
            ok = false;
            measuredLatency = CHECK_TIMEOUT_MS + 5000;
          }

          const effectiveLatency = ok ? measuredLatency : Math.max(measuredLatency, CHECK_TIMEOUT_MS + 5000);
          const reply: any = { type: "validate", data: { validatorId: localStorage.getItem("validatorId"), callbackId, websiteId, status: ok ? "Good" : "Bad", latency: effectiveLatency, sessionToken: sessionToken ?? localStorage.getItem("validatorSessionToken") } };

          if (!reply.data.sessionToken) {
            try {
              if ((window as any).solana && (window as any).solana.isPhantom) {
                const msg = `Replying to ${callbackId} at ${Date.now()}`;
                const msgBytes = new TextEncoder().encode(msg);
                const signed = await (window as any).solana.signMessage?.(msgBytes, "utf8").catch(() => null);
                const sig = (signed as any)?.signature ?? signed;
                if (sig) reply.data.signedMessage = JSON.stringify(Array.from(sig));
              }
            } catch (err) { console.debug("[Validator] signing reply failed", err); }
          }

          try { const okSent = safeSend(ws, reply); console.debug("[Validator] sent validate reply", { okSent, reply }); } catch (err) { console.error("[Validator] failed to send validate reply", err, reply); }
          return;
        }

        console.debug("[Validator] unhandled ws payload type:", payload.type);
      } catch (err) { console.error("[Validator] onmessage handler error:", err); }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      setMonitoring(false);

      // User intentionally stopped — do not auto-reconnect
      if (userRequestedDisconnectRef.current) {
        toast.info("Disconnected from Hub (manual)");
        // make sure backoff resets for future manual start
        backoffRef.current = 1000;
      } else {
        // Unexpected disconnect — attempt reconnect with backoff
        toast.error("Disconnected from Hub (will retry)");
        const d = backoffRef.current || 1000;
        // schedule reconnect
        reconnectTimerRef.current = window.setTimeout(() => {
          const pk2 = publicKey || localStorage.getItem("validatorPublicKey") || "";
          if (pk2) openWsAndRegister(pk2);
          backoffRef.current = Math.min(60_000, Math.floor((backoffRef.current || 1000) * 1.6));
        }, d);
      }

      // optionally refresh validators count on any close
      void fetchValidatorsCount();
    };

    ws.onerror = (e) => { console.error("[Validator] WS error event:", e); };
  }

  function startMonitoring() {
    const pk = publicKey || localStorage.getItem("validatorPublicKey") || "";
    if (!pk) {
      if ((window as any).solana && (window as any).solana.isPhantom) {
        (window as any).solana.connect?.().then((r: any) => {
          const gotPk = r?.publicKey?.toString?.() ?? "";
          setPublicKey(gotPk);
          try { localStorage.setItem("validatorPublicKey", gotPk); } catch {}
          // Ensure this is not treated as a user stop
          userRequestedDisconnectRef.current = false;
          openWsAndRegister(gotPk);
          void fetchValidatorsCount();
        }).catch((err: any) => toast.error("Phantom connect failed: " + String(err)));
        return;
      } else {
        toast.error("Please supply a public key or install Phantom");
        return;
      }
    }

    // If user explicitly clicked Start, clear the user-stop flag so onclose can reconnect
    userRequestedDisconnectRef.current = false;
    openWsAndRegister(pk);
  }

  function stopMonitoring() {
    try {
      // mark that user intentionally stopped — prevents auto-reconnect in ws.onclose
      userRequestedDisconnectRef.current = true;

      // clear any scheduled reconnect attempt (if scheduled)
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // close websocket and timers
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      setMonitoring(false);
      toast.success("Stopped monitoring (manual)");
      // reset backoff so next manual start is fresh
      backoffRef.current = 1000;
    } catch (err) {
      console.error("stopMonitoring error:", err);
    }
  }

  // fetch once (used by Withdraw modal flow)
  async function fetchEarningsOnce() {
    if (!publicKey) return;
    const path = `/validator-earnings?publicKey=${encodeURIComponent(publicKey)}&range=day`;
    const result = await fetchWithPrefixes(path, { method: "GET", credentials: "include" });
    if (!result.ok) { console.debug("[Withdraw] fetch earnings once failed", result.status, result.url, result.text ?? result.json); return; }
    const json = result.json ?? null;
    if (!json || !json.ok) return;
    if (json.pendingPayouts && typeof json.pendingPayouts.sol === "number") setPendingPayouts(json.pendingPayouts.sol);
    else if (typeof json.pendingPayouts?.sol === "string") setPendingPayouts(Number(json.pendingPayouts.sol || 0));
  }

  async function handleTakeEarnings() {
    if (!publicKey) { toast.error("No publicKey set"); return; }
    if (!pendingPayouts || pendingPayouts <= 0) { toast.error("No payouts available to withdraw"); return; }
    setWithdrawLoading(true);
    try {
      const result = await fetchWithPrefixes("/withdraw", { method: "POST", body: JSON.stringify({ publicKey }), credentials: "include" });
      if (!result.ok) {
        toast.error("Withdraw failed: " + (result.json?.error ?? result.text ?? `HTTP ${result.status}`));
        console.debug("[Withdraw] failed", result.status, result.url, result.text ?? result.json);
      } else {
        toast.success("Withdraw successful — tx: " + (result.json?.txSignature ?? "unknown"));
        setPendingPayouts(0);
        // after a successful withdraw, refresh validators count too (optional)
        void fetchValidatorsCount();
      }
    } catch (err) { console.error("[Withdraw] error", err); toast.error("Withdraw error: " + String(err)); }
    finally { setWithdrawLoading(false); setWithdrawOpen(false); }
  }

  const totalFromPoints = (pts: Point[]) => pts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const formatMoney = (n: number) => (isNaN(n) ? "-" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(n)} SOL`);
  function EarningsChart({ points }: { points: Point[] }) {
    return (
      <div className="w-full h-64 rounded-md p-3" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.03)" }}>
        {points.length === 0 ? (
          <div className={`flex items-center justify-center h-full text-sm ${secondaryTextColor}`} >No earnings data yet.</div>
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

  useEffect(() => {
    return () => {
      try { wsRef.current?.close(); } catch {}
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (reconnectTimerRef.current) { window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    };
  }, []);

  // Styling tweaks only: provide a subtle layered background and cleaner glass card look
  const pageBg = isDarkMode ? "bg-gradient-to-br from-[#071025] via-[#07172a] to-[#061028]" : "bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50";
  const headerTextColor = isDarkMode ? "text-white" : "text-gray-900";
  const bodyTextColor = isDarkMode ? "text-white" : "text-slate-900";
  const secondaryTextColor = isDarkMode ? "text-slate-300" : "text-slate-600";
  const inputTextColor = isDarkMode ? "text-white" : "text-slate-900";
  const placeholderColor = isDarkMode ? "placeholder:text-slate-300" : "placeholder:text-slate-500"; 

  /* ---------- RENDER ---------- */
  return (
    <>
      {/* pass the dynamic validatorsCount into Navbar (default 0) */}
      <Navbar isDark={isDarkMode} toggleTheme={() => setIsDarkMode((s) => !s)} nodesOnline={validatorsCount ?? 0} onGetStarted={() => window.location.assign("/get-started")} />

      <div className={`relative min-h-screen transition-colors duration-200 pt-20 ${pageBg}`}>
        {/* Decorative background layers (purely visual, accessible-hidden) */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
          <div className="absolute -top-40 -left-40 w-[680px] h-[680px] rounded-full blur-3xl opacity-40" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.55), transparent 28%), radial-gradient(circle at 70% 70%, rgba(236,72,153,0.28), transparent 30%)', transform: 'translateZ(0)' }} />
          <div className="absolute -bottom-40 -right-40 w-[620px] h-[620px] rounded-full blur-2xl opacity-30" style={{ background: 'radial-gradient(circle at 40% 40%, rgba(14,165,233,0.32), transparent 25%)' }} />
          {/* subtle grid / texture */}
          <div className="absolute inset-0 -z-10" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '14px 14px', opacity: 0.6 }} />
        </div>

        <Toaster position="top-right" />
        <div className="max-w-3xl mx-auto py-12 px-4">
          {/* outer subtle gradient border to make the card pop */}
          <div className="rounded-xl p-1" style={{ background: isDarkMode ? 'linear-gradient(90deg, rgba(99,102,241,0.08), rgba(129,140,248,0.04))' : 'linear-gradient(90deg, rgba(59,130,246,0.06), rgba(99,102,241,0.03))' }}>
            {/* subtle bluish card with slight blush accent at edge */}
            <div className="rounded-xl overflow-hidden shadow-2xl" style={{ boxShadow: isDarkMode ? '0 20px 60px rgba(2,6,23,0.6)' : '0 10px 40px rgba(15,23,42,0.08)' }}>
              <div
                className="p-6"
                style={{
                  // Keep the card primarily bluish/navy, with a very subtle blush accent on the far edge.
                  // This is intentionally low-opacity so the card reads bluish but has a gentle warmth.
                  background: isDarkMode ? 'linear-gradient(135deg, rgba(8,18,33,0.92) 0%, rgba(18,32,54,0.9) 65%, rgba(203,60,124,0.04) 100%)' : 'linear-gradient(135deg, rgba(255,255,255,0.88) 0%, rgba(245,248,255,0.92) 65%)',
                  border: isDarkMode ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(2,6,23,0.04)',
                  backdropFilter: 'saturate(120%) blur(6px)',
                }}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <Globe className="w-8 h-8 text-blue-400 mt-1" />
                    <div>
                      <h1 className={`text-2xl font-bold ${headerTextColor}`}>Validator —</h1>
                      <h2 className={`text-2xl font-bold ${headerTextColor}`}>Monitoring & Earnings</h2>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-sm text-slate-300 mb-2">Validator public key</label>
                  <div className="flex gap-2">
                    <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="Paste your Solana public key" className={`flex-1 px-3 py-2 rounded-md ${isDarkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white/6 border border-white/8'} text-sm ${inputTextColor} focus:outline-none focus:ring-2 focus:ring-green-400`}   />
                    {monitoring ? <button onClick={stopMonitoring} className="px-4 py-2 bg-red-600 rounded-md shadow">Stop</button>
                      : <button onClick={startMonitoring} className="px-4 py-2 bg-green-600 rounded-md shadow">Start Streaming</button>}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-slate-300">Total (history + live)</div>
                    <div className={`text-2xl font-semibold ${bodyTextColor}`} >{formatMoney(totalFromPoints(livePoints))}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-300">Pending payouts</div>
                    <div className={`text-2xl font-semibold ${bodyTextColor}`} >{pendingPayouts === null ? "-" : formatMoney(pendingPayouts)}</div>
                    <div className="mt-3">
                      <button onClick={async () => { await fetchEarningsOnce(); setWithdrawOpen(true); }} className="px-3 py-1 bg-violet-600 rounded-md text-sm text-white shadow hover:scale-105 transition-transform">Withdraw</button>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className={`text-lg font-medium ${bodyTextColor} mb-3`} >Earnings (live)</h3>
                  <div className="rounded-lg overflow-hidden p-3" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.03)" }}>
                    <EarningsChart points={livePoints} />
                  </div>
                </div>
              </div>
            </div>
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
    </>
  );
}
