// src/context/websites.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useUI } from "./ui";
import { apiFetch } from "./api";
import type { IWebsite } from "./types";

const backendUrl = import.meta.env.VITE_API_BASE || "http://localhost:5000";

interface WebsitesContextValue {
  websites?: IWebsite[];
  loading: boolean;
  error?: string | null;
  refreshWebsites: () => Promise<void>;
  createWebsite: (url: string) => Promise<IWebsite | null>;
  deleteWebsite: (id: string) => Promise<boolean>;
}

const WebsitesContext = createContext<WebsitesContextValue | undefined>(undefined);

export const WebsitesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getToken } = useAuth();
  const { withLoading, notify } = useUI();

  const [websites, setWebsites] = useState<IWebsite[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch {
        token = null;
      }

      const url = `${backendUrl}/api/v1/get-all-websites`;
      const { status, data, error: err } = await apiFetch<{ websites: IWebsite[] }>(url, { method: "GET" }, token);
      if (status === 200 && data) {
        setWebsites(data.websites ?? []);
      } else {
        setWebsites([]);
        setError(err?.error ?? err?.message ?? `Failed (${status})`);
      }
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial
    fetchAll().catch(() => {
      // swallow initial fetch error
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIXED: pass a function to withLoading (don't call fetchAll immediately)
  const refreshWebsites = async () => {
    // withLoading expects a function that returns a Promise; pass fetchAll itself
    // or a wrapper function. This ensures signature matches.
    return withLoading(() => fetchAll());
  };

  const createWebsite = async (urlStr: string) => {
    return withLoading(async () => {
      try {
        let token: string | null = null;
        try {
          token = await getToken();
        } catch {
          token = null;
        }
        const url = `${backendUrl}/api/v1/create-website`;
        const { status, data, error: err } = await apiFetch<{ website: IWebsite }>(
          url,
          { method: "POST", body: JSON.stringify({ url: urlStr }) },
          token
        );
        if (status === 201 && data) {
          // append to local state
          setWebsites((prev) => (prev ? [data.website, ...prev] : [data.website]));
          notify.success("Website added");
          return data.website;
        } else {
          notify.error(err?.error ?? err?.message ?? "Failed to add website");
          return null;
        }
      } catch (e: any) {
        notify.error(e?.message ?? "Failed to add website");
        return null;
      }
    });
  };

  const deleteWebsite = async (id: string) => {
    return withLoading(async () => {
      try {
        let token: string | null = null;
        try {
          token = await getToken();
        } catch {
          token = null;
        }
        const url = `${backendUrl}/api/v1/delete-website`;
        const { status, data, error: err } = await apiFetch(url, { method: "DELETE", body: JSON.stringify({ id }) }, token);
        if (status === 200) {
          setWebsites((prev) => prev?.filter((w) => w._id !== id));
          notify.success("Website deleted");
          return true;
        } else {
          notify.error(err?.error ?? err?.message ?? "Failed to delete");
          return false;
        }
      } catch (e: any) {
        notify.error(e?.message ?? "Failed to delete website");
        return false;
      }
    });
  };

  const value = useMemo(() => ({ websites, loading, error, refreshWebsites, createWebsite, deleteWebsite }), [websites, loading, error]);

  return <WebsitesContext.Provider value={value}>{children}</WebsitesContext.Provider>;
};

export const useWebsites = () => {
  const ctx = useContext(WebsitesContext);
  if (!ctx) throw new Error("useWebsites must be used within WebsitesProvider");
  return ctx;
};
