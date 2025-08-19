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
  checkValidatorByPublicKey: (publicKey: string) => Promise<IValidator | null>;
  registerValidator: (payload: { publicKey: string; location: string; ip: string }) => Promise<IValidator | null>;
  pendingPayoutsSol: number | null;
}

const ValidatorContext = createContext<ValidatorContextValue | undefined>(undefined);

export const ValidatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getToken } = useAuth();
  const { withLoading, notify } = useUI();

  const [validator, setValidator] = useState<IValidator | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // explicitly pass generic so withLoading returns Promise<IValidator | null>
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
    // If pendingPayouts might be stored as string in some responses, coerce to number
    const lamports = Number(validator.pendingPayouts ?? 0);
    if (Number.isNaN(lamports)) return null;
    return lamports / LAMPORTS_PER_SOL;
  }, [validator]);

  const value = useMemo<ValidatorContextValue>(() => ({
    validator,
    loading,
    error,
    checkValidatorByPublicKey: fetchByPk,
    registerValidator,
    pendingPayoutsSol,
  }), [validator, loading, error, pendingPayoutsSol]);

  return <ValidatorContext.Provider value={value}>{children}</ValidatorContext.Provider>;
};

export const useValidator = (): ValidatorContextValue => {
  const ctx = useContext(ValidatorContext);
  if (!ctx) throw new Error("useValidator must be used within ValidatorProvider");
  return ctx;
};
