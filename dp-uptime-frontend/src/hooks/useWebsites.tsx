import { useAuth } from "@clerk/clerk-react";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";

const backendUrl =
  (import.meta.env.VITE_API_BACKEND_URL as string) || "http://localhost:5000";

export interface WebsiteTick {
  id: string;
  websiteId: string;
  validatorId: string;
  createdAt: string;
  status: "Good" | "Bad";
  latency: number;
}

export interface Website {
  id: string;
  url: string;
  userId: string;
  disabled: boolean;
  ticks: WebsiteTick[];
  createdAt: string;
  updatedAt: string;
}

export interface ProcessedWebsite extends Website {
  uptimePercentage: number;
  lastChecked: string | null;
  avgLatency: number | null;
}

export function useWebsites() {
  const { getToken } = useAuth();
  const [websites, setWebsites] = useState<ProcessedWebsite[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshWebsites = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        console.warn("[useWebsites] no auth token — skipping fetch");
        setLoading(false);
        return;
      }

      const url = `${backendUrl}/api/v1/get-all-websites`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw =
        response?.data?.websites ??
        response?.data?.data ??
        response?.data ??
        [];

      if (!Array.isArray(raw)) {
        console.warn("[useWebsites] unexpected response shape:", response.data);
        setWebsites([]);
        return;
      }

      const processed: ProcessedWebsite[] = raw.map((w: any) => {
        const ticks: WebsiteTick[] = (w.ticks ?? []).map((t: any) => ({
          id: t._id ?? t.id,
          websiteId: t.websiteId,
          validatorId: t.validatorId,
          createdAt: t.createdAt,
          status: t.status,
          latency: t.latency,
        }));

        const total = ticks.length;
        const good = ticks.filter((t) => t.status === "Good").length;
        const uptimePercentage = total > 0 ? (good / total) * 100 : 100;

        const lastChecked =
          total > 0 ? ticks[ticks.length - 1].createdAt : null; // use latest tick

        const avgLatency =
          total > 0
            ? ticks.reduce((sum, t) => sum + (t.latency ?? 0), 0) / total
            : null;

        return {
          id: w._id ?? w.id,
          url: w.url,
          userId: w.userId,
          disabled: w.disabled ?? false,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          ticks,
          uptimePercentage,
          lastChecked,
          avgLatency,
        };
      });

      setWebsites(processed);
    } catch (err: any) {
      console.error("[useWebsites] refresh error:", err?.response ?? err);
      setWebsites([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refreshWebsites();
    const interval = setInterval(refreshWebsites, 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshWebsites]);

  return { websites, refreshWebsites, loading };
}
