// src/pages/Dashboard.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Network,
  Sun,
  Moon,
  Globe2,
  CloudLightning,
  Server,
  Sparkles,
  Play,
  Pause,
  BookOpen,
  FileText,
  Music,
  Volume2,
  VolumeX,
  TrendingUp,
  Shield,
  Zap,
  Users,
  Star,
  ArrowRight,
  Github,
  Twitter,
  Send,
} from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from "@clerk/clerk-react";

import toast, { Toaster } from "react-hot-toast";

import { useTheme } from "../hooks/ThemeContext";
import { ParticleBackground } from "../components/ParticleBackground";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { MouseGlow } from "../components/MouseGlow";
import { FloatingElements } from "../components/FloatingElements";
import { WaveAnimation } from "../components/WaveAnimation";

import { useWebsites } from "../hooks/useWebsites";
import { useValidator } from "../context/validator";
import { useUI } from "../context/ui";
import axios from "axios";
//import MusicComponent from "../components/MusicComponent";

const BACKEND = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

/** ---- Types ---- */
interface StatsData {
  totalSites: number;
  averageUptime: number;
  totalIncidents: number;
  averageResponseTime: number;
  activeUsers: number;
  nodesOnline: number;
}

/** Utility: parse count out of common API shapes. */
function parseCountFromJson(j: any): number | null {
  if (j == null) return null;
  if (Array.isArray(j)) return j.length;
  if (typeof j === "object") {
    if (Array.isArray(j.websites)) return j.websites.length;
    if (Array.isArray(j.validators)) return j.validators.length;
    if (typeof j.count === "number") return j.count;
    const maybeArray = Object.values(j).find((v) => Array.isArray(v));
    if (Array.isArray(maybeArray)) return maybeArray.length;
  }
  return null;
}

/* ---------------- Navbar (professional) ---------------- */
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
}) {
  const [visible, setVisible] = useState(true);
  const [phantomConnecting, setPhantomConnecting] = useState(false);
  const ticking = useRef(false);
  const prevY = useRef(0);

  // safe guarded hooks: still called in same order on every render
  const validatorCtx = (() => {
    try {
      return useValidator();
    } catch {
      return undefined as any;
    }
  })();

  const uiCtx = (() => {
    try {
      return useUI();
    } catch {
      return undefined as any;
    }
  })();

  const notify = uiCtx?.notify ?? {
    success: (m: string) => toast.success(m),
    error: (m: string) => toast.error(m),
    info: (m: string) => toast(m),
  };

  const checkValidatorByPublicKey = validatorCtx?.checkValidatorByPublicKey;
  const setValidatorInContext: ((v: any) => void) | undefined =
    (validatorCtx as any)?.setValidator ?? (validatorCtx as any)?.setLocalValidator;

  const validator = validatorCtx?.validator ?? null;

  const [isValidatorLocal, setIsValidatorLocal] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem("validatorPublicKey");
    } catch {
      return false;
    }
  });

  // ----------------- NEW: real-time localStorage sync -----------------
  // Keeps isValidatorLocal and validator context up-to-date when other tabs/pages
  // add/remove "validatorPublicKey". Also hydrates context when a key is added.
  useEffect(() => {
    let mounted = true;

    async function syncFromStorage() {
      try {
        const stored = localStorage.getItem("validatorPublicKey");
        const has = !!stored;

        // update local flag
        if (mounted) setIsValidatorLocal(has);

        if (!has) {
          // key removed -> clear validator context immediately
          try {
            if (typeof setValidatorInContext === "function") setValidatorInContext(null);
          } catch (err) {
            console.debug("setValidatorInContext(null) failed:", err);
          }
          return;
        }

        // key present -> try to hydrate context (non-blocking)
        // if (stored && typeof checkValidatorByPublicKey === "function") {
        //   try {
        //     const rec = await checkValidatorByPublicKey(stored);
        //     if (rec && typeof setValidatorInContext === "function") {
        //       try {
        //         setValidatorInContext(rec);
        //       } catch (err) {
        //         console.debug("setValidatorInContext(rec) failed:", err);
        //       }
        //     }
        //   } catch (err) {
        //     // ignore; just UX improvement
        //     console.debug("checkValidatorByPublicKey failed during storage-sync:", err);
        //   }
        // }
      } catch (err) {
        console.debug("syncFromStorage error:", err);
      }
    }

    // initial sync
    void syncFromStorage();

    function onStorage(e: StorageEvent) {
      if (e.key === "validatorPublicKey") {
        void syncFromStorage();
      }
    }
    function onFocus() {
      // some pages change localStorage without firing storage event in same tab,
      // so re-check on focus to ensure we pick up changes.
      void syncFromStorage();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkValidatorByPublicKey, setValidatorInContext]);
  // ----------------- end real-time localStorage sync -----------------

  // show/hide on scroll
  useEffect(() => {
    prevY.current = typeof window !== "undefined" ? window.scrollY : 0;
    const handleScroll = () => {
      const y = window.scrollY;
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const scrollingDown = y > prevY.current && y > 10;
          const scrollingUp = y < prevY.current;
          if (scrollingDown) setVisible(false);
          else if (scrollingUp) setVisible(true);
          else if (y <= 10) setVisible(true);
          prevY.current = y;
          ticking.current = false;
        });
        ticking.current = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // validators count pill
  const [validatorsCount, setValidatorsCount] = useState<number | null>(null);
  const auth = (() => {
    try {
      return useAuth();
    } catch {
      return undefined as any;
    }
  })();
  const getToken = auth?.getToken;
  useEffect(() => {
    let mounted = true;
    let id: number | null = null;
    let controller: AbortController | null = null;

    const fetchCount = async () => {
      try {
        controller?.abort();
        controller = new AbortController();

        let token: string | null = null;
        try {
          if (typeof getToken === "function") token = await getToken();
        } catch {}
        const headers: Record<string, string> = { Accept: "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const r = await fetch(`${BACKEND}/api/v1/get-all-validator`, {
          credentials: "include",
          headers,
          signal: controller.signal,
        });
        if (!r.ok) {
          if (mounted) setValidatorsCount(null);
          return;
        }
        const j = await r.json().catch(() => null);
        const c = parseCountFromJson(j);
        if (mounted) setValidatorsCount(c);
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.debug("fetch validators pill failed:", err);
        }
        if (mounted) setValidatorsCount(null);
      }
    };

    void fetchCount();
    id = window.setInterval(() => void fetchCount(), 30_000);
    return () => {
      mounted = false;
      if (id) window.clearInterval(id);
      try {
        controller?.abort();
      } catch {}
    };
  }, [getToken]);

  const displayNodes = validatorsCount ?? nodesOnline;

  // Phantom connect basic flow
  // async function handleConnectPhantomAndCheck() {
  //   if (phantomConnecting) return;
  //   setPhantomConnecting(true);
  //   try {
  //     if (!("solana" in window) || !window.solana?.isPhantom) {
  //       notify.error("Phantom wallet not found. Install Phantom or use onboarding.");
  //       return;
  //     }
  //     const resp = await window.solana!.connect?.();
  //     const pk = resp?.publicKey?.toString?.() ?? "";
  //     if (!pk) {
  //       notify.error("Failed to retrieve public key from Phantom.");
  //       return;
  //     }
  //     try {
  //       localStorage.setItem("validatorPublicKey", pk);
  //     } catch {}
  //     let record = null;
  //     if (typeof checkValidatorByPublicKey === "function") {
  //       try {
  //         record = await checkValidatorByPublicKey(pk);
  //       } catch {}
  //     }
  //     if (record) {
  //       if (typeof setValidatorInContext === "function") {
  //         try {
  //           setValidatorInContext(record);
  //         } catch {}
  //       }
  //       setIsValidatorLocal(true);
  //       notify.success("Validator found — redirecting to validator dashboard");
  //       window.location.assign("/validator");
  //     } else {
  //       // if no record we still consider the wallet connected locally
  //       setIsValidatorLocal(true);
  //       notify.success("No validator record — redirecting to onboarding");
  //       window.location.assign("/become-validator");
  //     }
  //   } catch (err) {
  //     console.error("Phantom connect/check error:", err);
  //     notify.error("Error connecting Phantom (see console).");
  //   } finally {
  //     setPhantomConnecting(false);
  //   }
  // }

  const handleDisconnect = async () => {
    try {
      try {
        localStorage.removeItem("validatorPublicKey");
      } catch {}
      try {
        if (window.solana && typeof window.solana.disconnect === "function") await window.solana.disconnect();
      } catch {}
      if (typeof setValidatorInContext === "function") {
        try {
          setValidatorInContext(null);
        } catch {}
      }
      setIsValidatorLocal(false);
      toast.success("Disconnected (local state cleared).");
    } catch (err) {
      console.error("Disconnect error", err);
      toast.error("Failed to disconnect.");
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out transform ${
        visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-4 pointer-events-none"
      } ${visible ? (isDark ? "bg-slate-900/90 border-b border-slate-700/50 backdrop-blur-xl shadow-2xl" : "bg-white/90 border-b border-gray-200/70 backdrop-blur-xl shadow-lg") : "bg-transparent"}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center space-x-4 cursor-pointer group" onClick={() => window.location.assign("/")} title="DecentWatch home">
            <div className="relative">
              <Network className={`w-10 h-10 ${isDark ? "text-blue-400" : "text-blue-600"} transition-all duration-300 group-hover:scale-110 group-hover:rotate-12`} />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-lg" />
            </div>
            <div>
              <span className={`text-2xl font-bold bg-gradient-to-r ${isDark ? "from-blue-400 via-indigo-400 to-purple-400" : "from-blue-600 via-indigo-600 to-purple-600"} bg-clip-text text-transparent`}>
                Owlwatch
              </span>
              <div className="text-xs text-gray-400 -mt-1">Decentralized Monitoring</div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-full ${isDark ? "bg-emerald-900/30 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200"} transition-all duration-300 hover:scale-105`}>
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-sm" />
              <span className={`text-sm font-medium ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                {displayNodes} Nodes Online
              </span>
            </div>

            <button 
              onClick={() => toggleTheme()} 
              aria-label="Toggle theme" 
              className={`p-3 rounded-full transition-all duration-300 hover:scale-110 ${isDark ? "bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </button>

            <button 
                onClick={() => window.location.assign("/become-validator")}
                title="Become validator" 
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 ${isDark ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg" : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"} disabled:opacity-50`}
              >
                {"Become Validator"}
            </button>

            <div className="flex items-center gap-4">
              <SignedOut>
                <SignInButton>
                  <button className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:scale-105 ${isDark ? "bg-white/5 text-white hover:bg-white/10" : "bg-white/80 text-gray-800 hover:bg-white"} border border-white/10`}>
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white transition-all duration-300 hover:scale-105 shadow-lg">
                    Sign up
                  </button>
                </SignUpButton>
              </SignedOut>

              <SignedIn>
                <div className="scale-125">
                  <UserButton afterSignOutUrl="/" />
                </div>
              </SignedIn>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}


/* ---------------- Dashboard main ---------------- */
export default function Dashboard(): JSX.Element {
  const { isDark, toggleTheme } = useTheme();

  const [stats, setStats] = useState<StatsData>({
    totalSites: 0,
    averageUptime: 99.97,
    totalIncidents: 0,
    averageResponseTime: 142,
    activeUsers: 0,
    nodesOnline: 0,
  });

  const { websites, loading: loadingWebsites, error: websitesError } = useWebsites();
  const validatorCtx = (() => {
    try {
      return useValidator();
    } catch {
      return undefined as any;
    }
  })();
  const { validator, pendingPayoutsSol } = validatorCtx ?? { validator: null, pendingPayoutsSol: null };
  const uiCtx = (() => {
    try {
      return useUI();
    } catch {
      return undefined as any;
    }
  })();
  const { loading: globalLoading } = uiCtx ?? { loading: false };

  const nodesOnlineFallback = websites?.length ?? stats.nodesOnline;

  const auth = (() => {
    try {
      return useAuth();
    } catch {
      return undefined as any;
    }
  })();

  // safely type getToken (may be undefined)
  const getToken = (auth?.getToken as (() => Promise<string | null>) | undefined) ?? undefined;

  const [currentTime, setCurrentTime] = useState(new Date());

  // animated counts + polling
  // --- new/updated state hooks ---
  const [backendWebsitesCount, setBackendWebsitesCount] = useState<number | null>(null);
  const [backendValidatorsCount, setBackendValidatorsCount] = useState<number | null>(null); // total (DB)
  const [backendActiveValidatorsCount, setBackendActiveValidatorsCount] = useState<number | null>(null); // live/active

  const [displayWebsites, setDisplayWebsites] = useState<number | null>(null);
  const [displayValidators, setDisplayValidators] = useState<number | null>(null); // total (animated)
  const [displayActiveValidators, setDisplayActiveValidators] = useState<number | null>(null); // active (animated)

  const [fetchingWebsites, setFetchingWebsites] = useState(false);
  const [fetchingValidators, setFetchingValidators] = useState(false);
  const [fetchingActiveValidators, setFetchingActiveValidators] = useState(false);

  // top validators
  const [topValidators, setTopValidators] = useState<any[]>([]);
  const [fetchingTopValidators, setFetchingTopValidators] = useState(false);

  // sol price
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  // newsletter
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [submittingNewsletter, setSubmittingNewsletter] = useState(false);

  // reveal-on-scroll
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll("[data-reveal]"));
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const target = e.target as HTMLElement;
          if (e.isIntersecting) {
            target.classList.add("reveal");
            obs.unobserve(target);
          }
        }
      },
      { root: null, threshold: 0.12 }
    );
    sections.forEach((s) => obs.observe(s));
    try {
      document.documentElement.style.scrollBehavior = "smooth";
    } catch {}
    return () => obs.disconnect();
  }, []);

  // small periodic stat drift + time update
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentTime(new Date());
      setStats((prev) => ({
        ...prev,
        totalSites: prev.totalSites + Math.floor(Math.random() * 3),
        activeUsers: Math.max(0, prev.activeUsers + Math.floor(Math.random() * 5) - 2),
        averageResponseTime: Math.floor(Math.random() * 50) + 120,
      }));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // fetch helpers (unchanged)
  // --- unchanged: fetchWebsitesOnce (keeps same) ---
  async function fetchWebsitesOnce(signal?: AbortSignal) {
    setFetchingWebsites(true);
    try {
      let token: string | null = null;
      try {
        if (typeof getToken === "function") token = await getToken();
      } catch {}
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch(`${BACKEND}/api/v1/get-all-db-websites`, { credentials: "include", headers, signal });
      if (!r.ok) return null;
      const j = await r.json().catch(() => null);
      const c = parseCountFromJson(j);
      return c;
    } catch (err) {
      if ((err as any)?.name !== "AbortError") console.error("fetchWebsitesOnce error", err);
      return null;
    } finally {
      setFetchingWebsites(false);
    }
  }

  // --- total validators (DB) ---
  async function fetchValidatorsOnce(signal?: AbortSignal) {
    setFetchingValidators(true);
    try {
      let token: string | null = null;
      try {
        if (typeof getToken === "function") token = await getToken();
      } catch {}
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch(`${BACKEND}/api/v1/get-all-db-validator`, { credentials: "include", headers, signal });
      if (!r.ok) return null;
      const j = await r.json().catch(() => null);
      const c = parseCountFromJson(j);
      return c;
    } catch (err) {
      if ((err as any)?.name !== "AbortError") console.error("fetchValidatorsOnce error", err);
      return null;
    } finally {
      setFetchingValidators(false);
    }
  }

  // --- active / live validators (uses live endpoint) ---
  async function fetchActiveValidators(signal?: AbortSignal) {
    setFetchingActiveValidators(true);
    try {
      let token: string | null = null;
      try {
        if (typeof getToken === "function") token = await getToken();
      } catch {}
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch(`${BACKEND}/api/v1/get-all-validator`, { credentials: "include", headers, signal });
      if (!r.ok) return null;
      const j = await r.json().catch(() => null);
      const c = parseCountFromJson(j);
      return c;
    } catch (err) {
      if ((err as any)?.name !== "AbortError") console.error("fetchActiveValidators error", err);
      return null;
    } finally {
      setFetchingActiveValidators(false);
    }
  }

  // --- polling websites (unchanged logic, just use nullish for display state) ---
  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;
    const POLL = 10_000;

    const run = async () => {
      controller?.abort();
      controller = new AbortController();
      const count = await fetchWebsitesOnce(controller.signal);
      if (mounted && typeof count === "number") {
        setBackendWebsitesCount(count);
        setDisplayWebsites(0);
        setTimeout(() => mounted && setDisplayWebsites(count), 60);
      }
    };

    void run();
    const id = window.setInterval(() => void run(), POLL);
    return () => {
      mounted = false;
      try { controller?.abort(); } catch {}
      clearInterval(id);
    };
  }, [getToken]);

  // --- polling total validators (DB) ---
  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;
    const POLL = 10_000;

    const run = async () => {
      controller?.abort();
      controller = new AbortController();
      const count = await fetchValidatorsOnce(controller.signal); // <-- total DB
      if (mounted && typeof count === "number") {
        setBackendValidatorsCount(count);
        setDisplayValidators(0);
        setTimeout(() => mounted && setDisplayValidators(count), 60);
      }
    };

    void run();
    const id = window.setInterval(() => void run(), POLL);
    return () => {
      mounted = false;
      try { controller?.abort(); } catch {}
      clearInterval(id);
    };
  }, [getToken]);

  // --- polling active validators (live) ---
  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;
    const POLL = 10_000;

    const run = async () => {
      controller?.abort();
      controller = new AbortController();
      const count = await fetchActiveValidators(controller.signal); // <-- live/active endpoint
      if (mounted && typeof count === "number") {
        setBackendActiveValidatorsCount(count);
        setDisplayActiveValidators(0);
        setTimeout(() => mounted && setDisplayActiveValidators(count), 60);
      }
    };

    void run();
    const id = window.setInterval(() => void run(), POLL);
    return () => {
      mounted = false;
      try { controller?.abort(); } catch {}
      clearInterval(id);
    };
  }, [getToken]);

  // helper to parse array from common shapes
  function parseValidatorsFromJson(j: any): any[] {
    if (!j) return [];
    if (Array.isArray(j)) return j;
    if (Array.isArray(j?.data)) return j.data;
    if (Array.isArray(j?.validators)) return j.validators;
    if (Array.isArray(j?.items)) return j.items;
    // try to find any array inside object
    const arr = Object.values(j).find((v) => Array.isArray(v));
    return Array.isArray(arr) ? arr : [];
  }

  async function fetchTopValidatorsOnce(signal?: AbortSignal) {
    setFetchingTopValidators(true);
    try {
      let token: string | null = null;
      try { if (typeof getToken === "function") token = await getToken(); } catch (e) { console.warn("getToken failed", e); }

      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      // <-- update the path if your backend exposes a different top validators route
      const url = `${BACKEND}/api/v1/get-top-validators`;
      console.debug("[fetchTopValidatorsOnce] requesting", url);

      const r = await fetch(url, { credentials: "include", headers, signal });
      console.debug("[fetchTopValidatorsOnce] response status", r.status);

      if (!r.ok) {
        // log body for easier debugging
        const text = await r.text().catch(() => "<body-parse-error>");
        console.error("[fetchTopValidatorsOnce] non-ok response", r.status, text);
        return null;
      }

      const j = await r.json().catch((err) => {
        console.error("[fetchTopValidatorsOnce] json parse failed", err);
        return null;
      });

      console.debug("[fetchTopValidatorsOnce] json", j);
      const arr = parseValidatorsFromJson(j);
      console.debug("[fetchTopValidatorsOnce] parsed array length", arr.length);
      // set state (don't mutate upstream)
      setTopValidators(arr);
      return arr.length;
    } catch (err) {
      if ((err as any)?.name === "AbortError") {
        console.debug("[fetchTopValidatorsOnce] aborted");
      } else {
        console.error("[fetchTopValidatorsOnce] error", err);
      }
      return null;
    } finally {
      setFetchingTopValidators(false);
    }
  }

  // polling effect (10s like others)
  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;
    const POLL = 10_000;

    const run = async () => {
      controller?.abort();
      controller = new AbortController();
      await fetchTopValidatorsOnce(controller.signal);
      // optionally: if you want to animate counts you can set display states here
      if (!mounted) controller?.abort();
    };

    void run();
    const id = window.setInterval(() => void run(), POLL);
    return () => {
      mounted = false;
      try { controller?.abort(); } catch {}
      clearInterval(id);
    };
  }, [getToken]); // depends on token provider

  // price fetch: backend then CoinGecko fallback
  async function fetchSolPriceOnce() {
    setPriceLoading(true);
    try {
      // CoinGecko fallback
      try {
        const cg = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { headers: { Accept: "application/json" } });
        if (cg.ok) {
          const data = await cg.json().catch(() => null);
          const price = data?.solana?.usd ?? null;
          if (typeof price === "number") {
            setSolPriceUsd(price);
            setPriceLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("CoinGecko failed:", err);
      }

      setSolPriceUsd(null);
    } finally {
      setPriceLoading(false);
    }
  }

  useEffect(() => {
    void fetchSolPriceOnce();
    const id = window.setInterval(() => void fetchSolPriceOnce(), 60_000);
    return () => clearInterval(id);
  }, []);

  async function safeGetToken(getTokenFn?: (() => Promise<string | null>) | undefined) {
    try {
      if (!getTokenFn) return null;
      const t = await getTokenFn();
      return t ?? null;
    } catch {
      return null;
    }
  }

  async function handleSubscribe(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newsletterEmail || !newsletterEmail.includes("@")) {
      toast.error("Please enter a valid email.");
      return;
    }
    setSubmittingNewsletter(true);
    try {
      const token = getToken ? await safeGetToken(getToken) : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await axios.post(`${BACKEND}/api/v1/subscribe`, { email: newsletterEmail }, { headers, withCredentials: true });
      if (resp?.data?.ok) {
        toast.success("Subscribed! Check your inbox for a confirmation.");
        setNewsletterEmail("");
      } else {
        toast.error("Subscription failed.");
      }
    } catch (err: any) {
      console.error("subscribe err:", err);
      toast.error(err?.response?.data?.error ?? "Failed to subscribe.");
    } finally {
      setSubmittingNewsletter(false);
    }
  }

  // CSS for reveal animations + improved glass styles for metrics section
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "dashboard-glass-styles";
    style.textContent = `
      /* reveal */
      [data-reveal] { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.4,0,0.2,1); }
      [data-reveal].reveal { opacity: 1; transform: translateY(0); }

      .glassmorphism { backdrop-filter: blur(12px) saturate(120%); -webkit-backdrop-filter: blur(12px) saturate(120%); transition: background 220ms ease, transform 220ms ease, box-shadow 220ms ease; border-radius: 12px; }

      .animate-float { animation: float 6s ease-in-out infinite; }
      @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-14px); } }

      .gradient-border { background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.12) 45%, rgba(6,182,212,0.12) 100%); padding: 2px; border-radius: 1rem; }
      .gradient-border > div { border-radius: calc(1rem - 2px); }

      .gradient-border > .glassmorphism { background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(245,249,255,0.60)); border: 1px solid rgba(15,23,42,0.04); box-shadow: 0 10px 30px rgba(10,14,25,0.06); color: #0b1220; padding: 1.75rem; min-height: 200px; backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); }

      @media (prefers-color-scheme: dark) {
        .gradient-border { background: linear-gradient(135deg, rgba(14,36,77,0.18), rgba(26,10,58,0.14) 45%, rgba(9,10,24,0.12) 100%); }
        .gradient-border > .glassmorphism { background: linear-gradient(180deg, rgba(6,10,18,0.50), rgba(12,18,34,0.42)); border: 1px solid rgba(255,255,255,0.04); box-shadow: 0 12px 40px rgba(2,6,23,0.55); color: #e6eef9; }
      }

      html.dark .gradient-border > .glassmorphism, body.dark .gradient-border > .glassmorphism { background: linear-gradient(180deg, rgba(6,10,18,0.50), rgba(12,18,34,0.42)); border: 1px solid rgba(255,255,255,0.04); box-shadow: 0 12px 40px rgba(2,6,23,0.55); color: #e6eef9; }

      .gradient-border > .glassmorphism h3 { position: relative; }
      .gradient-border > .glassmorphism h3::after { content: ""; position: absolute; left: 0; bottom: -12px; width: 56px; height: 4px; border-radius: 8px; background: linear-gradient(90deg, rgba(139,92,246,0.9), rgba(59,130,246,0.9)); opacity: 0.14; }

      .gradient-border .list-card { background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.00)); border-radius: 10px; padding: 0.6rem; transition: transform .18s ease, background .18s ease, box-shadow .18s ease; }
      .gradient-border .list-card:hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(2,6,23,0.06); }
      .gradient-border ::-webkit-scrollbar { width: 8px; }
      .gradient-border ::-webkit-scrollbar-track { background: transparent; }
      .gradient-border ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(99,102,241,0.28), rgba(56,189,248,0.22)); border-radius: 999px; }

      @media (prefers-reduced-motion: reduce) { .animate-float { animation: none !important; transform: none !important; } [data-reveal] { transition: none !important; } }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("dashboard-glass-styles");
      if (el) el.remove();
    };
  }, []);

  return (
    <div className={`min-h-screen transition-all duration-1000 ${isDark ? "bg-gradient-to-br from-[#0a0118] via-[#1a0b2e] to-[#2d1b69]" : "bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50"}`}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: isDark ? "#1e293b" : "#ffffff",
            color: isDark ? "#f1f5f9" : "#0f172a",
            border: `1px solid ${isDark ? "#475569" : "#e2e8f0"}`,
            borderRadius: "12px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          },
        }}
      />
      <Navbar isDark={isDark} toggleTheme={toggleTheme} nodesOnline={nodesOnlineFallback} onGetStarted={() => window.location.assign("/get-started")} />

      {/* Floating music player */}
      {/* <MusicComponent isDark={isDark}/> */}

      {/* decorative components */}
      <ParticleBackground isDark={isDark} />
      <MouseGlow isDark={isDark} />
      <FloatingElements isDark={isDark} />
      <WaveAnimation isDark={isDark} />

      <main className="pt-20">
        {/* HERO SECTION */}
        <section className="relative pt-32 pb-24 px-6 lg:px-8" data-reveal>
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-5xl mx-auto">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full mb-8 glassmorphism" style={{ background: isDark ? "rgba(99,102,241,0.1)" : "rgba(59,130,246,0.1)" }}>
                <Sparkles className={`w-5 h-5 ${isDark ? "text-purple-300" : "text-blue-600"} animate-pulse-slow`} />
                <span className={`text-sm font-semibold ${isDark ? "text-purple-200" : "text-blue-800"}`}>
                  Enterprise-grade decentralized monitoring platform
                </span>
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              </div>

              <h1 className={`text-4xl md:text-6xl lg:text-7xl font-black leading-tight mb-8 bg-clip-text text-transparent bg-gradient-to-r ${isDark ? "from-white via-purple-200 to-blue-200" : "from-gray-900 via-blue-800 to-purple-800"}`}>
                Monitor, Verify & Scale
                <span className="block bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  Web3 Infrastructure
                </span>
              </h1>

              <p className={`max-w-4xl mx-auto text-xl md:text-2xl ${isDark ? "text-gray-300" : "text-gray-600"} mb-12 leading-relaxed`}>
                DecentWatch provides global, blockchain-attested monitoring with an open validator network,
                enterprise alerting, and comprehensive reliability reports for the decentralized web.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-16">
                <button
                  onClick={() => window.location.assign("/get-started")}
                  className="group relative px-8 py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-purple-500/25"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Get Started
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </span>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>

                <button
                  onClick={() => window.location.assign("/docs")}
                  className={`px-8 py-4 rounded-2xl font-semibold text-lg border-2 transition-all duration-300 hover:scale-105 ${isDark ? "border-white/20 text-white hover:bg-white/5" : "border-gray-300 text-gray-800 hover:bg-gray-50"}`}
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    Documentation
                  </span>
                </button>
              </div>

              {/* Live metrics banner */}
              <div className="flex flex-wrap items-center justify-center gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                  <span className={isDark ? "text-gray-300" : "text-gray-600"}>
                    <AnimatedCounter target={displayWebsites ?? backendWebsitesCount ?? stats.totalSites} /> sites monitored
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
                  <span className={isDark ? "text-gray-300" : "text-gray-600"}>
                    {stats.averageUptime}% uptime
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse" />
                  <span className={isDark ? "text-gray-300" : "text-gray-600"}>
                    <AnimatedCounter target={displayActiveValidators ?? backendActiveValidatorsCount ?? nodesOnlineFallback} /> validators active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* METRICS DASHBOARD */}
        <section className="relative px-6 lg:px-8 pb-24" data-reveal>
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Network Overview Card */}
              <div className="gradient-border animate-float">
                <div className={`rounded-2xl p-8 h-full glassmorphism ${isDark ? "bg-slate-900/40" : "bg-white/60"} shadow-2xl`}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`p-3 rounded-xl ${isDark ? "bg-blue-500/20" : "bg-blue-100"}`}>
                      <Globe2 className={`w-8 h-8 ${isDark ? "text-blue-300" : "text-blue-600"}`} />
                    </div>
                    <div>
                      <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Network Overview</h3>
                      <p className="text-sm text-gray-400">Real-time monitoring stats</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Websites Monitored</div>
                        <div className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                          <AnimatedCounter target={displayWebsites ?? backendWebsitesCount ?? websites?.length ?? stats.totalSites} />
                        </div>
                      </div>

                      <TrendingUp className={`w-8 h-8 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Total Validators</div>
                        <div className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                          <AnimatedCounter target={displayValidators ?? backendValidatorsCount ?? nodesOnlineFallback} />
                        </div>
                      </div>
                      <Server className={`w-8 h-8 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10">
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Avg Response</div>
                        <div className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                          {stats.averageResponseTime}<span className="text-lg">ms</span>
                        </div>
                      </div>
                      <Zap className={`w-8 h-8 ${isDark ? "text-yellow-400" : "text-yellow-600"}`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* SOL Price Card */}
              <div className="gradient-border animate-float" style={{ animationDelay: '1s' }}>
                <div className={`rounded-2xl p-8 h-full glassmorphism ${isDark ? "bg-slate-900/40" : "bg-white/60"} shadow-2xl`}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`p-3 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500`}>
                      <span className="text-2xl font-black text-white">₪</span>
                    </div>
                    <div>
                      <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>SOL Price</h3>
                      <p className="text-sm text-gray-400">Real-time market data</p>
                    </div>
                  </div>

                  <div className="text-center py-8">
                    <div className={`text-5xl font-black mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
                      {priceLoading ? (
                        <div className="animate-pulse">...</div>
                      ) : solPriceUsd == null ? (
                        "N/A"
                      ) : (
                        `$${solPriceUsd.toFixed(2)}`
                      )}
                    </div>
                    <div className="text-sm text-gray-400 mb-6">
                      {priceLoading ? "Updating price..." : "Updated every minute"}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => void fetchSolPriceOnce()}
                        disabled={priceLoading}
                        className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105 ${isDark ? "bg-slate-700/50 text-white hover:bg-slate-600/50" : "bg-blue-100 text-blue-700 hover:bg-blue-200"} disabled:opacity-50`}
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => window.open("https://www.coingecko.com/en/coins/solana", "_blank")}
                        className={`flex-1 px-4 py-3 rounded-xl font-semibold border-2 transition-all duration-300 hover:scale-105 ${isDark ? "border-white/20 text-white hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                      >
                        CoinGecko
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Validators Card */}
              <div className="gradient-border animate-float" style={{ animationDelay: '2s' }}>
                <div className={`rounded-2xl p-8 h-full glassmorphism ${isDark ? "bg-slate-900/40" : "bg-white/60"} shadow-2xl`}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${isDark ? "bg-purple-500/20" : "bg-purple-100"}`}>
                        <Users className={`w-8 h-8 ${isDark ? "text-purple-300" : "text-purple-600"}`} />
                      </div>
                      <div>
                        <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Top Validators</h3>
                        <p className="text-sm text-gray-400">Highest earning nodes</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs ${fetchingTopValidators ? "bg-yellow-500/20 text-yellow-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                      {fetchingTopValidators ? "Updating..." : "Live"}
                    </div>
                  </div>

                  <div className="space-y-4 max-h-80 overflow-y-auto">
                    {topValidators.length === 0 ? (
                      <div className="text-center py-8">
                        <Server className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <div className="text-sm text-gray-400">No validators data yet</div>
                      </div>
                    ) : (
                      topValidators.map((v: any, i: number) => (
                        <div
                          key={v?.publicKey ?? i}
                          className={`flex items-center justify-between p-4 rounded-xl transition-all duration-300 hover:scale-105 ${isDark ? "bg-white/5 hover:bg-white/10" : "bg-gray-50 hover:bg-gray-100"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white bg-gradient-to-br ${i % 3 === 0 ? "from-purple-500 to-pink-500" : i % 3 === 1 ? "from-blue-500 to-cyan-500" : "from-green-500 to-emerald-500"}`}>
                              {String(v?.publicKey ?? "").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                                {String(v?.publicKey ?? "").slice(0, 16)}{String(v?.publicKey ?? "").length > 16 ? "..." : ""}
                              </div>
                              <div className="text-xs text-gray-400">
                                {v?.location ?? v?.ip ?? "Unknown location"}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {/* replace your current block with this */}
                            <div className={`text-sm font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                              {(() => {
                                // Interpret _pendingNumeric or pendingPayouts as lamports (number | string)
                                const lamportsRaw = Number(v?._pendingNumeric ?? v?.pendingPayouts ?? 0);
                                const lamports = Number.isFinite(lamportsRaw) ? lamportsRaw : 0;
                                const sol = lamports / 1_000_000_000;

                                if (!Number.isFinite(sol)) return "-";

                                // Show up to 6 decimal digits so small balances are visible.
                                // Adjust maximumFractionDigits if you want more/less precision.
                                const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(sol);

                                return (
                                  <>
                                    {formatted}
                                    <span className="text-purple-500 ml-1">SOL</span>
                                  </>
                                );
                              })()}
                            </div>

                            <div className="text-xs text-gray-400">pending rewards</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* TESTIMONIALS SECTION */}
        <section className="relative px-6 lg:px-8 py-24" data-reveal>
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className={`text-4xl md:text-5xl font-black mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>
                Trusted by Web3 Leaders
              </h2>
              <p className={`text-xl ${isDark ? "text-gray-300" : "text-gray-600"} max-w-3xl mx-auto`}>
                Join thousands of developers and enterprises building reliable decentralized applications
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { id: 1, name: "Ava Chen", role: "DeFi Protocol Lead", rating: 5, text: "DecentWatch's validator network provides unmatched reliability for our critical infrastructure monitoring. The blockchain attestation gives us complete confidence in our uptime metrics.", when: "2 days ago", avatar: "AC", company: "Phantom Labs" },
                { id: 2, name: "Liam Rodriguez", role: "DevOps Engineer", rating: 5, text: "Setting up as a validator was seamless. The rewards are consistent and the dashboard provides excellent insights into network performance. Highly recommended!", when: "1 week ago", avatar: "LR", company: "Solana Foundation" },
                { id: 3, name: "Noah Kim", role: "CTO", rating: 4, text: "Excellent uptime monitoring with detailed alerting. The decentralized approach gives us redundancy that traditional monitoring can't match.", when: "3 weeks ago", avatar: "NK", company: "Web3 Startup" },
              ].map((r) => (
                <div key={r.id} className={`rounded-2xl p-8 glassmorphism transition-all duration-300 hover:scale-105 hover:shadow-2xl ${isDark ? "bg-slate-900/40 border border-white/10" : "bg-white/60 border border-gray-200/20"} shadow-xl`}>
                  <div className="flex items-center gap-1 mb-4">
                    {Array(r.rating).fill(0).map((_, i) => (<Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />))}
                  </div>
                  
                  <blockquote className={`text-lg mb-6 ${isDark ? "text-gray-200" : "text-gray-700"} leading-relaxed`}>
                    "{r.text}"
                  </blockquote>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white bg-gradient-to-br from-purple-500 to-blue-500`}>
                        {r.avatar}
                      </div>
                      <div>
                        <div className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{r.name}</div>
                        <div className="text-sm text-gray-400">{r.role} • {r.company}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">{r.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <section className="px-6 lg:px-8 py-24" data-reveal>
          <div className="max-w-7xl mx-auto">
            <div className={`rounded-3xl p-12 md:p-16 glassmorphism ${isDark ? "bg-gradient-to-r from-purple-900/40 via-blue-900/40 to-indigo-900/40 border border-white/10" : "bg-gradient-to-r from-blue-50 to-indigo-100 border border-gray-200"} shadow-2xl`}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h3 className={`text-4xl md:text-5xl font-black mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>Run a Validator.<span className="block bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">Earn Rewards.</span></h3>
                  <p className={`text-xl mb-8 ${isDark ? "text-gray-300" : "text-gray-600"} leading-relaxed`}>
                    Join the DecentWatch validator network and earn SOL rewards while helping secure the future of decentralized monitoring. No technical expertise required.
                  </p>
                  
                  <div className="flex items-center gap-6 mb-8">
                    <div className="flex items-center gap-2">
                      <Shield className="w-6 h-6 text-emerald-500" />
                      <span className={isDark ? "text-gray-300" : "text-gray-700"}>Secure Network</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-blue-500" />
                      <span className={isDark ? "text-gray-300" : "text-gray-700"}>Passive Income</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-6 h-6 text-yellow-500" />
                      <span className={isDark ? "text-gray-300" : "text-gray-700"}>Easy Setup</span>
                    </div>
                  </div>
                </div>

                <div className="text-center lg:text-right">
                  <div className="mb-8">
                    <div className={`text-6xl font-black mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                      {topValidators.length > 0 ? ((Number(topValidators[0]?._pendingNumeric ?? 0) || 0) / 1_000_000_000).toFixed(2) : "12.50"}<span className="text-purple-500">SOL</span>
                    </div>
                    <div className="text-gray-400 text-lg">Average monthly earnings</div>
                  </div>
                  
                  <button onClick={() => window.location.assign("/become-validator")} className="group px-8 py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 to-pink-600 shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-purple-500/25">
                    <span className="flex items-center gap-2">
                      Become a Validator
                      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className={`relative pt-20 pb-12 px-6 lg:px-8 ${isDark ? "bg-slate-900/50" : "bg-white/80"} glassmorphism border-t ${isDark ? "border-white/10" : "border-gray-200/20"}`}>
          <div className="max-w-7xl mx-auto">
            {/* Newsletter Section */}
            <div className="text-center mb-16">
              <h3 className={`text-3xl font-black mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Stay Updated</h3>
              <p className={`text-lg mb-8 ${isDark ? "text-gray-300" : "text-gray-600"}`}>Get the latest updates on Web3 monitoring innovations and validator rewards</p>
              
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
                <input value={newsletterEmail} onChange={(e) => setNewsletterEmail(e.target.value)} placeholder="Enter your email address" className={`flex-1 px-6 py-4 rounded-xl border-2 ${isDark ? "bg-slate-800/50 border-white/10 text-white placeholder-gray-400" : "bg-white border-gray-200 text-gray-900 placeholder-gray-500"} focus:outline-none focus:border-purple-500 transition-all duration-300`} />
                <button type="submit" disabled={submittingNewsletter} className="px-6 py-4 rounded-xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white transition-all duration-300 hover:scale-105 disabled:opacity-50 shadow-lg">
                  {submittingNewsletter ? "Subscribing..." : "Subscribe"}
                </button>
              </form>
            </div>

            {/* Main Footer Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
              {/* Brand */}
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <Network className={`w-10 h-10 ${isDark ? "text-blue-400" : "text-blue-600"} animate-pulse-slow`} />
                  <div>
                    <div className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>DecentWatch</div>
                    <div className="text-sm text-gray-400">Decentralized Monitoring</div>
                  </div>
                </div>
                <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"} mb-6 leading-relaxed`}>The future of Web3 infrastructure monitoring. Built by developers, for developers, secured by a global validator network.</p>
                <div className="flex gap-4">
                  <button className={`p-3 rounded-xl ${isDark ? "bg-slate-800/50 text-white hover:bg-slate-700/50" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition-all duration-300 hover:scale-110`}><Github className="w-5 h-5" /></button>
                  <button className={`p-3 rounded-xl ${isDark ? "bg-slate-800/50 text-white hover:bg-slate-700/50" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition-all duration-300 hover:scale-110`}><Twitter className="w-5 h-5" /></button>
                  <button className={`p-3 rounded-xl ${isDark ? "bg-slate-800/50 text-white hover:bg-slate-700/50" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition-all duration-300 hover:scale-110`}><Send className="w-5 h-5" /></button>
                </div>
              </div>

              {/* Product */}
              <div>
                <h4 className={`text-lg font-bold mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>Platform</h4>
                <ul className="space-y-4">
                  {[ { name: "Website Tracker", href: "/tracker" }, { name: "Validator Dashboard", href: "/validator" }, { name: "Become a Validator", href: "/become-validator" }, { name: "Network Status", href: "/status" } ].map(link => (
                    <li key={link.name}><button onClick={() => window.location.assign(link.href)} className={`text-sm ${isDark ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"} transition-colors duration-300 hover:translate-x-1 transform`}>{link.name}</button></li>
                  ))}
                </ul>
              </div>

              {/* Developers */}
              <div>
                <h4 className={`text-lg font-bold mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>Developers</h4>
                <ul className="space-y-4">
                  {[ { name: "Documentation", href: "/docs", icon: BookOpen }, { name: "API Reference", href: "/docs/api", icon: FileText }, { name: "Validator Guide", href: "/docs/validators", icon: Server }, { name: "SDKs & Tools", href: "/docs/sdks", icon: Zap } ].map(link => (
                    <li key={link.name}><button onClick={() => window.location.assign(link.href)} className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"} transition-all duration-300 hover:translate-x-1 transform`}><link.icon className="w-4 h-4" />{link.name}</button></li>
                  ))}
                </ul>
              </div>

              {/* Support */}
              <div>
                <h4 className={`text-lg font-bold mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>Support</h4>
                <div className="space-y-4">
                  <div className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"} mb-4`}>
                    <div className="font-medium mb-2">Contact Us</div>
                    <a href="mailto:support@decentwatch.example" className="hover:underline">support@decentwatch.example</a>
                  </div>
                  
                  <div className="space-y-3">
                    {[ { name: "Help Center", href: "/help" }, { name: "Community", href: "/community" }, { name: "Status Page", href: "/status" }, { name: "Bug Reports", href: "/bugs" } ].map(link => (
                      <button key={link.name} onClick={() => window.location.assign(link.href)} className={`block text-sm ${isDark ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"} transition-all duration-300 hover:translate-x-1 transform`}>{link.name}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className={`pt-8 border-t ${isDark ? "border-white/10" : "border-gray-200/20"} flex flex-col md:flex-row items-center justify-between gap-6`}>
              <div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>© {new Date().getFullYear()} DecentWatch. All rights reserved. Built for the decentralized web.</div>
              
              <div className="flex items-center gap-6 text-sm">
                <button onClick={() => window.location.assign("/legal/terms")} className={`${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"} transition-colors duration-300`}>Terms of Service</button>
                <button onClick={() => window.location.assign("/legal/privacy")} className={`${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"} transition-colors duration-300`}>Privacy Policy</button>
                <button onClick={() => window.location.assign("/legal/cookies")} className={`${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"} transition-colors duration-300`}>Cookie Policy</button>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
