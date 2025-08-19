// src/pages/Validator.tsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { useAuth } from "@clerk/clerk-react";
const backendUrl = "http://localhost:5000";

declare global {
  interface Window {
    solana?: any; // Phantom wallet (basic typing)
  }
}

// <-- ADDED: import your validator context hook (adjust path if needed)
import { useValidator } from "../context/validator";

export default function AutheticateValidator(): JSX.Element {
  const { getToken } = useAuth();
  const [publicKey, setPublicKey] = useState<string>("");
  const [ip, setIp] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [loadingIp, setLoadingIp] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // read context (guarded)
  const validatorCtx = (() => {
    try {
      return useValidator();
    } catch {
      return undefined as any;
    }
  })();

  const checkValidatorByPublicKey = validatorCtx?.checkValidatorByPublicKey;
  const registerValidatorInContext = validatorCtx?.registerValidator;
  const setValidatorInContext = validatorCtx?.setValidator ?? validatorCtx?.setLocalValidator;

  useEffect(() => {
    const fetchIpInfo = async () => {
      try {
        setLoadingIp(true);
        const res = await fetch("https://ipapi.co/json/");
        if (!res.ok) throw new Error(`ipapi returned ${res.status}`);
        const data = await res.json();
        setIp(data.ip || "");
        const city = data.city || "";
        const region = data.region || "";
        const country = data.country_name || data.country || "";
        setLocation([city, region, country].filter(Boolean).join(", ") || "Unknown");
      } catch (err) {
        console.warn("Failed to fetch IP/location:", err);
        setIp("");
        setLocation("");
      } finally {
        setLoadingIp(false);
      }
    };

    fetchIpInfo();
  }, []);

  const connectPhantom = async () => {
    try {
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
        toast.error("No public key returned");
      }
    } catch (err: any) {
      console.error("Phantom connect error:", err);
      toast.error(err?.message || "Failed to connect wallet");
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!publicKey) {
      toast.error("Please provide a Solana public key (connect Phantom or paste it).");
      return;
    }

    setSubmitting(true);
    try {
      // OPTIONAL PRE-CHECK: if context provides a check function, use it to see if validator already exists.
      // If found, skip creating and redirect with success toast. If the check errors with 401, treat as auth issue and don't redirect.
      if (typeof checkValidatorByPublicKey === "function") {
        try {
          const existing = await checkValidatorByPublicKey(publicKey);
          if (existing) {
            // Save locally for flows that rely on this key
            try {
              localStorage.setItem("validatorPublicKey", publicKey);
            } catch (err) {
              // ignore localStorage errors
              // eslint-disable-next-line no-console
              console.warn("localStorage write failed:", err);
            }

            // Try to populate context so UI updates (best-effort)
            if (typeof setValidatorInContext === "function") {
              try {
                setValidatorInContext(existing);
              } catch (err) {
                console.warn("setValidatorInContext failed when pre-checking:", err);
              }
            }

            toast.success("Validator already registered — redirecting...");
            setTimeout(() => {
              window.location.assign("/validator");
            }, 600);

            // early return - finally block will clear submitting
            return;
          }
        } catch (err: any) {
          // If check returned 401, show an auth message and don't redirect; otherwise log and continue to creation attempt.
          if (err?.response?.status === 401) {
            toast.error("Unauthorized while checking validator. Please sign in and try again.");
            setSubmitting(false);
            return;
          }
          // non-fatal: log and continue to attempt creation (server will respond appropriately).
          // eslint-disable-next-line no-console
          console.warn("checkValidatorByPublicKey failed during submit pre-check:", err);
        }
      }

      // get auth token (Clerk). Adjust if you use a different auth system.
      let token: string | null = null;
      try {
        token = await getToken();
      } catch (err) {
        console.warn("getToken failed or user not signed in:", err);
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

      // POST to create validator
      const res = await axios.post(`${backendUrl}/api/v1/create-validator`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      // If backend indicates success (201 or 200), proceed to save and redirect.
      if (res && (res.status === 201 || res.status === 200)) {
        try {
          localStorage.setItem("validatorPublicKey", publicKey);
        } catch {
          // ignore storage errors
        }

        // Try to update validator context — best effort
        try {
          if (typeof checkValidatorByPublicKey === "function") {
            const v = await checkValidatorByPublicKey(publicKey);
            if (v && typeof setValidatorInContext === "function") {
              try {
                setValidatorInContext(v);
              } catch (err) {
                console.warn("setValidatorInContext failed:", err);
              }
            }
          } else if (typeof registerValidatorInContext === "function") {
            try {
              const v = await registerValidatorInContext(payload);
              if (v && typeof setValidatorInContext === "function") {
                try {
                  setValidatorInContext(v);
                } catch (err) {
                  console.warn("setValidatorInContext failed after register:", err);
                }
              }
            } catch (err) {
              console.warn("registerValidatorInContext call failed (ignored):", err);
            }
          }
        } catch (err) {
          console.warn("Validator context sync error (non-fatal):", err);
        }

        toast.success("Validator registered successfully — redirecting...");
        setTimeout(() => {
          window.location.assign("/validator");
        }, 600);
        return;
      } else {
        // If server returned something else (no success code), show message but don't redirect.
        toast.error(`Server returned status ${res?.status}. Not redirecting.`);
        return;
      }
    } catch (err: any) {
      console.error("Failed to create validator:", err?.response?.data ?? err?.message ?? err);

      // If backend indicates unauthorized, show message and DO NOT redirect
      if (err?.response?.status === 401) {
        toast.error("Unauthorized: your token is invalid or expired. Please sign in again.");
        setSubmitting(false);
        return;
      }

      // If backend indicates the validator already exists (commonly 409 or custom message),
      // treat that as a success case for UX (user already registered) and redirect.
      const status = err?.response?.status;
      const respData = err?.response?.data;
      const messageStr =
        (typeof respData === "string" && respData) ||
        (respData && (respData.message || respData.error || JSON.stringify(respData))) ||
        err?.message;

      const alreadyExists =
        status === 409 ||
        (typeof messageStr === "string" && messageStr.toLowerCase().includes("already exists"));

      if (alreadyExists) {
        try {
          localStorage.setItem("validatorPublicKey", publicKey);
        } catch {
          // ignore
        }

        // Best-effort context sync
        try {
          if (typeof checkValidatorByPublicKey === "function") {
            const v = await checkValidatorByPublicKey(publicKey);
            if (v && typeof setValidatorInContext === "function") {
              try {
                setValidatorInContext(v);
              } catch (err) {
                console.warn("setValidatorInContext failed (already exists flow):", err);
              }
            }
          }
        } catch (ctxErr) {
          console.warn("Validator context sync (already exists flow) failed:", ctxErr);
        }

        toast.success("Validator already exists — redirecting...");
        setTimeout(() => {
          window.location.assign("/validator");
        }, 600);
        setSubmitting(false);
        return;
      }

      // Other errors: show server message if available and do not redirect
      const serverMsg = respData ?? err?.message ?? "Failed to register validator";
      toast.error(typeof serverMsg === "string" ? serverMsg : JSON.stringify(serverMsg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center py-20 px-4">
      <Toaster />
      <div className="w-full max-w-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl p-8 shadow-lg">
        <h1 className="text-2xl font-bold mb-4">Become a Validator</h1>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          Connect your Phantom wallet (or paste your Solana public key), confirm your location & IP, and submit.
          Verification steps can be added later (signatures / off-chain checks).
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Solana public key</label>
            <div className="flex items-center gap-2 mt-2">
              <input
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="Paste your Solana public key here"
                className="flex-1 px-3 py-2 rounded-md border"
              />
              <button onClick={connectPhantom} type="button" className="px-4 py-2 bg-indigo-600 text-white rounded-md">
                Connect Phantom
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Detected IP</label>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {loadingIp ? "Detecting..." : ip || "Not detected"}
            </div>
          </div>

          <div>
            <label className="block text-sm font medium text-gray-700 dark:text-gray-200">Detected location</label>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{location || "Not detected"}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 bg-green-600 text-white rounded-md disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Register as Validator"}
            </button>

            <button
              onClick={() => {
                setPublicKey("");
              }}
              className="px-4 py-2 border rounded-md"
            >
              Clear
            </button>
          </div>

          <div className="text-xs text-gray-500">
            Note: This action will create a Validator document in the database. The endpoint is protected — make sure you're signed in.
          </div>
        </div>
      </div>
    </div>
  );
}
