// src/pages/Validator.tsx
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { useAuth } from "@clerk/clerk-react";
import { useValidator } from "../context/validator";
import { useTheme } from "../hooks/ThemeContext";
import { Network, Sun, Moon } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/clerk-react";
// import { useUI } from "../context/ui";
import { usePhantom } from "../context/PhantomWalletContext"

declare global {
  interface Window {
    solana?: any; // Phantom wallet
  }
}

const backendUrl = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

export default function Validator(): React.ReactElement {
  const { getToken } = useAuth();

  const {
    checkValidatorByPublicKey,
    registerValidator,
    setValidator: setValidatorInContext,
  } = (() => {
    try {
      return useValidator();
    } catch {
      return {} as any;
    }
  })();

  //
  // SAFE THEME WRAPPER
  //
  const themeCtx = (() => {
    try {
      return useTheme();
    } catch {
      return null as any;
    }
  })();

  const [isDarkLocal, setIsDarkLocal] = useState<boolean>(() => {
    if (themeCtx && typeof themeCtx.isDark === "boolean") return themeCtx.isDark;
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "dark") return true;
      if (saved === "light") return false;
      if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
    } catch {}
    return true; // default to dark for parity with previous styling
  });

  useEffect(() => {
    if (themeCtx) return;
    try {
      if (isDarkLocal) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    } catch {}
  }, [isDarkLocal, themeCtx]);

  const isDark = themeCtx ? themeCtx.isDark : isDarkLocal;
  const toggleTheme = () => {
    if (themeCtx && typeof themeCtx.toggleTheme === "function") {
      try {
        themeCtx.toggleTheme();
      } catch {}
    } else {
      setIsDarkLocal((s) => !s);
    }
  };

  // ---------- Validator page state (unchanged logic) ----------
  // PUBLIC KEY: remove localStorage usage — use Phantom context as source of truth
  const [publicKey, setPublicKey] = useState<string>("");

  // Phantom wallet context (safe wrapper)
  const phantomCtx = (() => {
    try {
      return usePhantom();
    } catch {
      return undefined as any;
    }
  })();

  // keep local IP / location / UI state
  const [ip, setIp] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [loadingIp, setLoadingIp] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Sync publicKey from Phantom context when it becomes available
  useEffect(() => {
    try {
      if (phantomCtx?.address) {
        setPublicKey(phantomCtx.address);
      } else {
        // if wallet disconnected, clear the field (so user can paste)
        setPublicKey("");
      }
    } catch {}
  }, [phantomCtx?.address]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingIp(true);
        const res = await fetch("https://ipapi.co/json/");
        if (!mounted) return;
        if (!res.ok) throw new Error(`ipapi returned ${res.status}`);
        const data = await res.json();
        setIp(data.ip ?? "");
        const city = data.city ?? "";
        const region = data.region ?? "";
        const country = data.country_name ?? data.country ?? "";
        setLocation([city, region, country].filter(Boolean).join(", ") || "Unknown");
      } catch (err) {
        console.warn("Failed to fetch IP/location:", err);
      } finally {
        if (mounted) setLoadingIp(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const connectPhantom = async () => {
    try {
      // Prefer using the Phantom context if available
      if (phantomCtx && phantomCtx.isInstalled && typeof phantomCtx.connect === "function") {
        await phantomCtx.connect();
        // phantomCtx.address will be synced by the context; use it if present
        const pk = phantomCtx.address ?? "";
        if (pk) {
          setPublicKey(pk);
          toast.success("Wallet connected");
        } else {
          toast.error("No public key returned from wallet");
        }
        return;
      }

      // Fallback to direct window.solana (for parity with previous behavior)
      if (!window.solana || !window.solana.isPhantom) {
        toast.error("Phantom wallet not found. You can paste your public key instead.");
        return;
      }
      const resp = await window.solana.connect();
      const pk = resp?.publicKey?.toString?.() ?? "";
      if (pk) {
        setPublicKey(pk);
        toast.success("Wallet connected");
      } else {
        toast.error("No public key returned from wallet");
      }
    } catch (err: any) {
      console.error("Phantom connect error:", err);
      toast.error(err?.message ?? "Failed to connect wallet");
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!publicKey) {
      toast.error("Please provide a Solana public key (connect Phantom or paste it).");
      return;
    } else if (!location) {
      toast.error("Please provide a location.");
      return;
    } else if (!ip) {
      toast.error("Please provide an IP address.");
      return;
    }

    setSubmitting(true);

    try {
      if (typeof checkValidatorByPublicKey === "function") {
        try {
          const existing = await checkValidatorByPublicKey(publicKey);
          if (existing) {
            // set validator in context if available (don't use localStorage)
            try {
              if (typeof setValidatorInContext === "function") {
                setValidatorInContext(existing);
              }
            } catch (err) {
              console.warn("setValidatorInContext failed (non-fatal):", err);
            }

            toast.success("Validator already registered — redirecting...");
            setTimeout(() => window.location.assign("/validator"), 600);
            return;
          }
        } catch (err: any) {
          if (err?.response?.status === 401) {
            toast.error("Unauthorized while checking validator. Please sign in and try again.");
            setSubmitting(false);
            return;
          }
          console.warn("Pre-check failed (continuing to create):", err);
        }
      }

      let token: string | null = null;
      try {
        token = await getToken();
      } catch (err) {
        token = null;
      }
      if (!token) {
        toast.error("You are not authenticated. Please sign in before registering as a validator.");
        setSubmitting(false);
        return;
      }

      const payload = {
        publicKey,
        ip: ip || "0.0.0.0",
        location: location || "Unknown",
      };

      const res = await axios.post(`${backendUrl}/api/v1/create-validator`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      });

      if (res && (res.status === 201 || res.status === 200)) {
        // On success, try to sync context (prefer check then set, or call registerValidator)
        if (typeof checkValidatorByPublicKey === "function") {
          try {
            const v = await checkValidatorByPublicKey(publicKey);
            if (v) {
              try {
                if (typeof setValidatorInContext === "function") setValidatorInContext(v);
              } catch (err) {
                console.warn("setValidatorInContext after register failed:", err);
              }
              toast.success("Validator registered successfully — redirecting...");
            }
          } catch (err) {
            console.warn("Context sync after register failed (non-fatal):", err);
          }
        } else if (typeof registerValidator === "function") {
          try {
            await registerValidator(payload as any);
          } catch (err) {
            console.warn("registerValidator context call failed:", err);
          }
        }

        setTimeout(() => window.location.assign("/validator"), 700);
        return;
      } else {
        toast.error(`Server returned status ${res?.status}. Not redirecting.`);
      }
    } catch (err: any) {
      console.error("Failed to create validator:", err?.response?.data ?? err?.message ?? err);

      const status = err?.response?.status;
      const respData = err?.response?.data;
      const messageStr =
        (typeof respData === "string" && respData) ||
        (respData && (respData.message || respData.error || JSON.stringify(respData))) ||
        err?.message;

      const alreadyExists =
        status === 409 || (typeof messageStr === "string" && messageStr.toLowerCase().includes("already exists"));

      if (alreadyExists) {
        // sync to context (no localStorage)
        try {
          if (typeof checkValidatorByPublicKey === "function") {
            const v = await checkValidatorByPublicKey(publicKey);
            if (v && typeof setValidatorInContext === "function") {
              setValidatorInContext(v);
            }
          }
        } catch (err) {
          console.warn("Context sync on already-exists path failed:", err);
        }

        toast.success("Validator already exists — redirecting...");
        setTimeout(() => window.location.assign("/validator"), 600);
        return;
      }

      if (status === 401) {
        toast.error("Unauthorized: your session may have expired. Please sign in again.");
        setSubmitting(false);
        return;
      }

      toast.error(typeof messageStr === "string" ? messageStr : "Failed to register validator");
    } finally {
      setSubmitting(false);
    }
  };

  //
  // ---------------------------
  // Navbar (Dashboard-style, identical look/behavior to your Dashboard)
  // ---------------------------
  //
  function Navbar({
    isDark,
    toggleTheme,
    nodesOnline = 0,
  }: {
    isDark: boolean;
    toggleTheme: () => void;
    nodesOnline?: number;
    onGetStarted?: () => void;
  }): React.ReactElement {
    const [visible, setVisible] = useState(true);
    const prevY = useRef<number>(0);
    const ticking = useRef(false);
    //const [phantomConnecting, setPhantomConnecting] = useState(false);

    // const uiCtx = (() => {
    //   try {
    //     return useUI();
    //   } catch {
    //     return undefined as any;
    //   }
    // })();

    // const notify =
    //   uiCtx?.notify ??
    //   {
    //     success: (m: string) => toast.success(m),
    //     error: (m: string) => toast.error(m),
    //     info: (m: string) => toast(m),
    //   };

    //const [isValidatorLocal, setIsValidatorLocal] = useState<boolean>(() => {
      // determine initial state from validator context (not localStorage)
    //   try {
    //     return !!ctxValidator;
    //   } catch {
    //     return false;
    //   }
    // });

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

    // async function handleConnectPhantomAndCheck() {
    //   if (phantomConnecting) return;
    //   setPhantomConnecting(true);

    //   try {
    //     // prefer phantom context
    //     if (!phantomCtx?.isInstalled) {
    //       notify.error("Phantom wallet not found. Install Phantom or use the onboarding page.");
    //       setPhantomConnecting(false);
    //       return;
    //     }

    //     if (typeof phantomCtx.connect === "function") {
    //       await phantomCtx.connect();
    //     } else if (window.solana?.connect) {
    //       await window.solana.connect();
    //     }

    //     const pk = phantomCtx?.address ?? (window.solana?.publicKey?.toString?.() ?? "");
    //     if (!pk) {
    //       notify.error("Failed to retrieve public key from Phantom.");
    //       setPhantomConnecting(false);
    //       return;
    //     }

    //     // do not write to localStorage — use validator context when possible
    //     let record = null;
    //     if (typeof checkValidatorByPublicKey === "function") {
    //       try {
    //         record = await checkValidatorByPublicKey(pk);
    //       } catch (err) {
    //         console.warn("checkValidatorByPublicKey failed:", err);
    //         record = null;
    //       }
    //     }

    //     if (record) {
    //       notify.success("Validator record found — redirecting to dashboard");
    //       if (typeof setValidatorInContext === "function") {
    //         try {
    //           setValidatorInContext(record);
    //         } catch (err) {
    //           /* ignore */
    //         }
    //       }
    //       setIsValidatorLocal(true);
    //       window.location.assign("/validator");
    //     } else {
    //       setIsValidatorLocal(false);
    //       notify.success("No validator record — redirecting to onboarding");
    //       window.location.assign("/become-validator");
    //     }
    //   } catch (err) {
    //     console.error("Phantom connect/check error:", err);
    //     notify.error("Error connecting or checking validator. Check console & backend/CORS.");
    //   } finally {
    //     setPhantomConnecting(false);
    //   }
    // }

    // const handleDisconnect = async () => {
    //   try {
    //     try {
    //       if (phantomCtx && typeof phantomCtx.disconnect === "function") {
    //         await phantomCtx.disconnect();
    //       } else if (window.solana && typeof window.solana.disconnect === "function") {
    //         await window.solana.disconnect();
    //       }
    //     } catch (err) {
    //       console.warn("Phantom disconnect failed:", err);
    //     }
    //     if (typeof setValidatorInContext === "function") {
    //       try {
    //         setValidatorInContext(null);
    //       } catch {}
    //     }
    //     setIsValidatorLocal(false);
    //     notify.success("Disconnected wallet and cleared validator state locally");
    //   } catch (err) {
    //     console.error("Disconnect error:", err);
    //     notify.error("Failed to disconnect wallet");
    //   }
    // };

    // Best-effort validators count (non-blocking)
    const [validatorsCount, setValidatorsCount] = useState<number | null>(null);
    useEffect(() => {
      let mounted = true;

      async function fetchValidatorsCount() {
        try {
          // attempt to get Clerk token (best-effort)
          let token: string | null = null;
          try {
            token = await getToken();
          } catch (err) {
            token = null;
          }

          const urlCandidates = [
            `${backendUrl}/api/v1/get-all-validator`
          ];

          for (const u of urlCandidates) {
            try {
              // prepare headers (include Authorization if token present)
              const headers: Record<string, string> = { Accept: "application/json" };
              if (token) headers.Authorization = `Bearer ${token}`;

              const r = await fetch(u, { credentials: "include", headers });
              if (!r.ok) continue;
              const j = await r.json().catch(() => null);
              if (!j) continue;

              if (Array.isArray(j)) {
                if (mounted) setValidatorsCount(j.length);
                return;
              }
              if (Array.isArray((j as any).validators)) {
                if (mounted) setValidatorsCount((j as any).validators.length);
                return;
              }
              if (typeof (j as any).count === "number") {
                if (mounted) setValidatorsCount((j as any).count);
                return;
              }

              // fallback: look for first array value in object
              if (typeof j === "object" && j !== null) {
                const maybeArray = Object.values(j).find(v => Array.isArray(v)) as any;
                if (Array.isArray(maybeArray)) {
                  if (mounted) setValidatorsCount(maybeArray.length);
                  return;
                }
              }
            } catch (err) {
              // try next candidate
              console.debug("validator count candidate failed:", u, err);
            }
          }

          // none worked
          if (mounted) setValidatorsCount(null);
        } catch (err) {
          console.debug("fetchValidatorsCount top-level error:", err);
          if (mounted) setValidatorsCount(null);
        }
      }

      // run once then poll
      void fetchValidatorsCount();
      const id = window.setInterval(() => { void fetchValidatorsCount(); }, 30_000);

      return () => {
        mounted = false;
        clearInterval(id);
      };
    }, [getToken]);

    const displayNodes = validatorsCount ?? nodesOnline;

    const navBgClass = isDark
      ? "bg-[#071025] bg-opacity-95 border-slate-800/40 shadow-2xl"
      : "bg-white/95 border-gray-200/60 shadow";

    return (
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out transform ${
          visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
        } ${navBgClass} backdrop-blur-md border-b`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div
              className="flex items-center space-x-3 cursor-pointer"
              title="Go home"
              onClick={() => {
                try {
                  window.location.assign("/");
                } catch {}
              }}
              role="button"
              aria-label="DecentWatch home"
            >
              <div className="relative">
                <Network className={`w-8 h-8 ${isDark ? "text-blue-300" : "text-blue-600"} animate-pulse`} />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
              </div>
              <span className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>DecentWatch</span>
            </div>

            <div className="flex items-center space-x-6">
              <div className={`hidden md:flex items-center space-x-2 px-3 py-1 rounded-full ${isDark ? "bg-emerald-900/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium">{displayNodes} Nodes Online</span>
              </div>

              <button
                onClick={() => {
                  try {
                    toggleTheme();
                  } catch {}
                }}
                aria-label="Toggle theme"
                className={`p-2 rounded-full transition-all duration-300 hover:scale-110 ${isDark ? "bg-yellow-400/10 text-yellow-300" : "bg-slate-100 text-slate-700"}`}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <div className="flex items-center gap-3">
                <SignedOut>
                  <SignInButton>
                    <button
                      className={`${isDark ? "px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-200 hover:bg-slate-600" : "px-4 py-2 rounded-lg text-sm font-medium bg-white text-slate-700 hover:bg-slate-50"}`}
                      onClick={() => window.location.assign("/tracker")}
                    >
                      Sign in
                    </button>
                  </SignInButton>

                  <SignUpButton>
                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white" onClick={() => window.location.assign("/tracker")}>
                      Sign up
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

  // UI classes that depend on theme (used below)
  const containerBg = isDark ? "bg-gradient-to-br from-[#071025] via-[#07172a] to-[#061028] text-white" : "bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50 text-slate-900";
  const cardBg = isDark ? "bg-[#07122a]/80 border border-white/6" : "bg-white/90 border border-gray-200";

  // text color helpers for better contrast in light/dark
  const primaryTextClass = isDark ? "text-white" : "text-gray-900";
  const secondaryTextClass = isDark ? "text-gray-300" : "text-gray-800";
  const mutedTextClass = isDark ? "text-gray-400" : "text-gray-700";

  return (
    <div className={`min-h-screen ${containerBg} pt-20 pb-12`}>
      <Toaster position="top-right" />

      {/* Navbar */}
      <Navbar isDark={isDark} toggleTheme={toggleTheme} nodesOnline={0} onGetStarted={() => window.location.assign("/get-started")} />

      {/* Page content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mt-8">
          <div className={`rounded-xl overflow-hidden shadow-2xl ${cardBg} p-6`}>
            <h1 className={`text-2xl sm:text-3xl font-bold mb-2 ${primaryTextClass}`}>Become a Validator</h1>
            <p className={`${secondaryTextClass} mb-6`}>
              Register a validator node by connecting your Phantom wallet or pasting your Solana public key.
              We'll store a lightweight record (public key, IP, location) so the network recognizes your node.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className={`block text-sm font-medium mb-2 ${mutedTextClass}`}>Solana public key</label>
                <div className="flex gap-3 items-center">
                  <input
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value.trim())}
                    placeholder="Paste your Solana public key here"
                    aria-label="Solana public key"
                    className={`flex-1 px-3 py-3 rounded-md border ${isDark ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-400" : "bg-white border-gray-200 text-slate-900 placeholder:text-gray-500"}`}
                  />
                  <button type="button" onClick={connectPhantom} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">
                    Connect Phantom
                  </button>
                </div>
                <p className={`mt-2 text-xs ${secondaryTextClass}`}>You can paste your public key or connect Phantom to auto-populate.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${mutedTextClass}`}>Detected IP</label>
                  <div className={`px-3 py-2 rounded-md ${isDark ? "bg-slate-800 text-white" : "bg-white text-slate-900"} border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    {loadingIp ? "Detecting..." : ip || "Not detected"}
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${mutedTextClass}`}>Detected location</label>
                  <div className={`px-3 py-2 rounded-md ${isDark ? "bg-slate-800 text-white" : "bg-white text-slate-900"} border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    {location || "Not detected"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-3 rounded-xl font-semibold ${submitting ? "opacity-60 cursor-not-allowed" : ""} bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg`}
                >
                  {submitting ? "Submitting..." : "Register as Validator"}
                </button>

                <button
                  type="button"
                  onClick={() => setPublicKey("")}
                  className={`px-4 py-3 rounded-lg border ${isDark ? "border-slate-700 text-white" : "border-gray-200 text-slate-900"}`}
                >
                  Clear
                </button>
              </div>

              <div className={`text-xs ${secondaryTextClass}`}>
                Note: This will create a Validator document in the database. The endpoint requires authentication — make sure you're signed in.
              </div>
            </form>
          </div>
        </div>

        {/* subtle footer spacing */}
        <div className="h-10" />
      </main>
    </div>
  );
}
