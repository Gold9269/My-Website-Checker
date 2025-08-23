// src/context/validator.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useUI } from "./ui";
import { apiFetch } from "./api";
import type { IValidator } from "./types";

const backendUrl = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const LAMPORTS_PER_SOL = 1_000_000_000;

interface ValidatorContextValue {
  validator?: IValidator | null;
  loading: boolean;
  error?: string | null;
  monitoring: boolean;
  checkValidatorByPublicKey: (publicKey: string) => Promise<IValidator | null>;
  registerValidator: (payload: { publicKey: string; location: string; ip: string }) => Promise<IValidator | null>;
  startMonitoring: () => Promise<void>;
  stopMonitoring: (reasonMsg?: string) => Promise<void>;
  pendingPayoutsSol: number | null;
}

const ValidatorContext = createContext<ValidatorContextValue | undefined>(undefined);

export const ValidatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getToken } = useAuth();
  const { withLoading, notify } = useUI();

  const [validator, setValidator] = useState<IValidator | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // persisted monitoring flag
  const [monitoring, setMonitoring] = useState<boolean>(() => {
    try {
      return JSON.parse(localStorage.getItem("validatorMonitoring") ?? "false") === true;
    } catch {
      return false;
    }
  });

  // fetch by public key
  const fetchByPk = async (publicKey: string): Promise<IValidator | null> => {
    setLoading(true);
    setError(null);
    try {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch {
        token = null;
      }

      const url = `${backendUrl}/api/v1/get-validator?publicKey=${encodeURIComponent(publicKey)}`;
      const { status, data, error: err } = await apiFetch<{ validator: IValidator }>(url, { method: "GET" }, token);

      if (status === 200 && data && data.validator) {
        setValidator(data.validator);
        return data.validator;
      } else {
        setValidator(null);
        setError(err?.error ?? err?.message ?? `Not found (${status})`);
        return null;
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setValidator(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // register validator — explicitly typed so TS knows the return type
  const registerValidator = async (payload: { publicKey: string; location: string; ip: string }): Promise<IValidator | null> => {
    return withLoading<IValidator | null>(async () => {
      try {
        let token: string | null = null;
        try {
          token = await getToken();
        } catch {
          token = null;
        }

        const url = `${backendUrl}/api/v1/create-validator`;
        const { status, data, error: err } = await apiFetch<{ validator: IValidator }>(
          url,
          { method: "POST", body: JSON.stringify(payload) },
          token
        );

        if (status === 201 && data && data.validator) {
          setValidator(data.validator);
          try {
            localStorage.setItem("validatorPublicKey", data.validator.publicKey);
          } catch {
            // ignore localStorage errors
          }
          notify.success("Validator registered");
          return data.validator;
        } else {
          notify.error(err?.error ?? err?.message ?? `Failed to register (${status})`);
          return null;
        }
      } catch (e: any) {
        notify.error(e?.message ?? "Failed to register");
        return null;
      }
    });
  };

  // convert lamports -> SOL
  const pendingPayoutsSol = useMemo(() => {
    if (!validator) return null;
    const lamports = Number(validator.pendingPayouts ?? 0);
    if (Number.isNaN(lamports)) return null;
    return lamports / LAMPORTS_PER_SOL;
  }, [validator]);

  // helper to call backend endpoints with existing apiFetch pattern
  const callBackend = async (path: string, method = "POST"): Promise<{ ok: boolean; status: number; data?: any; error?: any }> => {
    try {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch {
        token = null;
      }
      const url = `${backendUrl}${path}`;
      const { status, data, error } = await apiFetch(url, { method }, token);
      return { ok: status >= 200 && status < 300, status, data, error };
    } catch (e: any) {
      return { ok: false, status: 500, error: e?.message ?? e };
    }
  };

  // mark online
  const markOnline = async (publicKey: string): Promise<boolean> => {
    const path = `/api/v1/change-to-online?publicKey=${encodeURIComponent(publicKey)}`;
    const res = await callBackend(path, "POST");
    if (!res.ok) {
      notify.error(res.error?.error ?? res.error?.message ?? `Failed to mark online (${res.status})`);
      return false;
    }
    notify.success("Marked validator online");
    return true;
  };

  // mark offline
  const markOffline = async (publicKey: string): Promise<boolean> => {
    const path = `/api/v1/change-to-offline?publicKey=${encodeURIComponent(publicKey)}`;
    const res = await callBackend(path, "POST");
    if (!res.ok) {
      notify.error(res.error?.error ?? res.error?.message ?? `Failed to mark offline (${res.status})`);
      return false;
    }
    notify.success("Marked validator offline");
    return true;
  };

  // startMonitoring: will attempt to use existing validator.publicKey, fallback to localStorage, or ask Phantom
  const startMonitoring = async (): Promise<void> => {
    await withLoading(async () => {
      try {
        let pk = validator?.publicKey ?? localStorage.getItem("validatorPublicKey") ?? "";

        if (!pk) {
          // try Phantom
          if ((window as any).solana && (window as any).solana.isPhantom) {
            try {
              const r: any = await (window as any).solana.connect?.();
              pk = r?.publicKey?.toString?.() ?? "";
              if (!pk) {
                notify.error("Phantom returned no public key");
                return;
              }
              // optionally register a local validator object if you want
              try { localStorage.setItem("validatorPublicKey", pk); } catch {}
            } catch (err: any) {
              notify.error("Phantom connect failed: " + String(err));
              return;
            }
          } else {
            notify.error("Please supply a public key or install Phantom");
            return;
          }
        }

        // attempt to fetch validator data (best-effort) so UI has a validator object
        const fetched = await fetchByPk(pk);
        if (!fetched) {
          // it's ok — maybe validator doesn't exist yet. UI can register later.
        }

        // call backend to mark online (best-effort)
        await markOnline(pk);

        // set and persist monitoring flag
        setMonitoring(true);
        try { localStorage.setItem("validatorMonitoring", JSON.stringify(true)); } catch {}
      } catch (err: any) {
        notify.error(String(err?.message ?? err));
        setMonitoring(false);
      }
    });
  };

  // stopMonitoring: persist false and call backend to mark offline
  const stopMonitoring = async (reasonMsg?: string): Promise<void> => {
    await withLoading(async () => {
      try {
        // local cleanup in UI (components should handle websocket close)
        setMonitoring(false);
        try { localStorage.setItem("validatorMonitoring", JSON.stringify(false)); } catch {}

        if (reasonMsg) notify.info ? notify.info(reasonMsg) : notify.success(reasonMsg);
        else notify.success("Monitoring stopped");

        const pk = validator?.publicKey ?? localStorage.getItem("validatorPublicKey") ?? "";
        if (!pk) {
          return;
        }

        await markOffline(pk);
      } catch (err: any) {
        notify.error(String(err?.message ?? err));
      }
    });
  };

  // On mount: attempt to restore monitoring state if it was enabled before
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
          // populate validator (best-effort)
          await fetchByPk(storedPk);
          // attempt to mark online (best-effort)
          await markOnline(storedPk);
          // restore UI flag
          setMonitoring(true);
        }
      } catch (e) {
        // ignore restore errors — user can re-start manually
        console.warn("validator restore failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<ValidatorContextValue>(() => ({
    validator,
    loading,
    error,
    monitoring,
    checkValidatorByPublicKey: fetchByPk,
    registerValidator,
    startMonitoring,
    stopMonitoring,
    pendingPayoutsSol,
  }), [validator, loading, error, monitoring, pendingPayoutsSol]);

  return <ValidatorContext.Provider value={value}>{children}</ValidatorContext.Provider>;
};

export const useValidator = (): ValidatorContextValue => {
  const ctx = useContext(ValidatorContext);
  if (!ctx) throw new Error("useValidator must be used within ValidatorProvider");
  return ctx;
};
