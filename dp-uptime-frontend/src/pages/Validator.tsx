// src/pages/Validator.tsx
import React, { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const backendUrl = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8081";

export default function Validator(): JSX.Element {
  const [publicKey, setPublicKey] = useState<string>(() => {
    try {
      return localStorage.getItem("validatorPublicKey") || "";
    } catch {
      return "";
    }
  });
  const [monitoring, setMonitoring] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);
  const [livePoints, setLivePoints] = useState<{ time: string; value: number }[]>([]);
  const [loadingEarnings, setLoadingEarnings] = useState(false);
  const [pendingPayouts, setPendingPayouts] = useState<number | null>(null);

  const totalFromPoints = (pts: { time: string; value: number }[]) => pts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const formatMoney = (n: number) => isNaN(n) ? "-" : `${n.toFixed(2)} units`;

  async function fetchEarningsHistory(pk: string | null, range: "day" | "week" | "month" | "year" = "day") {
    if (!pk) return;
    setLoadingEarnings(true);
    try {
      const url = `${backendUrl}/api/v1/validator-earnings?publicKey=${encodeURIComponent(pk)}&range=${range}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.warn("fetchEarningsHistory failed:", resp.status, txt);
        setLivePoints([]);
        return;
      }
      const json = await resp.json().catch(() => null);
      const points = json?.points ?? [];
      setLivePoints(points.map((p: any) => ({ time: String(p.time), value: Number(p.value || 0) })));
    } catch (err) {
      console.warn("fetchEarningsHistory error:", err);
      setLivePoints([]);
    } finally {
      setLoadingEarnings(false);
    }
  }

  const openWs = (pk: string) => {
    if (!pk) {
      toast.error("Missing validator public key to start monitoring");
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current = 0;
        toast.success("Connected to monitoring network (websocket)");
        // subscribe for earnings
        const subscribeMsg = { type: "subscribe_earnings", data: { publicKey: pk } };
        try { ws.send(JSON.stringify(subscribeMsg)); } catch {}
        setMonitoring(true);
      };

      ws.onmessage = (ev) => {
        try {
          const dataText = typeof ev.data === "string" ? ev.data : (ev.data as any).toString?.() ?? String(ev.data);
          const payload = JSON.parse(dataText);
          const type = payload?.type;
          const data = payload?.data ?? payload?.payload ?? payload;
          if (type === "earning" && data) {
            const pt = { time: String(data.time), value: Number(data.value || 0) };
            setLivePoints((prev) => {
              const next = [...prev, pt];
              if (next.length > 500) next.shift();
              return next;
            });
            if (typeof data.pendingPayouts !== "undefined" && data.pendingPayouts !== null) {
              setPendingPayouts(Number(data.pendingPayouts));
            }
          } else if (type === "subscribed") {
            // ignore
          } else if (type === "client_validate_result") {
            // ignore
          } else if (type === "error" && payload.message) {
            console.warn("WS error:", payload.message);
          }
        } catch (err) {
          console.warn("WS message parse failed:", err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setMonitoring(false);
        reconnectRef.current++;
        if (reconnectRef.current <= 5) {
          const backoff = Math.min(5000 * reconnectRef.current, 20000);
          setTimeout(() => {
            const localPk = localStorage.getItem("validatorPublicKey") || publicKey;
            if (localPk) openWs(localPk);
          }, backoff);
        } else {
          toast.error("WebSocket disconnected");
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    } catch (err) {
      console.error("openWs error:", err);
      toast.error("Failed to open WebSocket");
    }
  };

  const closeWs = () => {
    try {
      if (wsRef.current) {
        try { wsRef.current.send(JSON.stringify({ type: "unsubscribe", data: { publicKey } })); } catch {}
        try { wsRef.current.close(); } catch {}
      }
    } finally {
      wsRef.current = null;
      setMonitoring(false);
    }
  };

  useEffect(() => {
    // initial load of history
    const pk = publicKey || localStorage.getItem("validatorPublicKey") || "";
    if (pk) fetchEarningsHistory(pk, "day");
    // cleanup on unmount
    return () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, []); // eslint-disable-line

  useEffect(() => {
    // keep localStorage in sync
    try {
      if (publicKey) localStorage.setItem("validatorPublicKey", publicKey);
    } catch {}
  }, [publicKey]);

  function EarningsChart({ points }: { points: { time: string; value: number }[] }) {
    return (
      <div className="w-full h-64 bg-white/5 rounded-md p-3 border border-white/5">
        {loadingEarnings ? (
          <div className="flex items-center justify-center h-full">Loading earnings...</div>
        ) : points.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">No earnings data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <XAxis dataKey="time" tickFormatter={(t) => String(t).slice(11, 19)} minTickGap={10} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center py-12 px-4">
      <Toaster />
      <div className="w-full max-w-2xl bg-gradient-to-br from-slate-900 to-purple-900 rounded-xl p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold mb-4">Validator — Monitoring & Earnings</h1>

        <div className="mb-4">
          <label className="block text-sm text-slate-300 mb-2">Validator public key</label>
          <div className="flex gap-2">
            <input
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="Paste your validator public key (optional)"
              className="flex-1 px-3 py-2 rounded-md bg-white/5 border border-white/10"
            />
            {monitoring ? (
              <button onClick={closeWs} className="px-4 py-2 bg-red-600 rounded-md">Stop</button>
            ) : (
              <button
                onClick={async () => {
                  const pk = publicKey || localStorage.getItem("validatorPublicKey") || "";
                  if (!pk) {
                    toast.error("No public key entered.");
                    return;
                  }
                  await fetchEarningsHistory(pk, "day");
                  openWs(pk);
                }}
                className="px-4 py-2 bg-green-600 rounded-md"
              >
                Start Streaming
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <div>
            <div className="text-xs text-slate-300">Total (history + live)</div>
            <div className="text-xl font-semibold">{formatMoney(totalFromPoints(livePoints))}</div>
          </div>

          <div>
            <div className="text-xs text-slate-300">Pending payouts</div>
            <div className="text-xl font-semibold">{pendingPayouts === null ? "-" : formatMoney(Number(pendingPayouts))}</div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium mb-2">Earnings (live)</h2>
          <EarningsChart points={livePoints} />
        </div>
      </div>
    </div>
  );
}
