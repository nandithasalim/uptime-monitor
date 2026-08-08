import { useEffect, useState, useCallback } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { api } from "./api";

function StatusPill({ isUp, hasData }) {
  if (!hasData) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/50 px-3 py-1 text-xs font-medium text-slate-300">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        Pending
      </span>
    );
  }
  return isUp ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      Up
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-400">
      <span className="h-2 w-2 rounded-full bg-rose-400" />
      Down
    </span>
  );
}

function formatInterval(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60}min`;
  return `${seconds}s`;
}

export default function UrlCard({ url, onDelete }) {
  const [history, setHistory] = useState([]);
  const [checkingNow, setCheckingNow] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const checks = await api.getChecks(url.id, 30);
      setHistory(
        checks.map((c) => ({
          time: new Date(c.checked_at).toLocaleTimeString(),
          ms: c.response_time_ms ?? 0,
          isUp: c.is_up,
        }))
      );
    } catch (e) {
      // silently ignore transient errors between polls
    }
  }, [url.id]);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const latest = url.latest_check;
  const hasData = !!latest;

  const handleCheckNow = async () => {
    setCheckingNow(true);
    try {
      await api.checkNow(url.id);
      await loadHistory();
    } catch (e) {
      // ignore transient errors; the next poll will reconcile state
    } finally {
      setCheckingNow(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">{url.name}</h3>
          <a
            href={url.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-slate-400 hover:text-slate-300 hover:underline break-all"
          >
            {url.url}
          </a>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <button
            onClick={handleCheckNow}
            disabled={checkingNow}
            className="text-slate-500 hover:text-sky-400 text-xs disabled:opacity-50"
            title="Check now"
          >
            {checkingNow ? "Checking…" : "Check now"}
          </button>
          <button
            onClick={() => onDelete(url.id)}
            className="text-slate-500 hover:text-rose-400 text-sm"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <StatusPill isUp={latest?.is_up} hasData={hasData} />
        <div className="text-right text-sm">
          <div className="text-slate-200 font-medium">
            {hasData ? `${Math.round(latest.response_time_ms)} ms` : "—"}
          </div>
          <div className="text-slate-500 text-xs">
            {hasData ? `HTTP ${latest.status_code ?? "—"}` : "no checks yet"}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {url.uptime_percent_24h !== null && url.uptime_percent_24h !== undefined
            ? `${url.uptime_percent_24h}% uptime (last 24h)`
            : ""}
        </span>
        <span>checks every {formatInterval(url.check_interval_seconds)}</span>
      </div>

      {url.last_incident && (
        <div
          className={`mt-1 text-xs ${
            !url.last_incident.is_up ? "text-rose-400" : "text-slate-500"
          }`}
        >
          {url.last_incident.is_up
            ? `Recovered at ${new Date(url.last_incident.changed_at).toLocaleTimeString()}`
            : `Down since ${new Date(url.last_incident.changed_at).toLocaleTimeString()}`}
        </div>
      )}

      <div className="mt-4 h-16">
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value) => [`${Math.round(value)} ms`, "response time"]}
              />
              <Line
                type="monotone"
                dataKey="ms"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">
            Not enough data for chart yet
          </div>
        )}
      </div>
    </div>
  );
}
