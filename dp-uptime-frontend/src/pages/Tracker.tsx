// src/pages/Tracker.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Globe, Plus, Moon, Sun, Trash2, Activity, Network } from 'lucide-react';
import { useWebsites } from '../hooks/useWebsites';
import axios from 'axios';
import { SignedIn, SignedOut, SignInButton, SignUpButton, useAuth, UserButton, useUser } from '@clerk/clerk-react';
import toast, { Toaster } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useValidator } from '../context/validator';

// ---------- safe env helper ----------
declare global {
  interface Window { __ENV__?: Record<string, string>; __env__?: Record<string, string>; }
}

/**
 * getClientEnv tries:
 * 1. Vite import.meta.env (VITE_ prefix)
 * 2. CRA / Webpack process.env (REACT_APP_ prefix) — guarded with typeof process check
 * 3. runtime injected window.__ENV__ / window.__env__
 * Falls back to provided fallback.
 */
function getClientEnv(name: string, fallback: string) {
  // 1) Vite (import.meta.env)
  try {
    const viteKey = `VITE_${name}`;
    const im = (import.meta as any)?.env;
    if (im && typeof im[viteKey] === 'string' && im[viteKey] !== '') return im[viteKey];
  } catch { /* ignore */ }

  // 2) CRA / Webpack (process.env)
  try {
    if (typeof process !== 'undefined' && (process.env as any)) {
      const craKey = `REACT_APP_${name}`;
      if ((process.env as any)[craKey]) return (process.env as any)[craKey];
    }
  } catch { /* ignore */ }

  // 3) Runtime injection (window.__ENV__ or window.__env__)
  try {
    const w = (window as any).__ENV__ ?? (window as any).__env__;
    if (w && typeof w === 'object') {
      if (w[`VITE_${name}`]) return w[`VITE_${name}`];
      if (w[`REACT_APP_${name}`]) return w[`REACT_APP_${name}`];
      if (w[name]) return w[name];
    }
  } catch { /* ignore */ }

  return fallback;
}

// ---------- Config (use the helper) ----------
const BACKEND_URL = getClientEnv('BACKEND_URL', 'http://localhost:5000');
const TREASURY_ADDRESS = getClientEnv('TREASURY_ADDRESS', 'GDSo5N8RQoRu8asoUNEuDhXSVGYdNBafjsEJ3BoNPd7F');
const SOLANA_NETWORK = getClientEnv('SOLANA_NETWORK', 'devnet');

// ----- helper types -----
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

// ----------------- CreateWebsiteModal (Pay & Upload) -----------------
function CreateWebsiteModal({
  isOpen,
  isDark,
  onClose,
  connection,
  walletPublicKey,
  getToken,
}: {
  isOpen: boolean;
  isDark: boolean;
  onClose: (url: string | null) => void;
  connection: Connection;
  walletPublicKey: string | null;
  getToken?: () => Promise<string>;
}) {
  const [url, setUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const lamportsToSend = Math.round(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL

  useEffect(() => {
    if (!isOpen) {
      setUrl('');
      setProcessing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const containerClass = isDark ? 'bg-[#071025] text-white' : 'bg-white text-gray-900';
  const inputClass = isDark ? 'w-full px-3 py-2 border border-slate-700 rounded-md bg-[#0b1724] text-white placeholder:text-slate-400' : 'w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder:text-gray-400';
  const cancelClass = isDark ? 'px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-md' : 'px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md';
  const addBtnClass = `${!url ? 'opacity-60 cursor-not-allowed' : ''} px-4 py-2 text-sm font-medium rounded-md text-white ${isDark ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'}`;

  const performPayAndUpload = async () => {
    if (!url) return;
    if (!walletPublicKey) {
      toast.error('Connect your wallet first to pay.');
      return;
    }

    try {
      setProcessing(true);
      const provider = (window as any).solana;
      if (!provider) throw new Error('No Solana wallet provider found (install Phantom).');

      const payerPubkey = new PublicKey(walletPublicKey);
      const treasuryPubkey = new PublicKey(TREASURY_ADDRESS);

      // Prevent accidental misuse: payer must not be the treasury address
      if (payerPubkey.toString() === treasuryPubkey.toString()) {
        toast.error('Your wallet public key equals the treasury address — connect the correct wallet.');
        console.error('Aborting: payerPublicKey === TREASURY_ADDRESS', { payerPublicKey: payerPubkey.toString() });
        return;
      }

      // Build transfer transaction
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payerPubkey,
          toPubkey: treasuryPubkey,
          lamports: lamportsToSend,
        })
      );

      // Attach recent blockhash & fee payer
      const latest = await connection.getLatestBlockhash('finalized');
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = payerPubkey;

      let txSignature: string | null = null;

      // Preferred modern Phantom API
      if (typeof provider.signAndSendTransaction === 'function') {
        const signedResult = await provider.signAndSendTransaction(tx as any);
        // provider may return { signature } or the signature string
        txSignature = signedResult?.signature ?? (signedResult as any) ?? null;
      } else if (typeof provider.signTransaction === 'function') {
        const signedTx = await provider.signTransaction(tx);
        const raw = signedTx.serialize();
        txSignature = await connection.sendRawTransaction(raw);
      } else {
        throw new Error('Wallet does not support required signing methods.');
      }

      if (!txSignature) throw new Error('Failed to obtain transaction signature from wallet');

      // debug logs to help troubleshooting
      console.log('TX signature:', txSignature);
      console.log('Payer public key (wallet):', payerPubkey.toString());
      console.log('Treasury address:', treasuryPubkey.toString());
      console.log('Expected lamports to send:', lamportsToSend);

      // Wait for finalization (stronger than 'confirmed')
      try {
        await connection.confirmTransaction(txSignature, 'finalized');
      } catch (e) {
        // continue — we'll poll for parsed tx below
        console.warn('confirmTransaction warning, continuing to poll parsed tx', e);
      }

      // Poll for parsed transaction to be indexed by RPC (backend uses getParsedTransaction)
      const waitForParsed = async (sig: string, timeoutMs = 20000, intervalMs = 800) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const parsed = await connection.getParsedTransaction(sig, 'finalized');
            if (parsed && parsed.meta) return parsed;
          } catch (err) {
            // ignore and retry
            console.debug('getParsedTransaction attempt failed', err);
          }
          await new Promise((r) => setTimeout(r, intervalMs));
        }
        return null;
      };

      const parsed = await waitForParsed(txSignature, 20000, 800);
      if (!parsed) {
        // parsed tx isn't available yet; server may retry — warn the user minimally
        console.warn('Parsed transaction not available yet; backend may retry. Proceeding to POST the signature.');
      } else {
        // show parsed summary in console for debugging
        console.log('Parsed tx (summary):', {
          instructions: parsed.transaction?.message?.instructions,
          innerInstructionsCount: Array.isArray(parsed.meta?.innerInstructions) ? parsed.meta.innerInstructions.length : 0,
          preBalances: parsed.meta?.preBalances,
          postBalances: parsed.meta?.postBalances,
          accountKeys: parsed.transaction?.message?.accountKeys?.map((k: any) => (typeof k === 'string' ? k : k.pubkey?.toString?.() ?? String(k)))
        });
      }

      // POST to backend (send signature string + payer public key)
      const token = getToken ? await safeGetToken(getToken) : null;
      await axios.post(
        `${BACKEND_URL}/api/v1/create-website`,
        { url, txSignature, payerPublicKey: payerPubkey.toString() },
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );

      toast.success('Payment successful and website uploaded.');
      onClose(url);
    } catch (err: any) {
      console.error('Payment/upload failed', err);
      toast.error(err?.message ?? 'Payment or upload failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`${containerClass} rounded-lg p-6 w-full max-w-md`}>
        <h2 className="text-xl font-semibold mb-4">Pay & Upload Website (0.1 SOL)</h2>
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
          <button type="button" onClick={() => onClose(null)} className={cancelClass} disabled={processing}>Cancel</button>
          <button
            type="button"
            onClick={performPayAndUpload}
            className={addBtnClass}
            disabled={!url || processing}
          >
            {processing ? 'Processing...' : 'Pay 0.1 SOL & Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// safe getToken (wrap)
async function safeGetToken(getToken?: () => Promise<string>) {
  try {
    if (!getToken) return null;
    return await getToken();
  } catch {
    return null;
  }
}

// ----------------- WebsiteCard & Navbar (only slight changes) -----------------
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
  const deleteUrl = `${BACKEND_URL}/api/v1/delete-website`;
  const { getToken } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const { refreshWebsites } = useWebsites();
  const [loading, setLoading] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLoading(true);
      const toastId = toast.loading('Deleting website...');
      const token = await safeGetToken(getToken);
      await axios.delete(deleteUrl,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

// ----------------- Navbar -----------------
function Navbar({
  isDark,
  toggleTheme,
  nodesOnline = 0,
  onGetStarted,
  walletPublicKey,
  connectWallet,
  disconnectWallet,
}: {
  isDark: boolean;
  toggleTheme: () => void;
  nodesOnline?: number;
  onGetStarted?: () => void;
  walletPublicKey?: string | null;
  connectWallet?: () => Promise<void>;
  disconnectWallet?: () => Promise<void>;
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

  const navBgClass = isDark ? 'bg-[#071025] bg-opacity-95 border-slate-800/40 shadow-2xl' : 'bg-white/95 border-gray-200/60 shadow';

  // read validator context safely
  const { validator, pendingPayoutsSol, setValidator: setValidatorInContext } = (() => {
    try {
      return useValidator();
    } catch {
      return { validator: null, pendingPayoutsSol: null, setValidator: undefined } as any;
    }
  })();

  // safe useUser access (Clerk)
  const userHook = (() => {
    try {
      // ensure useUser is imported from @clerk/clerk-react in the file where you place this Navbar
      return (useUser as any)();
    } catch {
      return undefined as any;
    }
  })();
  const isSignedIn = !!userHook?.isSignedIn;

  // handlers that enforce sign-in
  const handleConnectClick = async () => {
    if (!isSignedIn) {
      toast.error("Please sign in first.");
      return;
    }
    if (!connectWallet) {
      toast.error("Connect handler not available.");
      return;
    }
    try {
      await connectWallet();
    } catch (err) {
      console.error("connectWallet failed:", err);
      toast.error("Failed to connect wallet.");
    }
  };

  const handleDisconnectClick = async () => {
    if (!disconnectWallet) {
      toast.error("Disconnect handler not available.");
      return;
    }
    try {
      await disconnectWallet();
    } catch (err) {
      console.error("disconnectWallet failed:", err);
      toast.error("Failed to disconnect wallet.");
    }
  };

  const handleDisconnectValidator = async () => {
    try {
      try { localStorage.removeItem("validatorPublicKey"); } catch {}
      try {
        if (typeof window !== "undefined" && (window as any).solana && typeof (window as any).solana.disconnect === 'function') {
          await (window as any).solana.disconnect();
        }
      } catch (err) {
        console.warn("Phantom disconnect failed:", err);
      }
      if (typeof setValidatorInContext === "function") {
        try { setValidatorInContext(null); } catch {}
      }
      toast.success("Wallet disconnected (local state cleared)");
    } catch (err) {
      console.error("Disconnect failed:", err);
      toast.error("Failed to disconnect");
    }
  };

  // runtime detection for Phantom (safe)
  const hasPhantom = typeof window !== "undefined" && !!((window as any).solana && (window as any).solana.isPhantom);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out transform ${visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"} ${navBgClass} backdrop-blur-md border-b`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div
            className="flex items-center space-x-3 cursor-pointer"
            role="button"
            title="Go home"
            onClick={() => { try { window.location.assign('/'); } catch {} }}
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
              onClick={() => { try { toggleTheme(); } catch {} }}
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

            {/* Wallet connect UI */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center space-x-2">
                { hasPhantom ? (
                  walletPublicKey ? (
                    <>
                      <div className="text-sm px-3 py-1 rounded-full bg-slate-800/30 text-slate-200">
                        {walletPublicKey.slice(0,4)}...{walletPublicKey.slice(-4)}
                      </div>
                      <button
                        onClick={handleDisconnectClick}
                        className="px-3 py-1 rounded-md text-sm font-medium bg-white text-slate-700 border"
                        type="button"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleConnectClick}
                      className="px-3 py-1 rounded-md text-sm font-medium bg-blue-600 text-white"
                      type="button"
                    >
                      Connect Wallet
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => window.open('https://phantom.app/', '_blank')}
                    className="px-3 py-1 rounded-md text-sm font-medium bg-slate-100 text-slate-700"
                    type="button"
                  >
                    Install Phantom
                  </button>
                )}
              </div>

              <SignedOut>
                <SignInButton>
                  <button className={`${isDark ? 'px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-200 hover:bg-slate-600' : 'px-4 py-2 rounded-lg text-sm font-medium bg-white text-slate-700 hover:bg-slate-50'}`} type="button" onClick={() => window.location.assign("/tracker")}>Sign in</button>
                </SignInButton>

                <SignUpButton>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm" type="button" onClick={() => window.location.assign("/tracker")}>Sign up</button>
                </SignUpButton>
              </SignedOut>

              <SignedIn>
                <div className="ml-1"><UserButton afterSignOutUrl="/" /></div>
              </SignedIn>

            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}


// ----------------- Main App page -----------------
export default function App(): JSX.Element {
  // THEME PERSISTENCE:
  const savedTheme = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (savedTheme === "dark") return true;
    if (savedTheme === "light") return false;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return true;
    }
    return false;
  });

  // websites hook
  const { websites, refreshWebsites } = useWebsites() as { websites?: any[]; refreshWebsites: () => Promise<void> };

  // Clerk auth
  const auth = (() => { try { return useAuth(); } catch { return undefined as any; } })();
  const getToken = auth?.getToken;

  // Validator context usage
  const { validator } = (() => { try { return useValidator(); } catch { return { validator: null } as any; } })();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingWebsites, setLoadingWebsites] = useState<boolean>(true);
  const [websitesError, setWebsitesError] = useState<string | null>(null);

  // Solana connection & wallet state
  const connection = useMemo(() => new Connection(clusterApiUrl(SOLANA_NETWORK), 'confirmed'), []);

  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);

  useEffect(() => {
    try {
      const p = (window as any).solana;
      if (p && p.isPhantom) {
        p.on && p.on('connect', (pk: any) => setWalletPublicKey(pk.toString()));
        p.on && p.on('disconnect', () => setWalletPublicKey(null));
        if (p.isConnected) {
          setWalletPublicKey(p.publicKey?.toString() ?? null);
        }
      }
    } catch {}
  }, []);

  const connectWallet = async () => {
    try {
      setWalletConnecting(true);
      const provider = (window as any).solana;
      if (!provider) {
        toast.error('No Solana wallet available (install Phantom).');
        return;
      }
      const resp = await provider.connect();
      setWalletPublicKey(resp.publicKey?.toString() ?? null);
      toast.success('Wallet connected');
    } catch (err) {
      console.error('connectWallet', err);
      toast.error('Failed to connect wallet');
    } finally {
      setWalletConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      const provider = (window as any).solana;
      if (provider?.disconnect) {
        await provider.disconnect();
      }
      setWalletPublicKey(null);
      toast.success('Wallet disconnected');
    } catch (err) {
      console.warn('disconnect failed', err);
      setWalletPublicKey(null);
    }
  };

  // validators count fetch (keeps original behavior)
  const [validatorsCount, setValidatorsCount] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    async function fetchValidatorsCount() {
      try {
        let token: string | null = null;
        try { if (typeof getToken === "function") token = await getToken(); } catch { token = null; }
        const urlCandidates = [`${BACKEND_URL}/api/v1/get-all-validator`];
        for (const u of urlCandidates) {
          try {
            const headers: Record<string, string> = { Accept: "application/json" };
            if (token) headers.Authorization = `Bearer ${token}`;
            const r = await fetch(u, { credentials: "include", headers });
            if (!r.ok) continue;
            const j = await r.json().catch(() => null);
            if (!j) continue;
            if (Array.isArray(j)) { if (mounted) setValidatorsCount(j.length); return; }
            if (Array.isArray((j as any).validators)) { if (mounted) setValidatorsCount((j as any).validators.length); return; }
            if (typeof (j as any).count === "number") { if (mounted) setValidatorsCount((j as any).count); return; }
            if (typeof j === "object" && j !== null) {
              const maybeArray = Object.values(j).find(v => Array.isArray(v)) as any;
              if (Array.isArray(maybeArray)) { if (mounted) setValidatorsCount(maybeArray.length); return; }
            }
          } catch (err) { console.debug("validator count candidate failed:", u, err); }
        }
        if (mounted) setValidatorsCount(null);
      } catch (err) { console.debug("fetchValidatorsCount top-level error:", err); if (mounted) setValidatorsCount(null); }
    }

    void fetchValidatorsCount();
    const id = window.setInterval(() => { void fetchValidatorsCount(); }, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, [getToken]);

  // fetch websites at mount
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
    return () => { mounted = false; };
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

  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem("theme", "light");
      }
    } catch {}
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode((s) => !s);

  const pageBg = isDarkMode ? 'bg-gradient-to-br from-[#071025] via-[#07172a] to-[#061028]' : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50';
  const headerTextColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const addBtnClass = isDarkMode ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white';

  const nodesOnlineToShow = validatorsCount ?? (processedWebsites?.length ?? 0);

  return (
    <>
      <Navbar
        isDark={isDarkMode}
        toggleTheme={toggleTheme}
        nodesOnline={nodesOnlineToShow}
        onGetStarted={() => window.location.assign("/get-started")}
        walletPublicKey={walletPublicKey}
        connectWallet={connectWallet}
        disconnectWallet={disconnectWallet}
      />

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
                <span>Pay & Upload</span>
              </button>
            </div>
          </div>

          {loadingWebsites ? (
            <div className={`py-20 text-center ${isDarkMode ? 'text-slate-300' : 'text-gray-500'}`}>Loading websites...</div>
          ) : websitesError ? (
            <div className="py-20 text-center text-red-500">
              <div>Failed to load websites: {websitesError}</div>
              <div className="mt-4">
                <button onClick={async () => { setLoadingWebsites(true); setWebsitesError(null); try { await refreshWebsites(); } catch (err: any) { console.error('Retry fetch failed', err); setWebsitesError(String(err?.message ?? err ?? 'Unknown error')); } finally { setLoadingWebsites(false); } }} className="px-4 py-2 bg-blue-600 text-white rounded">Retry</button>
              </div>
            </div>
          ) : !processedWebsites || processedWebsites.length === 0 ? (
            <div className={`py-20 text-center ${isDarkMode ? 'text-slate-300' : 'text-gray-500'}`}>
              No websites yet. Click <button className="underline" onClick={() => setIsModalOpen(true)}>Pay & Upload</button> to get started.
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
            setIsModalOpen(false);
            if (url) {
              try { await refreshWebsites(); } catch (err) { console.error(err); }
            }
          }}
          connection={connection}
          walletPublicKey={walletPublicKey}
          getToken={getToken}
        />
      </div>
    </>
  );
}
