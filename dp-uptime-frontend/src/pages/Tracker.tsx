// src/pages/Tracker.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Globe, Plus, Moon, Sun, Trash2, Activity, Network } from 'lucide-react';
import { useWebsites } from '../hooks/useWebsites';
import axios from 'axios';
import { SignedIn, SignedOut, SignInButton, SignUpButton, useAuth, UserButton } from '@clerk/clerk-react';
import toast, { Toaster } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// <-- ADDED: import validator context hook (guarded usage)
import { useValidator } from '../context/validator';

const backendUrl = "http://localhost:5000";

type UptimeStatus = "good" | "bad" | "unknown";

function StatusCircle({ status }: { status: UptimeStatus }) {
  return (
    <div className={`w-3 h-3 rounded-full ${status === 'good' ? 'bg-green-500' : status === 'bad' ? 'bg-red-500' : 'bg-gray-400'}`} />
  );
}

function UptimeTicks({ ticks }: { ticks: UptimeStatus[] }) {
  return (
    <div className="flex gap-1 mt-2">
      {ticks.map((tick, index) => (
        <div
          key={index}
          className={`w-8 h-2 rounded ${tick === 'good' ? 'bg-green-500' : tick === 'bad' ? 'bg-red-500' : 'bg-gray-400'}`}
        />
      ))}
    </div>
  );
}

function CreateWebsiteModal({
  isOpen,
  isDark,
  onClose,
}: {
  isOpen: boolean;
  isDark: boolean;
  onClose: (url: string | null) => void;
}) {
  const [url, setUrl] = useState('');
  if (!isOpen) return null;

  const containerClass = isDark
    ? 'bg-[#071025] text-white'
    : 'bg-white text-gray-900';

  const inputClass = isDark
    ? 'w-full px-3 py-2 border border-slate-700 rounded-md bg-[#0b1724] text-white placeholder:text-slate-400'
    : 'w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder:text-gray-400';

  const cancelClass = isDark
    ? 'px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-md'
    : 'px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md';

  const addBtnClass = `${!url ? 'opacity-60 cursor-not-allowed' : ''} px-4 py-2 text-sm font-medium rounded-md text-white ${isDark ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`${containerClass} rounded-lg p-6 w-full max-w-md`}>
        <h2 className="text-xl font-semibold mb-4">Add New Website</h2>
        <div>
          <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>URL</label>
          <input
            type="url"
            className={inputClass}
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={() => onClose(null)}
            className={cancelClass}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={() => onClose(url)}
            className={addBtnClass}
            disabled={!url}
          >
            Add Website
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProcessedWebsite {
  id: string;
  url: string;
  status: UptimeStatus;
  uptimePercentage: number;
  lastChecked: string;
  uptimeTicks: UptimeStatus[];
  avgLatency: number;
  goodCount: number;
  badCount: number;
  latencyHistory: { time: string; latency: number }[];
  lastAlertAt?: string;
}

function WebsiteCard({ website, isDark }: { website: ProcessedWebsite; isDark: boolean }) {
  const deleteUrl = `${backendUrl}/api/v1/delete-website`;
  const { getToken } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const { refreshWebsites } = useWebsites();
  const [loading, setLoading] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLoading(true);
      const toastId = toast.loading('Deleting website...');
      const token = await getToken();
      await axios.delete(deleteUrl,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { id: website.id },
        });
      await refreshWebsites();
      toast.success('Website deleted', { id: toastId });
    } catch (err) {
      console.error('Delete failed', err);
      toast.error('Failed to delete website');
    } finally {
      setLoading(false);
    }
  };

  const cardBg = isDark ? 'bg-[#081224] text-white' : 'bg-white text-gray-900';
  const hoverBg = isDark ? 'hover:bg-[#081a2a]' : 'hover:bg-gray-50';
  const smallTextClass = isDark ? 'text-slate-300' : 'text-gray-600';

  return (
    <div className={`${cardBg} rounded-lg shadow-md overflow-hidden`}>
      <div
        className={`p-4 cursor-pointer flex items-center justify-between ${hoverBg}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-4 min-w-0">
          <StatusCircle status={website.status} />
          <div>
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>{website.url}</h3>
            <p className={`text-xs ${smallTextClass}`}>Avg latency: {website.avgLatency.toFixed(0)} ms</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className={`text-sm ${smallTextClass}`}>
            {website.uptimePercentage.toFixed(1)}% uptime
          </span>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 flex-none bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1 rounded"
            aria-label={`Delete ${website.url}`}
            disabled={loading}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          {isExpanded ? (
            <ChevronUp className={`w-5 h-5 ${isDark ? 'text-slate-300' : 'text-gray-500'}`} />
          ) : (
            <ChevronDown className={`w-5 h-5 ${isDark ? 'text-slate-300' : 'text-gray-500'}`} />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={`px-4 pb-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
          <div className="mt-3">
            <p className={`text-sm mb-1 ${smallTextClass}`}>Last 30 minutes status:</p>
            <UptimeTicks ticks={website.uptimeTicks} />
          </div>

          <div className={`mt-4 grid grid-cols-2 gap-4 text-sm ${smallTextClass}`}>
            <div>✅ Good checks: {website.goodCount}</div>
            <div>❌ Bad checks: {website.badCount}</div>
            {website.lastAlertAt && (
              <div className="col-span-2 text-xs text-slate-400">
                Last alert sent: {website.lastAlertAt}
              </div>
            )}
          </div>

          {/* Latency trend chart */}
          <div className="mt-4">
            <p className={`text-sm mb-1 flex items-center gap-2 ${smallTextClass}`}>
              <Activity className="w-4 h-4" /> Latency (last 30 min)
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={website.latencyHistory}>
                <XAxis dataKey="time" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="latency" stroke="#3b82f6" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className={`text-xs mt-2 ${smallTextClass}`}>
            Last checked: {website.lastChecked}
          </p>
        </div>
      )}
    </div>
  );
}

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

  // Inline style fallback already handled earlier; here keep class variants but use isDark boolean
  const navBgClass = isDark
    ? 'bg-[#071025] bg-opacity-95 border-slate-800/40 shadow-2xl'
    : 'bg-white/95 border-gray-200/60 shadow';

  // <-- ADDED: read validator context values (non-invasive)
  const { validator, pendingPayoutsSol, setValidator: setValidatorInContext } = (() => {
    try {
      return useValidator();
    } catch {
      // If context isn't provided, return safe defaults
      return { validator: null, pendingPayoutsSol: null, setValidator: undefined } as any;
    }
  })();

  // helper to disconnect validator locally
  const handleDisconnectValidator = async () => {
    try {
      // clear local storage
      try { localStorage.removeItem("validatorPublicKey"); } catch {}
      // call possible wallet disconnect
      try {
        if (window.solana && typeof window.solana.disconnect === 'function') {
          await window.solana.disconnect();
        }
      } catch (err) {
        console.warn("Phantom disconnect failed:", err);
      }
      // clear validator in context if function exists
      if (typeof setValidatorInContext === "function") {
        try {
          setValidatorInContext(null);
        } catch (err) {
          console.warn("setValidatorInContext failed:", err);
        }
      }
      toast.success("Wallet disconnected (local state cleared)");
    } catch (err) {
      console.error("Disconnect failed:", err);
      toast.error("Failed to disconnect");
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out transform ${
        visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
      } ${navBgClass} backdrop-blur-md border-b`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Network className={`w-8 h-8 ${isDark ? "text-blue-300" : "text-blue-600"} animate-pulse`} />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
            </div>
            <span
              className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}
            >
              DecentWatch
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-6">
            <div className={`hidden md:flex items-center space-x-2 px-3 py-1 rounded-full ${isDark ? 'bg-emerald-900/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">{nodesOnline} Nodes Online</span>
            </div>

            <button
              onClick={() => {
                try {
                  toggleTheme();
                } catch {
                  // ignore
                }
              }}
              aria-label="Toggle theme"
              className={`p-2 rounded-full transition-all duration-300 hover:scale-110 ${isDark ? 'bg-yellow-400/10 text-yellow-300' : 'bg-slate-100 text-slate-700'}`}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              onClick={() => {
                try {
                  if (typeof onGetStarted === "function") onGetStarted();
                } catch {
                  // ignore
                }
                window.location.assign("/tracker");
              }}
              className="px-6 py-2 rounded-full font-medium transition-all duration-300 hover:scale-105 shadow-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"
            >
              Get Started
            </button>

            {/* Validator payout badge or disconnect button */}
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
            ) : (
              // If no validator, show nothing extra here — Dashboard / Become Validator flow will handle onboarding
              null
            )}

            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton>
                  <button
                    className={`${isDark ? 'px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-200 hover:bg-slate-600' : 'px-4 py-2 rounded-lg text-sm font-medium bg-white text-slate-700 hover:bg-slate-50'}`}
                    type="button"
                    onClick={() => window.location.assign("/tracker")}
                  >
                    Sign in
                  </button>
                </SignInButton>

                <SignUpButton>
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                    type="button"
                    onClick={() => window.location.assign("/tracker")}
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

export default function App(): JSX.Element {
  // THEME PERSISTENCE: read initial theme from localStorage if present
  const savedTheme = (() => {
    try {
      return localStorage.getItem("theme");
    } catch {
      return null;
    }
  })();

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (savedTheme === "dark") return true;
    if (savedTheme === "light") return false;
    // fallback: check prefers-color-scheme
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return true;
    }
    return false;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  // assume hook shape; cast to avoid TS errors if hook types are unknown
  const { websites, refreshWebsites } = useWebsites() as { websites?: any[]; refreshWebsites: () => Promise<void> };
  const { getToken } = useAuth();

  // <-- ADDED: use validator context here as well (read-only usage, non-invasive)
  const { validator } = (() => {
    try {
      return useValidator();
    } catch {
      return { validator: null } as any;
    }
  })();

  // UI state so the user can see what's happening
  const [loadingWebsites, setLoadingWebsites] = useState<boolean>(true);
  const [websitesError, setWebsitesError] = useState<string | null>(null);

  // ensure websites are fetched at mount (common reason for empty page)
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoadingWebsites(true);
      setWebsitesError(null);
      try {
        if (refreshWebsites) {
          await refreshWebsites();
        } else {
          console.warn('refreshWebsites not provided by useWebsites hook');
        }
      } catch (err: any) {
        console.error('Failed to refresh websites:', err);
        if (mounted) setWebsitesError(String(err?.message ?? err ?? 'Unknown error'));
      } finally {
        if (mounted) setLoadingWebsites(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [refreshWebsites]);

  const processedWebsites: ProcessedWebsite[] | undefined = useMemo(() => {
    if (!websites) return undefined;
    return websites.map((website: any) => {
      const sortedTicks = [...(website.ticks || [])].sort((a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const recentTicks = sortedTicks.filter((tick: any) => new Date(tick.createdAt) > thirtyMinutesAgo);

      const windows: UptimeStatus[] = [];
      for (let i = 0; i < 10; i++) {
        const windowStart = new Date(Date.now() - (i + 1) * 3 * 60 * 1000);
        const windowEnd = new Date(Date.now() - i * 3 * 60 * 1000);
        const windowTicks = recentTicks.filter((tick: any) => {
          const tickTime = new Date(tick.createdAt);
          return tickTime >= windowStart && tickTime < windowEnd;
        });
        const upTicks = windowTicks.filter((tick: any) => String(tick.status).toLowerCase() === 'good').length;
        windows[9 - i] =
          windowTicks.length === 0
            ? "unknown"
            : upTicks / windowTicks.length >= 0.5
            ? "good"
            : "bad";
      }

      const totalTicks = sortedTicks.length;
      const goodCount = sortedTicks.filter((t: any) => String(t.status).toLowerCase() === "good").length;
      const badCount = sortedTicks.filter((t: any) => String(t.status).toLowerCase() === "bad").length;
      const uptimePercentage = totalTicks === 0 ? 100 : (goodCount / totalTicks) * 100;

      const avgLatency =
        recentTicks.length === 0
          ? 0
          : recentTicks.reduce((sum: number, t: any) => sum + (t.latency || 0), 0) / recentTicks.length;

      const latencyHistory = recentTicks.map((t: any) => ({
        time: new Date(t.createdAt).toLocaleTimeString(),
        latency: t.latency || 0,
      }));

      const currentStatus = windows[windows.length - 1] || 'unknown';
      const lastChecked = sortedTicks[0]
        ? new Date(sortedTicks[0].createdAt).toLocaleTimeString()
        : "Never";

      return {
        id: website.id,
        url: website.url,
        status: currentStatus,
        uptimePercentage,
        lastChecked,
        uptimeTicks: windows,
        avgLatency,
        goodCount,
        badCount,
        latencyHistory,
        lastAlertAt: website.lastAlertAt || undefined,
      } as ProcessedWebsite;
    });
  }, [websites]);

  // sync a light/dark class on <html> for any other global styles and persist the preference
  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem("theme", "light");
      }
    } catch {
      // localStorage might be unavailable — ignore
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode((s) => !s);

  // page-level backgrounds dependent on theme
  const pageBg = isDarkMode
    ? 'bg-gradient-to-br from-[#071025] via-[#07172a] to-[#061028]'
    : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50';

  const pageTextColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const headerTextColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const addBtnClass = isDarkMode ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white';

  return (
    <>
      <Navbar isDark={isDarkMode} toggleTheme={toggleTheme} nodesOnline={processedWebsites?.length ?? 0} onGetStarted={() => window.location.assign("/get-started")} />

      <div className={`min-h-screen transition-colors duration-200 pt-20 ${pageBg}`}>
        <Toaster position="top-right" />
        <div className="max-w-4xl mx-auto py-8 px-4">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-2">
              <Globe className={`w-8 h-8 ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`} />
              <h1 className={`text-2xl font-bold ${headerTextColor}`}>Uptime Monitor</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsModalOpen(true)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200 ${addBtnClass}`}
              >
                <Plus className="w-4 h-4" />
                <span>Add Website</span>
              </button>
            </div>
          </div>

          {/* Loading / error / empty states */}
          {loadingWebsites ? (
            <div className={`py-20 text-center ${isDarkMode ? 'text-slate-300' : 'text-gray-500'}`}>Loading websites...</div>
          ) : websitesError ? (
            <div className="py-20 text-center text-red-500">
              <div>Failed to load websites: {websitesError}</div>
              <div className="mt-4">
                <button
                  onClick={async () => {
                    setLoadingWebsites(true);
                    setWebsitesError(null);
                    try {
                      await refreshWebsites();
                    } catch (err: any) {
                      console.error('Retry fetch failed', err);
                      setWebsitesError(String(err?.message ?? err ?? 'Unknown error'));
                    } finally {
                      setLoadingWebsites(false);
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !processedWebsites || processedWebsites.length === 0 ? (
            <div className={`py-20 text-center ${isDarkMode ? 'text-slate-300' : 'text-gray-500'}`}>
              No websites yet. Click <button className="underline" onClick={() => setIsModalOpen(true)}>Add Website</button> to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {processedWebsites.map(website => (
                <WebsiteCard key={website.id} website={website} isDark={isDarkMode} />
              ))}
            </div>
          )}
        </div>

        <CreateWebsiteModal
          isOpen={isModalOpen}
          isDark={isDarkMode}
          onClose={async (url) => {
            if (!url) {
              setIsModalOpen(false);
              return;
            }
            let toastId: string | number | undefined;
            try {
              toastId = toast.loading('Adding website...');
              const token = await getToken();
              setIsModalOpen(false);
              await axios.post(
                `${backendUrl}/api/v1/create-website`,
                { url },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              await refreshWebsites();
              toast.success('Website added', { id: toastId });
            } catch (error) {
              console.error("Error creating website:", error);
              toast.error('Failed to add website', { id: toastId });
            }
          }}
        />
      </div>
    </>
  );
}
