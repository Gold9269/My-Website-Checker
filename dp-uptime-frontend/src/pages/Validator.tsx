// src/pages/Validator.tsx
import React, { useEffect, useRef, useState } from "react";
import { Globe, Moon, Sun, Network, TrendingUp, Zap, Activity, DollarSign, Eye, EyeOff, Sparkles, Wifi, WifiOff, Power, PowerOff } from "lucide-react";
import { useAuth, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/clerk-react";
import toast, { Toaster } from "react-hot-toast";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { useValidator } from "../context/validator";
import axios from "axios";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8081";
const API_BASE_RAW = (import.meta.env.VITE_API_BASE ?? "http://localhost:5000").replace(/\/$/, "");
const LAMPORTS_PER_SOL = 1_000_000_000;
const CHECK_TIMEOUT_MS = 10_000;
const EARNINGS_POLL_MS = 3000;
const WS_PING_INTERVAL_MS = 20_000;
const VALIDATOR_POLL_MS = 10_000;

type Point = { time: string; value: number };

// ---------- Clean Navbar ----------
function Navbar({
  isDark,
  toggleTheme,
  nodesOnline = 0,
  onGetStarted,
  onValidatorDisconnect,
  onValidatorConnect,
  connectedPublicKey,
}: {
  isDark: boolean;
  toggleTheme: () => void;
  nodesOnline?: number;
  onGetStarted?: () => void;
  onValidatorDisconnect?: () => void;
  onValidatorConnect?: (publicKey: string) => void;
  connectedPublicKey?: string | null;
}): JSX.Element {
  const { validator, pendingPayoutsSol, setValidator: setValidatorInContext } = (() => {
    try { return useValidator(); } catch { return { validator: null, pendingPayoutsSol: null, setValidator: undefined } as any; }
  })();

  // NOTE: make sure `useUser` from Clerk is used in the component and `isSignedIn` is available:
  const { isSignedIn } = useUser();

  const handleConnect = async () => {
    try {
      // Require Clerk sign-in first
      if (!isSignedIn) {
        toast.error("Please sign in to connect your wallet.");
        return;
      }

      // Phantom flow
      if ((window as any).solana && (window as any).solana.isPhantom) {
        try {
          const resp = await (window as any).solana.connect();
          const gotPk = resp?.publicKey?.toString?.() ?? "";
          if (!gotPk) {
            toast.error("Phantom connect returned no public key");
            return;
          }

          // persist to localStorage and notify same-tab listeners
          try {
            localStorage.setItem("validatorPublicKey", gotPk);
            // Custom event so same-tab listeners can react immediately
            window.dispatchEvent(new CustomEvent("validatorPublicKeyChanged", { detail: gotPk }));
          } catch (e) {
            console.warn("Could not write validatorPublicKey to localStorage:", e);
          }

          // callback & context update
          try { onValidatorConnect?.(gotPk); } catch (err) { console.debug("onValidatorConnect callback error:", err); }
          if (typeof setValidatorInContext === "function") {
            try { setValidatorInContext(gotPk); } catch (err) { console.debug("setValidatorInContext error:", err); }
          }

          toast.success("Wallet connected successfully");
          return;
        } catch (err) {
          console.debug("Phantom connect failed:", err);
          toast.error("Phantom connect failed: " + String(err));
        }
      }

      // Manual paste fallback (still requires sign-in)
      const manualPk = prompt("Paste your Solana public key to connect as validator:");
      if (manualPk && manualPk.trim()) {
        const pk = manualPk.trim();
        try {
          localStorage.setItem("validatorPublicKey", pk);
          window.dispatchEvent(new CustomEvent("validatorPublicKeyChanged", { detail: pk }));
        } catch (e) {
          console.warn("Could not write validatorPublicKey to localStorage:", e);
        }

        try { onValidatorConnect?.(pk); } catch (err) { console.debug("onValidatorConnect cb error:", err); }
        if (typeof setValidatorInContext === "function") {
          try { setValidatorInContext(pk); } catch (err) { console.debug("setValidatorInContext error:", err); }
        }

        toast.success("Validator key set successfully");
      } else {
        toast("Connect cancelled");
      }
    } catch (err) {
      console.error("handleConnect error:", err);
      toast.error("Connect error");
    }
  };

  const handleDisconnect = async () => {
    try {
      // Remove local storage + notify same-tab listeners
      try {
        localStorage.removeItem("validatorPublicKey");
        window.dispatchEvent(new CustomEvent("validatorPublicKeyChanged", { detail: null }));
      } catch (e) {
        console.warn("Could not remove validatorPublicKey from localStorage:", e);
      }

      // Try to disconnect Phantom (best-effort)
      try {
        if ((window as any).solana?.disconnect) await (window as any).solana.disconnect();
      } catch (err) {
        console.warn("Phantom disconnect failed (non-fatal):", err);
      }

      // Clear context & notify parent callback
      if (typeof setValidatorInContext === "function") {
        try { setValidatorInContext(null); } catch (err) { console.debug("setValidatorInContext(null) failed:", err); }
      }
      try { onValidatorDisconnect?.(); } catch (err) { console.debug("onValidatorDisconnect cb error:", err); }

      toast.success("Wallet disconnected successfully");
    } catch (err) {
      console.error("Disconnect failed:", err);
      toast.error("Failed to disconnect");
    }
  };


  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isDark 
      ? 'bg-slate-950/80 border-slate-800/50' 
      : 'bg-white/80 border-slate-200/50'
    } backdrop-blur-xl border-b`}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div
            className="flex items-center space-x-3 cursor-pointer group"
            title="Go home"
            onClick={() => { try { window.location.assign("/"); } catch { } }}
            role="button"
            aria-label="DecentWatch home"
          >
            <div className="relative">
              <Network className={`w-7 h-7 transition-colors duration-200 ${isDark 
                ? "text-blue-400" 
                : "text-blue-600"
              }`} />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
            </div>
            <span className={`text-lg font-semibold transition-colors duration-200 ${isDark 
              ? 'text-white' 
              : 'text-slate-900'
            }`}>
              Owlwatch
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <div className={`hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm ${isDark 
              ? 'bg-slate-800/50 text-slate-300' 
              : 'bg-slate-100/80 text-slate-700'
            }`}>
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>{nodesOnline} Nodes Online</span>
            </div>

            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`p-2 rounded-lg transition-colors duration-200 ${isDark 
                ? 'text-slate-300 hover:bg-slate-800' 
                : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {connectedPublicKey ? (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 bg-red-600 text-white hover:bg-red-700"
                type="button"
                title={`Connected as ${connectedPublicKey.slice(0, 8)}...`}
              >
                <div className="flex items-center gap-2">
                  <PowerOff className="w-4 h-4" />
                  Disconnect
                </div>
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 bg-blue-600 text-white hover:bg-blue-700"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <Power className="w-4 h-4" />
                  Connect
                </div>
              </button>
            )}

            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton>
                  <button className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${isDark 
                    ? 'text-slate-300 hover:bg-slate-800' 
                    : 'text-slate-700 hover:bg-slate-100'
                  }`}>
                    Sign In
                  </button>
                </SignInButton>

                <SignUpButton>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-200">
                    Sign Up
                  </button>
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

// ---------- Clean Validator Page ----------
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

  // state & refs
  const [publicKey, setPublicKey] = useState<string>(() => { try { return localStorage.getItem("validatorPublicKey") ?? ""; } catch { return ""; } });
  const [monitoring, setMonitoring] = useState(false);
  const [tokenInput, setTokenInput] = useState<string>(() => { try { return localStorage.getItem("validator_bearer_token") ?? ""; } catch { return ""; } });
  const [showKey, setShowKey] = useState(false);

  // registration modal and state
  const [showNotRegisteredModal, setShowNotRegisteredModal] = useState(false);
  const [isValidatorRegistered, setIsValidatorRegistered] = useState<boolean | null>(null);
  const [checkingRegistration, setCheckingRegistration] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(1000);

  const userRequestedDisconnectRef = useRef<boolean>(false);

  const [livePoints, setLivePoints] = useState<Point[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<number | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => { try { return localStorage.getItem("validatorSessionToken"); } catch { return null; } });

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const [validatorsCount, setValidatorsCount] = useState<number | null>(null);
  const validatorsPollRef = useRef<number | null>(null);
  const validatorsBackoffRef = useRef<number>(1);

  function saveBearerToken(v: string | null) {
    try {
      if (v) { localStorage.setItem("validator_bearer_token", v); setTokenInput(v); toast.success("Token saved successfully"); }
      else { localStorage.removeItem("validator_bearer_token"); setTokenInput(""); toast.success("Token cleared successfully"); }
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

  async function fetchValidatorsCount(): Promise<boolean> {
    try {
      const res = await fetchWithPrefixes("/get-all-validator", { method: "GET", credentials: "include" });
      if (!res.ok) {
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
      if (typeof body.count === "number") {
        setValidatorsCount(body.count);
        return true;
      }
      setValidatorsCount(0);
      return true;
    } catch (err) {
      console.debug("[Validator] fetchValidatorsCount error", err);
      return false;
    }
  }

  useEffect(() => {
    let mounted = true;
    async function tick() {
      if (!mounted) return;
      const ok = await fetchValidatorsCount();
      if (!mounted) return;
      if (ok) {
        validatorsBackoffRef.current = 1;
        validatorsPollRef.current = window.setTimeout(tick, VALIDATOR_POLL_MS);
      } else {
        validatorsBackoffRef.current = Math.min(8, validatorsBackoffRef.current * 2 || 2);
        const delay = Math.min(VALIDATOR_POLL_MS * validatorsBackoffRef.current, 60_000);
        validatorsPollRef.current = window.setTimeout(tick, delay);
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        if (validatorsPollRef.current) { window.clearTimeout(validatorsPollRef.current); validatorsPollRef.current = null; }
      } else {
        void tick();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    void tick();

    function onStorage(e: StorageEvent) {
      if (e.key === "validatorPublicKey" || e.key === "validatorSessionToken") {
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

  async function checkIsRegisteredValidator(pk: string): Promise<boolean> {
    if (!pk) return false;
    try {
      const trySpecific = await fetchWithPrefixes(`/validator?publicKey=${encodeURIComponent(pk)}`, { method: "GET", credentials: "include" });
      if (trySpecific.ok && trySpecific.json) {
        const body = trySpecific.json;
        if (typeof body.publicKey === "string" && body.publicKey === pk) return true;
        if (body.validator && typeof body.validator.publicKey === "string" && body.validator.publicKey === pk) return true;
        if (Array.isArray(body) && body.some((v: any) => v?.publicKey === pk)) return true;
        if (body.ok && Array.isArray(body.validators) && body.validators.some((v: any) => v?.publicKey === pk)) return true;
      }
    } catch (err) {
      console.debug("[Validator] specific lookup failed:", err);
    }

    try {
      const all = await fetchWithPrefixes("/get-all-validator", { method: "GET", credentials: "include" });
      if (all.ok && all.json) {
        const body = all.json;
        if (Array.isArray(body)) {
          return body.some((v: any) => v?.publicKey === pk || v?.validator?.publicKey === pk);
        }
        if (Array.isArray(body.validators)) {
          return body.validators.some((v: any) => v?.publicKey === pk || v?.validator?.publicKey === pk);
        }
      }
    } catch (err) {
      console.debug("[Validator] fallback get-all-validator failed:", err);
    }

    return false;
  }

  useEffect(() => {
    let mounted = true;
    if (!publicKey) {
      setIsValidatorRegistered(null);
      setShowNotRegisteredModal(false);
      setCheckingRegistration(false);
      return;
    }

    (async () => {
      try {
        setCheckingRegistration(true);
        const registered = await checkIsRegisteredValidator(publicKey);
        if (!mounted) return;
        setIsValidatorRegistered(registered);
        if (!registered) {
          setShowNotRegisteredModal(true);
        } else {
          setShowNotRegisteredModal(false);
        }
      } catch (err) {
        console.debug("[Validator] registration check error:", err);
        if (mounted) {
          setIsValidatorRegistered(false);
          setShowNotRegisteredModal(true);
        }
      } finally {
        if (mounted) setCheckingRegistration(false);
      }
    })();

    return () => { mounted = false; };
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) return;
    let mounted = true;

    let batchedPoints: Point[] | null = null;
    let flushTimer: number | null = null;
    const FLUSH_MS = 250;

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        const toFlush = batchedPoints ? batchedPoints.slice() : null;
        batchedPoints = null;
        if (!toFlush || toFlush.length === 0) return;
        setLivePoints((prev) => {
          const map = new Map<string, number>();
          prev.forEach(p => map.set(p.time, p.value));
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

    function isVisible() { try { return !document.hidden; } catch { return true; } }

    let pollTimer: number | null = null;
    let backoffMultiplier = 1;
    const BASE_POLL_MS = EARNINGS_POLL_MS;
    const MAX_POLL_MS = 30_000;

    async function pollOnce() {
      if (!mounted) return;
      if (!isVisible()) {
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

    fetchEarningsNow();

    const wsCheckInterval = window.setInterval(() => {
      try {
        const ws = wsRef.current;
        const isWsOpen = !!(ws && ws.readyState === WebSocket.OPEN);
        if (isWsOpen) {
          stopFallbackPolling();
        } else {
          if (isVisible()) startFallbackPolling();
        }
      } catch (err) {
        startFallbackPolling();
      }
    }, 1000);

    function onVisibilityChange() {
      if (!isVisible()) {
        stopFallbackPolling();
      } else {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) startFallbackPolling();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      try { if (wsCheckInterval) window.clearInterval(wsCheckInterval); } catch {}
      stopFallbackPolling();
      if (flushTimer) { window.clearTimeout(flushTimer); flushTimer = null; }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [publicKey, tokenInput, sessionToken, getToken]);

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

  async function ensureSessionTokenOnce(): Promise<string | null> {
    try {
      const existing = (() => { try { return localStorage.getItem("validatorSessionToken"); } catch { return null; } })();
      if (existing) {
        setSessionToken(existing);
        return existing;
      }

      if ((window as any).solana && (window as any).solana.isPhantom && (window as any).solana.signMessage) {
        try {
          const msg = `Validator session token for ${publicKey || "unknown"} at ${Date.now()}`;
          const msgBytes = new TextEncoder().encode(msg);
          const signed = await (window as any).solana.signMessage(msgBytes, "utf8").catch(() => null);
          const sig = (signed as any)?.signature ?? signed;
          if (sig) {
            const token = JSON.stringify(Array.from(sig));
            try { localStorage.setItem("validatorSessionToken", token); } catch {}
            setSessionToken(token);
            toast.success("Validator session created successfully");
            return token;
          }
        } catch (err) {
          console.debug("[Validator] one-time sign for session token failed:", err);
        }
      }

      try {
        const arr = new Uint8Array(16);
        if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) (crypto as any).getRandomValues(arr);
        let hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
        const token = `rnd:${hex}`;
        try { localStorage.setItem("validatorSessionToken", token); } catch {}
        setSessionToken(token);
        toast("Validator session created", { icon: "" });
        return token;
      } catch (err) {
        console.debug("[Validator] fallback random token creation failed:", err);
        return null;
      }
    } catch (err) {
      console.debug("[Validator] ensureSessionTokenOnce error:", err);
      return null;
    }
  }

  // compute initial tabId outside useRef to avoid syntax pitfalls
  const initialTabId = (() => {
    try {
      const stored = localStorage.getItem("validatorTabId");
      if (stored) return stored;
      const anyCrypto = (window as any).crypto ?? (globalThis as any).crypto;
      const generated = anyCrypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      try { localStorage.setItem("validatorTabId", generated); } catch {}
      return generated;
    } catch {
      const fallback = `tab-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      try { localStorage.setItem("validatorTabId", fallback); } catch {}
      return fallback;
    }
  })();

  const tabIdRef = useRef<string>(initialTabId);

  const subscriptionRejectedRef = useRef<boolean>(false);
  const duplicateNotifyMapRef = useRef<Map<string, number>>(new Map());
  const DUPLICATE_NOTIFY_TTL_MS = 30_000;

  /* ADDED: prevent duplicate/rapid connects */
  const connectingRef = useRef<boolean>(false);
  const lastOpenAttemptRef = useRef<number | null>(null);

  function openWsAndRegister(pk: string) {
    if (!pk) { toast.error("No public key provided"); return; }

    // If already connected OR connection in progress, skip.
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (connectingRef.current) return;

    const now = Date.now();
    if (lastOpenAttemptRef.current && now - lastOpenAttemptRef.current < 1500) {
      // Avoid hammering reconnect attempts within a short window
      console.info("[Validator] skipping rapid reconnect attempt");
      return;
    }
    lastOpenAttemptRef.current = now;
    connectingRef.current = true;

    try { wsRef.current?.close(); } catch {}
    if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }

    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    let pingStartedLocal = false;
    let subscribedConfirmed = false;

    ws.onopen = async () => {
      connectingRef.current = false; /* ADDED */
      backoffRef.current = 1000;
      await ensureSessionTokenOnce().catch((e) => console.debug("[Validator] ensureSessionTokenOnce failed:", e));

      try {
        safeSend(ws, { type: "subscribe_earnings", data: { publicKey: pk, sessionToken: sessionToken ?? localStorage.getItem("validatorSessionToken"), tabId: tabIdRef.current } });
      } catch (err) {
        console.debug("[Validator] subscribe_earnings error", err);
      }
    };

    ws.onmessage = async (ev) => {
      let payload: any = null;
      try { payload = JSON.parse(ev.data); } catch (err) { console.debug("[Validator] ws JSON parse failed", err, ev.data); return; }

      try {
        if (payload.type === "subscribed") {
          const body = payload.data ?? {};
          if (body.ok) {
            subscribedConfirmed = true;
            subscriptionRejectedRef.current = false;
            userRequestedDisconnectRef.current = false;
            setMonitoring(true);
            try { localStorage.setItem("validatorMonitoring", "true"); } catch {}
            if (!pingStartedLocal) {
              pingTimerRef.current = window.setInterval(() => {
                try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", data: { ts: Date.now() } })); } catch {}
              }, WS_PING_INTERVAL_MS);
              pingStartedLocal = true;
            }
            toast.success("Connected to Validation Hub");
            void fetchValidatorsCount();
            return;
          } else {
            subscriptionRejectedRef.current = true;
            const reason = body.error ?? body.message ?? "Subscription rejected by Hub";
            if (reason === "duplicate_connection") {
              toast.error("Duplicate connection detected");
            } else {
              toast.error("Subscribe failed: " + String(reason));
            }
            userRequestedDisconnectRef.current = true;
            try { ws.close(); } catch {}
            return;
          }
        }

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

        if (payload.type === "duplicate_detected") {
          const incomingTabId = payload.data?.incomingTabId ?? "unknown";
          const now = Date.now();
          const map = duplicateNotifyMapRef.current;
          const expiry = map.get(incomingTabId) ?? 0;
          if (expiry > now) return;
          map.set(incomingTabId, now + DUPLICATE_NOTIFY_TTL_MS);
          for (const [k, v] of map.entries()) { if (v < now) map.delete(k); }
          const msg = payload.data?.message ?? "Another connection for this wallet detected";
          toast.error(msg);
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
          const currentSessionToken = sessionToken ?? (() => { try { return localStorage.getItem("validatorSessionToken"); } catch { return null; } })();
          const reply: any = { type: "validate", data: { validatorId: localStorage.getItem("validatorId"), callbackId, websiteId, status: ok ? "Good" : "Bad", latency: effectiveLatency, sessionToken: currentSessionToken } };

          try { const okSent = safeSend(ws, reply); console.debug("[Validator] sent validate reply", { okSent, reply }); } catch (err) { console.error("[Validator] failed to send validate reply", err, reply); }
          return;
        }

        console.debug("[Validator] unhandled ws payload type:", payload.type);
      } catch (err) { console.error("[Validator] onmessage handler error:", err); }
    };

    ws.onclose = () => {
      connectingRef.current = false; /* ADDED */
      wsRef.current = null;
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      setMonitoring(false);
      try { localStorage.setItem("validatorMonitoring", "false"); } catch {}

      if (subscriptionRejectedRef.current) {
        console.info("[Validator] subscription was rejected by server — not auto-reconnecting until user restarts");
        return;
      }

      if (userRequestedDisconnectRef.current) {
        console.info("[Validator] user requested disconnect - not auto-reconnecting");
        return;
      }

      toast.error("Disconnected from Hub - reconnecting...");
      const d = backoffRef.current || 1000;
      reconnectTimerRef.current = window.setTimeout(() => {
        const pk2 = publicKey || localStorage.getItem("validatorPublicKey") || "";
        if (pk2) openWsAndRegister(pk2);
        backoffRef.current = Math.min(60_000, Math.floor((backoffRef.current || 1000) * 1.6));
      }, d);

      void fetchValidatorsCount();
    };

    ws.onerror = (e) => { console.error("[Validator] WS error event:", e); };
  }

  async function stopMonitoring(offlineEndpoint?: string, reasonMsg?: string): Promise<void> {
    try {
      userRequestedDisconnectRef.current = true;
      subscriptionRejectedRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      setMonitoring(false);
      backoffRef.current = 1000;

      /* ADDED: persist monitoring=false so auto-restore won't attempt to reconnect */
      try { localStorage.setItem("validatorMonitoring", "false"); } catch {}

      if (reasonMsg) toast.info(reasonMsg);
      else toast.success("Monitoring stopped successfully");

      // mark backend offline (best-effort)
      const pk = publicKey || localStorage.getItem("validatorPublicKey") || "";
      if (!pk) return;

      const makeSafeTokenGetter = () => {
        if (!getToken) return null;
        return async (): Promise<string> => {
          const t = await getToken();
          if (!t) throw new Error("no token available");
          return t;
        };
      };
      const safeTokenGetter = makeSafeTokenGetter();

      const defaultOfflineUrl =
        `${API_BASE_RAW}/api/v1/change-to-offline?publicKey=${encodeURIComponent(pk)}&online=false`;
      const urlToCall = offlineEndpoint ?? defaultOfflineUrl;

      try {
        let axiosConfig = {};
        if (safeTokenGetter) {
          try {
            const token = await safeGetToken(safeTokenGetter);
            if (token) {
              axiosConfig = { headers: { Authorization: `Bearer ${token}` } };
            }
          } catch (err) {
            console.warn("safeGetToken failed while stopping monitoring:", err);
          }
        }

        await axios.post(urlToCall, {}, axiosConfig);
        toast.success("Marked validator offline");
      } catch (err: any) {
        console.error("Failed to mark validator offline:", err);
        toast.error("Failed to mark validator offline: " + (err?.message ?? String(err)));
      }
    } catch (err) {
      console.error("stopMonitoring error:", err);
    }
  }

  async function safeGetToken(getToken?: () => Promise<string>) {
    try {
      if (!getToken) return null;
      return await getToken();
    } catch {
      return null;
    }
  }

    async function startMonitoring() {
    const pk = publicKey || localStorage.getItem("validatorPublicKey") || "";

    // If no public key is present, require the user to connect first.
    if (!pk) {
      toast.error("Please connect your wallet first (use the Connect button in the navbar) to start monitoring.");
      return;
    }

    // Create a typed wrapper so safeGetToken receives () => Promise<string>
    const makeSafeTokenGetter = () => {
      if (!getToken) return null;
      return async (): Promise<string> => {
        const t = await getToken(); // getToken has type GetToken -> Promise<string | null>
        if (!t) throw new Error("no token available");
        return t;
      };
    };

    const safeTokenGetter = makeSafeTokenGetter();

    // helper to mark validator online in DB
    const markOnline = async (validatorPk: string) => {
      try {
        // attempt to get Authorization header using safeGetToken if available
        let axiosConfig = {};
        if (safeTokenGetter) {
          try {
            const token = await safeGetToken(safeTokenGetter); // now has correct type
            if (token) {
              axiosConfig = { headers: { Authorization: `Bearer ${token}` } };
            }
          } catch (err) {
            // safeGetToken may throw if token can't be refreshed; continue without auth
            console.warn("safeGetToken failed, proceeding without auth:", err);
          }
        }

        await axios.post(
          `${API_BASE_RAW}/api/v1/change-to-online?publicKey=${encodeURIComponent(validatorPk)}`,
          {},
          axiosConfig
        );
        toast.success("Marked validator online");
      } catch (err: any) {
        console.error("Failed to mark validator online:", err);
        toast.error("Failed to mark validator online: " + (err?.message ?? String(err)));
      }
    };

    // we already have a pk (guaranteed by above)
    userRequestedDisconnectRef.current = false;
    subscriptionRejectedRef.current = false;

    /* persist monitoring=true immediately when starting */
    try { localStorage.setItem("validatorMonitoring", "true"); } catch {}

    await markOnline(pk);
    openWsAndRegister(pk);
  }

  // auto-restore monitoring after refresh if user had monitoring set
  useEffect(() => {
    (async () => {
      try {
        const shouldMonitor = (() => {
          try {
            return JSON.parse(localStorage.getItem("validatorMonitoring") ?? "false") === true;
          } catch {
            return false;
          }
        })();
        const storedPk = (() => {
          try {
            return localStorage.getItem("validatorPublicKey") ?? "";
          } catch {
            return "";
          }
        })();

        if (shouldMonitor && storedPk) {
          const isWsOpen = !!(wsRef.current && wsRef.current.readyState === WebSocket.OPEN);
          /* ADDED: don't try to start if connecting is already in progress */
          if (!isWsOpen && !connectingRef.current) {
            userRequestedDisconnectRef.current = false;
            subscriptionRejectedRef.current = false;
            await startMonitoring();
          }
        }
      } catch (e) {
        console.warn("validator restore failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // prevent immediate reconnect races during a reload/unload
  useEffect(() => {
    const onBeforeUnload = () => {
      userRequestedDisconnectRef.current = true;
      // allow small grace period for the unload event to finish before clearing
      setTimeout(() => { userRequestedDisconnectRef.current = false; }, 1000);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function checkLocalPublicKeyAndReact(trigger?: string) {
    try {
      const stored = localStorage.getItem("validatorPublicKey") ?? "";
      if (!stored && monitoring) {
        setPublicKey("");
        stopMonitoring("Wallet disconnected elsewhere");
        return;
      }
      if (stored && monitoring && stored !== publicKey) {
        setPublicKey(stored);
        stopMonitoring("Validator key changed elsewhere");
        return;
      }
      if (stored && !monitoring && stored !== publicKey) {
        setPublicKey(stored);
      }
      if (!stored && !monitoring && publicKey) {
        setPublicKey("");
      }
    } catch (err) {
      console.debug("[Validator] checkLocalPublicKeyAndReact error:", err);
    }
  }

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "validatorPublicKey") {
        checkLocalPublicKeyAndReact("storage");
      }
    }
    function onFocus() { checkLocalPublicKeyAndReact("focus"); }
    function onVisibility() { if (!document.hidden) checkLocalPublicKeyAndReact("visibility"); }

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    checkLocalPublicKeyAndReact("mount");

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [monitoring, publicKey]);

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
        toast.success("Withdraw completed successfully");
        setPendingPayouts(0);
        void fetchValidatorsCount();
      }
    } catch (err) { console.error("[Withdraw] error", err); toast.error("Withdraw error: " + String(err)); }
    finally { setWithdrawLoading(false); setWithdrawOpen(false); }
  }

  async function handleReconnectCorrectWallet() {
    try {
      try { localStorage.removeItem("validatorPublicKey"); } catch {}
      setPublicKey("");
      try { if ((window as any).solana?.disconnect) await (window as any).solana.disconnect(); } catch (err) { console.debug("Phantom disconnect failed:", err); }

      if ((window as any).solana && (window as any).solana.isPhantom) {
        try {
          const resp = await (window as any).solana.connect();
          const gotPk = resp?.publicKey?.toString?.() ?? "";
          if (!gotPk) {
            toast.error("Phantom connect returned no public key");
            return;
          }
          try { localStorage.setItem("validatorPublicKey", gotPk); } catch {}
          setPublicKey(gotPk);
          setShowNotRegisteredModal(false);
          toast.success("Connected new wallet successfully");
          return;
        } catch (err) {
          console.debug("Phantom reconnect failed:", err);
          toast.error("Phantom connect failed or was cancelled");
          return;
        }
      }

      const manual = prompt("Paste the correct validator Solana public key to connect:");
      if (manual && manual.trim()) {
        const pk = manual.trim();
        try { localStorage.setItem("validatorPublicKey", pk); } catch {}
        setPublicKey(pk);
        setShowNotRegisteredModal(false);
        toast.success("Public key set successfully");
      } else {
        toast("Connect cancelled");
      }
    } catch (err) {
      console.error("handleReconnectCorrectWallet:", err);
      toast.error("Failed to reconnect correct wallet");
    }
  }

  function handleBecomeValidator() {
    try {
      if (publicKey) {
        try { localStorage.setItem("validatorPublicKey", publicKey); } catch {}
      }
      window.location.assign("/become-validator");
    } catch (err) {
      console.error("handleBecomeValidator:", err);
      toast.error("Could not start onboarding");
    }
  }

  const totalFromPoints = (pts: Point[]) => pts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const formatMoney = (n: number) => (isNaN(n) ? "-" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(n)} SOL`);

  useEffect(() => {
    return () => {
      try { wsRef.current?.close(); } catch {}
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (reconnectTimerRef.current) { window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    };
  }, []);

  return (
    <>
      <Navbar
        isDark={isDarkMode}
        toggleTheme={() => setIsDarkMode((s) => !s)}
        nodesOnline={validatorsCount ?? 0}
        onGetStarted={() => window.location.assign("/get-started")}
        connectedPublicKey={publicKey || null}
        onValidatorDisconnect={async () => {
          try { localStorage.removeItem("validatorPublicKey"); } catch {}
          setPublicKey("");
          const pk = publicKey || localStorage.getItem("validatorPublicKey") || "";
          const offlineUrl = `${API_BASE_RAW}/api/v1/change-to-offline?publicKey=${encodeURIComponent(pk)}&online=false`;
          await stopMonitoring(offlineUrl, "Wallet disconnected from Navbar");
        }}
        onValidatorConnect={(pk) => {
          setPublicKey(pk);
          try { localStorage.setItem("validatorPublicKey", pk); } catch {}
          toast.success("Wallet connected - click Start Monitoring");
        }}
      />

      <div className={`min-h-screen transition-colors duration-300 pt-16 ${isDarkMode 
        ? 'bg-slate-950' 
        : 'bg-gray-50'
      }`}>
        {/* Clean background with subtle dots like home page */}
        <div 
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: isDarkMode 
              ? 'radial-gradient(rgba(59, 130, 246, 0.4) 1px, transparent 1px)'
              : 'radial-gradient(rgba(100, 116, 139, 0.2) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}
        />

        <Toaster position="top-right" toastOptions={{
          style: {
            background: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            color: isDarkMode ? '#e2e8f0' : '#1e293b',
            border: isDarkMode ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid rgba(226, 232, 240, 0.3)',
            backdropFilter: 'blur(10px)',
            borderRadius: '8px'
          }
        }} />

        <div className="max-w-6xl mx-auto py-8 px-6">
          {/* Main validator card with clean styling */}
          <div className={`rounded-lg shadow-xl transition-colors duration-300 ${isDarkMode 
            ? 'bg-slate-900/90 border border-slate-800' 
            : 'bg-white/90 border border-slate-200'
          } backdrop-blur-sm`}>
            <div className="p-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${isDarkMode 
                    ? 'bg-blue-500/10' 
                    : 'bg-blue-50'
                  }`}>
                    <Globe className={`w-8 h-8 ${isDarkMode 
                      ? 'text-blue-400' 
                      : 'text-blue-600'
                    }`} />
                  </div>
                  <div>
                    <h1 className={`text-3xl font-bold mb-1 ${isDarkMode 
                      ? 'text-white' 
                      : 'text-slate-900'
                    }`}>
                      Validator Control Center
                    </h1>
                    <p className={`text-lg ${isDarkMode 
                      ? 'text-slate-400' 
                      : 'text-slate-600'
                    }`}>
                      Real-time Network Monitoring & Earnings Dashboard
                    </p>
                  </div>
                </div>
                
                {/* Status indicator */}
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  monitoring 
                    ? isDarkMode 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                      : 'bg-green-50 text-green-700 border border-green-200'
                    : isDarkMode
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}>
                  {monitoring ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                  {monitoring ? 'LIVE' : 'OFFLINE'}
                </div>
              </div>

              {/* Public key input */}
              <div className="mb-8">
                <label className={`block text-sm font-medium mb-3 ${isDarkMode 
                  ? 'text-slate-300' 
                  : 'text-slate-700'
                }`}>
                  Validator Public Key
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input 
                      value={showKey ? publicKey : publicKey ? '•'.repeat(Math.min(publicKey.length, 40)) + (publicKey.length > 40 ? '...' : '') : ''}
                      onChange={(e) => setPublicKey(e.target.value)} 
                      placeholder="Enter your Solana validator public key" 
                      className={`w-full px-4 py-3 rounded-lg text-sm font-mono transition-colors duration-200 ${isDarkMode 
                        ? 'bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:border-blue-500' 
                        : 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors duration-200 ${isDarkMode 
                        ? 'text-slate-400 hover:text-slate-200' 
                        : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {monitoring ? (
                    <button 
                      onClick={() => stopMonitoring()} 
                      className="px-6 py-3 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-colors duration-200"
                    >
                      <div className="flex items-center gap-2">
                        <PowerOff className="w-4 h-4" />
                        Stop
                      </div>
                    </button>
                  ) : (
                    <button 
                      onClick={startMonitoring} 
                      className="px-6 py-3 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Start
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Total Earnings */}
                <div className={`p-6 rounded-lg transition-colors duration-300 ${isDarkMode 
                  ? 'bg-slate-800/50 border border-slate-700' 
                  : 'bg-slate-50 border border-slate-200'
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 rounded ${isDarkMode 
                      ? 'bg-blue-500/10' 
                      : 'bg-blue-50'
                    }`}>
                      <TrendingUp className={`w-5 h-5 ${isDarkMode 
                        ? 'text-blue-400' 
                        : 'text-blue-600'
                      }`} />
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${isDarkMode 
                      ? 'bg-slate-700 text-slate-300' 
                      : 'bg-white text-slate-600'
                    }`}>
                      Total Earned
                    </span>
                  </div>
                  <div className={`text-2xl font-bold mb-1 ${isDarkMode 
                    ? 'text-white' 
                    : 'text-slate-900'
                  }`}>
                    {formatMoney(totalFromPoints(livePoints))}
                  </div>
                  <div className={`text-sm ${isDarkMode 
                    ? 'text-slate-400' 
                    : 'text-slate-500'
                  }`}>
                    Historical + Live Data
                  </div>
                </div>

                {/* Pending Payouts */}
                <div className={`p-6 rounded-lg transition-colors duration-300 ${isDarkMode 
                  ? 'bg-slate-800/50 border border-slate-700' 
                  : 'bg-slate-50 border border-slate-200'
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 rounded ${isDarkMode 
                      ? 'bg-green-500/10' 
                      : 'bg-green-50'
                    }`}>
                      <DollarSign className={`w-5 h-5 ${isDarkMode 
                        ? 'text-green-400' 
                        : 'text-green-600'
                      }`} />
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${isDarkMode 
                      ? 'bg-slate-700 text-slate-300' 
                      : 'bg-white text-slate-600'
                    }`}>
                      Available
                    </span>
                  </div>
                  <div className={`text-2xl font-bold mb-3 ${isDarkMode 
                    ? 'text-white' 
                    : 'text-slate-900'
                  }`}>
                    {pendingPayouts === null ? "-" : formatMoney(pendingPayouts)}
                  </div>
                  <button 
                    onClick={async () => { await fetchEarningsOnce(); setWithdrawOpen(true); }} 
                    className="w-full px-4 py-2 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 transition-colors duration-200"
                  >
                    Withdraw
                  </button>
                </div>
              </div>

              {/* Chart section */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className={`text-xl font-semibold ${isDarkMode 
                    ? 'text-white' 
                    : 'text-slate-900'
                  }`}>
                    Live Earnings Stream
                  </h3>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${isDarkMode 
                    ? 'bg-slate-800 text-slate-300' 
                    : 'bg-slate-100 text-slate-700'
                  }`}>
                    <Activity className="w-3 h-3" />
                    Real-time
                  </div>
                </div>
                
                <div className={`rounded-lg p-6 transition-colors duration-300 ${isDarkMode 
                  ? 'bg-slate-800/30 border border-slate-700' 
                  : 'bg-white border border-slate-200'
                }`}>
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={livePoints} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <defs>
                        <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isDarkMode ? "#3b82f6" : "#2563eb"} stopOpacity={0.3}/>
                          <stop offset="100%" stopColor={isDarkMode ? "#3b82f6" : "#2563eb"} stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="time" 
                        tickFormatter={(t) => String(t).slice(11, 19)} 
                        minTickGap={30}
                        tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#64748b' }}
                        axisLine={{ stroke: isDarkMode ? '#475569' : '#cbd5e1' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#64748b' }}
                        axisLine={{ stroke: isDarkMode ? '#475569' : '#cbd5e1' }}
                      />
                      <Tooltip 
                        formatter={(value: any) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`, 'Earnings']}
                        contentStyle={{
                          backgroundColor: isDarkMode ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
                          border: isDarkMode ? '1px solid rgba(71,85,105,0.3)' : '1px solid rgba(226,232,240,0.3)',
                          borderRadius: '8px',
                          color: isDarkMode ? '#e2e8f0' : '#1e293b',
                          fontSize: '13px'
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={isDarkMode ? "#3b82f6" : "#2563eb"} 
                        strokeWidth={2}
                        fill="url(#earningsGradient)"
                        dot={{ fill: isDarkMode ? "#3b82f6" : "#2563eb", strokeWidth: 2, r: 3 }}
                        activeDot={{ 
                          r: 5, 
                          stroke: isDarkMode ? "#3b82f6" : "#2563eb", 
                          strokeWidth: 2, 
                          fill: isDarkMode ? "#0f172a" : "#ffffff"
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Clean withdraw modal */}
        {withdrawOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className={`rounded-lg max-w-md w-full p-6 ${isDarkMode 
              ? 'bg-slate-900 text-white border border-slate-700' 
              : 'bg-white text-gray-900 border border-slate-200'
            } shadow-xl`}>
              <div className="text-center mb-6">
                <div className={`w-12 h-12 rounded-lg mx-auto mb-4 flex items-center justify-center ${isDarkMode 
                  ? 'bg-green-500/10' 
                  : 'bg-green-50'
                }`}>
                  <DollarSign className={`w-6 h-6 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <h3 className="text-xl font-semibold mb-2">Withdraw Earnings</h3>
              </div>
              
              <div className={`p-4 rounded-lg mb-6 text-center ${isDarkMode 
                ? 'bg-slate-800' 
                : 'bg-slate-50'
              }`}>
                <p className="text-sm mb-2">Available Balance</p>
                <div className="text-2xl font-bold">
                  {formatMoney(Number(pendingPayouts ?? 0))}
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setWithdrawOpen(false)} 
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${isDarkMode 
                    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleTakeEarnings} 
                  disabled={withdrawLoading || (pendingPayouts ?? 0) <= 0} 
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {withdrawLoading ? "Processing..." : "Withdraw"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clean registration modal */}
        {showNotRegisteredModal && publicKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className={`rounded-lg max-w-lg w-full p-8 ${isDarkMode 
              ? 'bg-slate-900 text-white border border-slate-700' 
              : 'bg-white text-gray-900 border border-slate-200'
            } shadow-xl`}>
              <div className="text-center mb-8">
                <div className={`w-16 h-16 rounded-lg mx-auto mb-4 flex items-center justify-center ${isDarkMode 
                  ? 'bg-amber-500/10' 
                  : 'bg-amber-50'
                }`}>
                  <Globe className={`w-8 h-8 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
                <h3 className="text-2xl font-semibold mb-4">Wallet Not Registered</h3>
              </div>
              
              <div className={`p-4 rounded-lg mb-6 ${isDarkMode 
                ? 'bg-slate-800' 
                : 'bg-slate-50'
              }`}>
                <p className="text-center mb-3">
                  This wallet is not registered as a validator in our network.
                </p>
                <div className={`text-center p-3 rounded font-mono text-sm break-all ${isDarkMode 
                  ? 'bg-slate-700 text-blue-300' 
                  : 'bg-white text-blue-600'
                }`}>
                  {publicKey.slice(0, 12)}...{publicKey.slice(-12)}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleReconnectCorrectWallet}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors duration-200 ${isDarkMode 
                    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700' 
                    : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Connect Registered Wallet
                </button>

                <button
                  onClick={handleBecomeValidator}
                  className="px-4 py-3 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
                >
                  Register as Validator
                </button>
              </div>

              <p className={`text-xs mt-4 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Connect a registered wallet or register this wallet as a validator.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
