// src/pages/Dashboard.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Network,
  Sun,
  Moon,
  Globe2,
  TrendingUp,
  CloudLightning,
  Users,
  Server,
  Shield,
  Eye,
  ArrowRight,
  Sparkles,
  Wifi,
  Plus,
} from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/clerk-react";

import toast, { Toaster } from "react-hot-toast";

import { useTheme } from "../hooks/ThemeContext";
import { ParticleBackground } from "../components/ParticleBackground";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { MouseGlow } from "../components/MouseGlow";
import { FloatingElements } from "../components/FloatingElements";
import { WaveAnimation } from "../components/WaveAnimation";

import { useWebsites } from "../context/websites";
import { useValidator } from "../context/validator";
import { useUI } from "../context/ui";

const backendUrl = "http://localhost:5000"; // kept for reference if needed

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect?: (opts?: any) => Promise<{ publicKey?: { toString: () => string } }>;
      disconnect?: () => Promise<void>;
      // add other phantom fields if necessary
    };
  }
}

interface StatsData {
  totalSites: number;
  averageUptime: number;
  totalIncidents: number;
  averageResponseTime: number;
  activeUsers: number;
  nodesOnline: number;
}

/**
 * Navbar component (now uses validator context to check validator status)
 */
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
  const [visible, setVisible] = useState(true);
  const prevY = useRef<number>(0);
  const ticking = useRef(false);
  const [phantomConnecting, setPhantomConnecting] = useState(false);

  // Safely obtain validator context (guard so if hook throws it won't crash)
  const validatorCtx = (() => {
    try {
      return useValidator();
    } catch {
      return undefined as any;
    }
  })();

  // Safely obtain UI context / notify
  const uiCtx = (() => {
    try {
      return useUI();
    } catch {
      return undefined as any;
    }
  })();

  // prefer notify from UI context, else fallback to toast
  const notify =
    uiCtx?.notify ??
    {
      success: (m: string) => toast.success(m),
      error: (m: string) => toast.error(m),
      info: (m: string) => toast(m),
    };

  const checkValidatorByPublicKey: ((pk: string) => Promise<any | null>) | undefined =
    validatorCtx?.checkValidatorByPublicKey;

  const setValidatorInContext: ((v: any) => void) | undefined =
    validatorCtx?.setValidator ?? validatorCtx?.setLocalValidator;

  const validator = validatorCtx?.validator ?? null;
  const pendingPayoutsSol = validatorCtx?.pendingPayoutsSol ?? null;

  // Local flag so the UI can show disconnect even if context isn't populated yet
  const [isValidatorLocal, setIsValidatorLocal] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        return !!localStorage.getItem("validatorPublicKey");
      }
    } catch {
      /* ignore */
    }
    return false;
  });

  // On mount, try to hydrate context if a local key exists.
  // IMPORTANT: do not flip local flag to false if the check fails — that causes flicker.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const pk = typeof window !== "undefined" ? localStorage.getItem("validatorPublicKey") : null;
        if (pk) {
          // Keep local flag true (we have the key) — this avoids UI flicker
          if (mounted) setIsValidatorLocal(true);

          // Best-effort: attempt to hydrate context with backend record
          if (typeof checkValidatorByPublicKey === "function") {
            try {
              const rec = await checkValidatorByPublicKey(pk);
              if (rec && mounted && typeof setValidatorInContext === "function") {
                try {
                  setValidatorInContext(rec);
                } catch (err) {
                  // harmless
                  // eslint-disable-next-line no-console
                  console.warn("setValidatorInContext failed on mount:", err);
                }
              }
            } catch (err) {
              // non-fatal; keep isValidatorLocal as is (true) so disconnect stays visible
              // eslint-disable-next-line no-console
              console.warn("Validator check on mount failed (ignored):", err);
            }
          }
        } else {
          if (mounted) setIsValidatorLocal(false);
        }
      } finally {
        // no-op
      }
    })();
    return () => {
      mounted = false;
    };
  }, [checkValidatorByPublicKey, setValidatorInContext]);

  useEffect(() => {
    prevY.current = typeof window !== "undefined" ? window.scrollY : 0;
    setVisible(true);

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

  const visibleBgClass = isDark
    ? "bg-slate-900/85 border-b border-slate-700/40 backdrop-blur-sm"
    : "bg-white/85 border-b border-gray-200/60 backdrop-blur-sm";

  const handleGetStarted = () => {
    if (typeof onGetStarted === "function") {
      try {
        onGetStarted();
      } catch (e) {
        // fallback
        // eslint-disable-next-line no-console
        console.warn("onGetStarted threw, falling back to navigation:", e);
        window.location.assign("/get-started");
      }
    } else {
      window.location.assign("/get-started");
    }
  };

  // Connect Phantom, get public key, use validator context to check registration
  async function handleConnectPhantomAndCheck() {
    if (phantomConnecting) return;
    setPhantomConnecting(true);

    try {
      if (!("solana" in window) || !window.solana?.isPhantom) {
        notify.error("Phantom wallet not found. Install Phantom or use the onboarding page.");
        setPhantomConnecting(false);
        return;
      }

      const resp = await window.solana!.connect?.();
      const pk = resp?.publicKey?.toString?.() ?? "";
      if (!pk) {
        notify.error("Failed to retrieve public key from Phantom.");
        setPhantomConnecting(false);
        return;
      }

      // store pk locally for quick checks & flows
      try {
        localStorage.setItem("validatorPublicKey", pk);
      } catch (e) {
        // ignore localStorage errors
        // eslint-disable-next-line no-console
        console.warn("localStorage write failed for validatorPublicKey", e);
      }

      // Use validator context to check backend if function exists
      let record = null;
      if (typeof checkValidatorByPublicKey === "function") {
        try {
          record = await checkValidatorByPublicKey(pk);
        } catch (err) {
          // nonfatal — log and continue to redirect to onboarding as fallback
          // eslint-disable-next-line no-console
          console.warn("checkValidatorByPublicKey failed:", err);
          record = null;
        }
      } else {
        // If no function available, fall back to a simple redirect flow
        record = null;
      }

      if (record) {
        notify.success("Validator record found — redirecting to dashboard");
        // attempt to update context validator if setter exists
        if (typeof setValidatorInContext === "function") {
          try {
            setValidatorInContext(record);
          } catch (err) {
            console.warn("setValidatorInContext failed:", err);
          }
        }
        // Also update local UI flag so Disconnect button appears immediately
        setIsValidatorLocal(true);
        window.location.assign("/validator");
      } else {
        // No record - make sure local flag is false so button isn't shown incorrectly
        setIsValidatorLocal(false);
        notify.success("No validator record — redirecting to onboarding");
        window.location.assign("/become-validator");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Phantom connect/check error:", err);
      notify.error("Error connecting or checking validator. Check console & backend/CORS.");
    } finally {
      setPhantomConnecting(false);
    }
  }

  // Disconnect handler: clear local validator state & attempt wallet disconnect
  const handleDisconnect = async () => {
    try {
      // Clear local storage key
      try {
        localStorage.removeItem("validatorPublicKey");
      } catch (e) {
        // ignore
      }

      // Try Phantom disconnect if available
      try {
        if (window.solana && typeof window.solana.disconnect === "function") {
          await window.solana.disconnect();
        }
      } catch (err) {
        // not fatal
        // eslint-disable-next-line no-console
        console.warn("Phantom disconnect failed:", err);
      }

      // Clear validator in context if setter exists
      if (typeof setValidatorInContext === "function") {
        try {
          setValidatorInContext(null);
        } catch (err) {
          console.warn("Failed to clear validator in context:", err);
        }
      }

      // clear local UI flag
      setIsValidatorLocal(false);

      notify.success("Disconnected wallet and cleared validator state locally");
    } catch (err) {
      console.error("Disconnect error:", err);
      notify.error("Failed to disconnect wallet");
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out transform ${
        visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
      } ${visible ? visibleBgClass : "bg-transparent"}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Network className={`w-8 h-8 ${isDark ? "text-blue-400" : "text-blue-600"} animate-pulse`} />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
            </div>
            <span
              className={`text-xl font-bold bg-gradient-to-r ${
                isDark ? "from-blue-400 to-indigo-400" : "from-blue-600 to-indigo-600"
              } bg-clip-text text-transparent`}
            >
              DecentWatch
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-6">
            <div className={`hidden md:flex items-center space-x-2 px-3 py-1 rounded-full ${isDark ? "bg-emerald-900/30" : "bg-emerald-100"}`}>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className={`text-sm ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{nodesOnline} Nodes Online</span>
            </div>

            <button
              onClick={() => {
                try {
                  toggleTheme();
                } catch (e) {}
              }}
              aria-label="Toggle theme"
              className={`p-2 rounded-full transition-all duration-300 hover:scale-110 ${
                isDark ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
              }`}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Phantom / become validator */}
            {/* SHOW this button only if user is NOT registered (context OR localStorage) */}
            {!(validator || isValidatorLocal) && (
              <button
                onClick={handleConnectPhantomAndCheck}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors mr-2 ${
                  isDark ? "bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600" : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm"
                }`}
                type="button"
                disabled={phantomConnecting}
                title="Connect Phantom and check validator status"
              >
                {phantomConnecting ? "Checking..." : "Become Validator"}
              </button>
            )}

            {/* If the user is already a validator (context provides validator OR localStorage has key), show disconnect button */}
            {(validator || isValidatorLocal) && (
              <button
                onClick={handleDisconnect}
                className={`px-3 py-1 rounded-md text-sm font-medium mr-2 ${isDark ? "bg-red-700 text-white" : "bg-red-600 text-white"} `}
                type="button"
                title="Disconnect wallet & clear validator state"
              >
                Disconnect Wallet
              </button>
            )}

            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton>
                  <button
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      isDark ? "bg-white/5 text-white hover:bg-white/10" : "bg-white/80 text-gray-800 hover:bg-white/90"
                    }`}
                    type="button"
                  >
                    Sign in
                  </button>
                </SignInButton>

                <SignUpButton>
                  <button
                    className="px-3 py-1 rounded-md text-sm font-medium ml-2 transition-colors bg-blue-600 text-white hover:bg-blue-700"
                    type="button"
                  >
                    Sign up
                  </button>
                </SignUpButton>
              </SignedOut>

              <SignedIn>
                <div className="ml-1">
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

/**
 * Dashboard — main exported component (uses contexts)
 */
export default function Dashboard(): JSX.Element {
  const { isDark, toggleTheme } = useTheme();

  // local simulated stats (kept for visual consistency)
  const [stats, setStats] = useState<StatsData>({
    totalSites: 12847,
    averageUptime: 99.97,
    totalIncidents: 3,
    averageResponseTime: 142,
    activeUsers: 2489,
    nodesOnline: 156,
  });

  const { websites, loading: loadingWebsites, error: websitesError, refreshWebsites } = useWebsites();
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

  const nodesOnline = websites?.length ?? stats.nodesOnline;

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      setStats((prev) => ({
        ...prev,
        totalSites: prev.totalSites + Math.floor(Math.random() * 3),
        activeUsers: Math.max(0, prev.activeUsers + Math.floor(Math.random() * 5) - 2),
        averageResponseTime: Math.floor(Math.random() * 50) + 120,
      }));
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  // keep scrollY if you use it elsewhere
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const handle = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <div
      className={`min-h-screen transition-all duration-700 ${
        isDark ? "bg-gradient-to-br from-[#071025] via-[#07172a] to-[#061028]" : "bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50"
      }`}
    >
      <Toaster />
      <Navbar isDark={isDark} toggleTheme={toggleTheme} nodesOnline={nodesOnline} onGetStarted={() => window.location.assign("/get-started")} />

      <ParticleBackground isDark={isDark} />
      <MouseGlow isDark={isDark} />
      <FloatingElements isDark={isDark} />
      <WaveAnimation isDark={isDark} />

      <main className="pt-20">
        {/* Hero */}
        <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <div className="animate-fade-in-up">
              <div className="flex items-center justify-center mb-6">
                <div className={`px-4 py-2 rounded-full ${isDark ? "bg-blue-900/30" : "bg-blue-100"} border ${isDark ? "border-blue-500/30" : "border-blue-300"}`}>
                  <div className="flex items-center space-x-2">
                    <Sparkles className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-600"} animate-pulse`} />
                    <span className={`text-sm font-medium ${isDark ? "text-blue-400" : "text-blue-700"}`}>Decentralized Monitoring Revolution</span>
                  </div>
                </div>
              </div>

              <h1
                className={`text-5xl md:text-7xl font-bold mb-8 bg-gradient-to-r ${
                  isDark ? "from-white via-blue-200 to-indigo-200" : "from-gray-900 via-blue-800 to-indigo-800"
                } bg-clip-text text-transparent leading-tight`}
              >
                Monitor Your Web3
                <br />
                <span className="relative inline-block">
                  Infrastructure
                  <div className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-pulse" />
                </span>
              </h1>

              <p className={`text-xl md:text-2xl mb-12 max-w-4xl mx-auto leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                Experience lightning-fast, decentralized uptime monitoring with real-time alerts,
                global node coverage, and blockchain-verified reliability reports.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 mb-16">
                <button
                  className={`group px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:scale-105 ${isDark ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700" : "bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"} shadow-2xl hover:shadow-blue-500/25`}
                  type="button"
                  onClick={() => window.location.assign("/tracker")}
                >
                  <div className="flex items-center space-x-3">
                    <span>Start Monitoring</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  className={`px-8 py-4 rounded-xl font-semibold text-lg border-2 transition-all duration-300 hover:scale-105 ${isDark ? "border-blue-400/50 text-blue-400 hover:bg-blue-400/10" : "border-blue-500/50 text-blue-600 hover:bg-blue-500/10"}`}
                  type="button"
                  onClick={() => window.location.assign("/tracker")}
                >
                  <div className="flex items-center space-x-3">
                    <Eye className="w-5 h-5" />
                    <span>Live Demo</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Real-time Stats */}
        <section className="relative py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className={`text-4xl md:text-5xl font-bold mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>Live Network Statistics</h2>
              <p className={`text-xl ${isDark ? "text-gray-300" : "text-gray-600"}`}>Real-time data from our global decentralized monitoring network</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              {[
                { icon: Globe2, label: "Websites Monitored", value: websites?.length ?? stats.totalSites, suffix: "+", color: isDark ? "text-blue-400" : "text-blue-600", bg: isDark ? "bg-blue-500/10" : "bg-blue-100" },
                { icon: TrendingUp, label: "Average Uptime", value: stats.averageUptime, suffix: "%", decimals: 2, color: isDark ? "text-emerald-400" : "text-emerald-600", bg: isDark ? "bg-emerald-500/10" : "bg-emerald-100" },
                { icon: CloudLightning, label: "Avg Response Time", value: stats.averageResponseTime, suffix: "ms", color: isDark ? "text-yellow-400" : "text-yellow-600", bg: isDark ? "bg-yellow-500/10" : "bg-yellow-100" },
                { icon: Users, label: "Active Monitors", value: stats.activeUsers, suffix: "+", color: isDark ? "text-indigo-400" : "text-indigo-600", bg: isDark ? "bg-indigo-500/10" : "bg-indigo-100" },
                { icon: Server, label: "Monitoring Nodes", value: nodesOnline, color: isDark ? "text-cyan-400" : "text-cyan-600", bg: isDark ? "bg-cyan-500/10" : "bg-cyan-100" },
                { icon: Shield, label: "Active Incidents", value: stats.totalIncidents, color: isDark ? "text-red-400" : "text-red-600", bg: isDark ? "bg-red-500/10" : "bg-red-100" },
              ].map((stat, index) => {
                const StatIcon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className={`group relative overflow-hidden rounded-2xl p-8 transition-all duration-500 hover:scale-105 hover:-translate-y-2 ${isDark ? "bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10" : "bg-white/70 backdrop-blur-xl border border-gray-200 hover:bg-white/90"} shadow-xl hover:shadow-2xl`}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                        <StatIcon className="w-8 h-8" />
                      </div>
                      <div className="text-right">
                        <div className={`text-3xl font-bold ${stat.color} tabular-nums`}>
                          <AnimatedCounter target={stat.value} suffix={stat.suffix || ""} decimals={(stat as any).decimals || 0} />
                        </div>
                        <p className={`text-sm font-medium mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>{stat.label}</p>
                      </div>
                    </div>

                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${
                        (stat.color as string).includes("blue")
                          ? "from-blue-500 to-indigo-500"
                          : (stat.color as string).includes("cyan")
                          ? "from-cyan-500 to-blue-500"
                          : (stat.color as string).includes("emerald")
                          ? "from-emerald-500 to-green-500"
                          : (stat.color as string).includes("yellow")
                          ? "from-yellow-500 to-orange-500"
                          : (stat.color as string).includes("indigo")
                          ? "from-indigo-500 to-purple-500"
                          : "from-red-500 to-orange-500"
                      } opacity-50 group-hover:opacity-100 transition-opacity`}
                    ></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Become Validator */}
        <section className="relative py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
              <div className="max-w-3xl text-center md:text-left">
                <h3 className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Become a Validator</h3>
                <p className={`mt-3 text-lg ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                  Join our global network of validators to help secure the monitoring infrastructure and earn rewards.
                </p>
              </div>

              <div>
                <button
                  onClick={() => {
                    try {
                      const pk = localStorage.getItem("validatorPublicKey");
                      if (pk && pk.trim()) {
                        window.location.assign("/validator");
                      } else {
                        window.location.assign("/become-validator");
                      }
                    } catch (e) {
                      // eslint-disable-next-line no-console
                      console.warn("Error reading validatorPublicKey from localStorage", e);
                      window.location.assign("/become-validator");
                    }
                  }}
                  className={`inline-flex items-center px-6 py-3 rounded-xl font-semibold text-lg transition-all duration-300 hover:scale-105 ${
                    isDark ? "bg-gradient-to-r from-indigo-600 to-blue-500 text-white hover:from-indigo-700 hover:to-blue-600" : "bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"
                  } shadow-2xl`}
                >
                  <span>Become a Validator</span>
                  <ArrowRight className="w-5 h-5 ml-3" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className={`py-16 px-4 sm:px-6 lg:px-8 border-t ${isDark ? "border-white/10" : "border-gray-200"}`}>
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center space-x-4 mb-8">
              <div className="flex items-center space-x-3">
                <Network className={`w-8 h-8 ${isDark ? "text-blue-400" : "text-blue-600"} animate-pulse`} />
                <span className={`text-2xl font-bold bg-gradient-to-r ${isDark ? "from-blue-400 to-indigo-400" : "from-blue-600 to-indigo-600"} bg-clip-text text-transparent`}>DecentWatch</span>
              </div>

              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${isDark ? "bg-emerald-900/30" : "bg-emerald-100"}`}>
                <Wifi className="w-4 h-4 text-emerald-500" />
                <span className={`text-sm ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>Network Status: Optimal</span>
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className={`${isDark ? "text-gray-400" : "text-gray-600"}`}>Powered by a global network of decentralized monitoring nodes</p>
              <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                Last updated: {currentTime.toLocaleString()} • Network latency: <span className="text-emerald-500 font-mono">{stats.averageResponseTime}ms</span>
              </p>
              {validator && (
                <p className="text-sm mt-2">
                  Validator: <span className="font-mono">{validator.publicKey}</span> • Pending payouts: <span className="font-mono">{pendingPayoutsSol ?? 0} SOL</span>
                </p>
              )}
              {globalLoading && <p className="text-sm text-gray-400">Global loading...</p>}
              {loadingWebsites && <p className="text-sm text-gray-400">Refreshing websites...</p>}
              {websitesError && <p className="text-sm text-red-400">Websites error: {websitesError}</p>}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
