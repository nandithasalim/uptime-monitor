import { useEffect, useState, useCallback } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { api } from "./api";

function formatInterval(seconds) {
  if (seconds < 60) return `Every ${seconds} seconds`;
  const mins = Math.round(seconds / 60);
  return `Every ${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

function Stat({ label, value, tone = "default" }) {
  const toneClass =
    tone === "up"
      ? "text-emerald-400"
      : tone === "down"
      ? "text-rose-400"
      : tone === "warn"
      ? "text-amber-400"
      : "text-white";
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className={`mt-1.5 font-mono text-xl font-medium tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
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
    const interval = setInterval(loadHistory, 2000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const latest = url.latest_check;
  const hasData = !!latest;
  const isUp = latest?.is_up;

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

  const sslDays = latest?.ssl_days_remaining;
  const sslValue = sslDays == null ? "—" : sslDays < 0 ? "Expired" : `${sslDays}d`;
  const sslTone = sslDays == null ? "default" : sslDays <= 14 ? "warn" : "default";

  const accent = !hasData ? "bg-slate-500" : isUp ? "bg-emerald-400" : "bg-rose-500";
  const chartColor = !hasData ? "#94a3b8" : isUp ? "#34d399" : "#fb7185";
  const gradientId = `grad-${url.id}`;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-colors ${
        hasData && !isUp
          ? "border-rose-500/50 bg-[#1a1113]"
          : "border-[#2a3733] bg-[#111917]"
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} />

      <div className="p-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {hasData && isUp && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${accent}`} />
              </span>
              <h3 className="truncate text-lg font-semibold text-white">{url.name}</h3>
            </div>
            <a
              href={url.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-sm text-slate-400 hover:text-emerald-400 hover:underline"
            >
              {url.url}
            </a>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                !hasData
                  ? "bg-slate-700 text-slate-200"
                  : isUp
                  ? "bg-emerald-400/20 text-emerald-300"
                  : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {!hasData ? "Pending" : isUp ? "Up" : "Down"}
            </span>
            <button
              onClick={() => onDelete(url.id)}
              className="text-slate-400 transition-colors hover:text-rose-400"
              title="Remove monitor"
              aria-label={`Remove ${url.name}`}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          <Stat label="Status" value={hasData ? latest.status_code ?? "—" : "—"} />
          <Stat
            label="Latency"
            value={
              hasData && latest.response_time_ms != null
                ? `${Math.round(latest.response_time_ms)}ms`
                : "—"
            }
          />
          <Stat
            label="Uptime"
            value={
              url.uptime_percent_24h !== null && url.uptime_percent_24h !== undefined
                ? `${url.uptime_percent_24h}%`
                : "—"
            }
            tone={url.uptime_percent_24h === 100 ? "up" : "default"}
          />
          <Stat label="SSL" value={sslValue} tone={sslTone} />
        </div>

        <div className="mt-4 h-24">
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#0a0f0e",
                    border: "1px solid #2a3733",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#cbd5e1" }}
                  formatter={(value) => [`${Math.round(value)} ms`, "response time"]}
                />
                <Area
                  type="monotone"
                  dataKey="ms"
                  stroke={chartColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Collecting data…
            </div>
          )}
        </div>

        {hasData && !isUp && latest.error && (
          <div className="mt-3 truncate text-sm text-rose-300" title={latest.error}>
            {latest.error}
          </div>
        )}

        {url.last_incident && (
          <div
            className={`mt-2 text-sm ${
              url.last_incident.is_up ? "text-slate-400" : "text-rose-300"
            }`}
          >
            {url.last_incident.is_up
              ? `Recovered ${new Date(url.last_incident.changed_at).toLocaleTimeString()}`
              : `Down since ${new Date(url.last_incident.changed_at).toLocaleTimeString()}`}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#2a3733] px-6 py-3">
        <div className="min-w-0 text-sm text-slate-400">
          <span>{formatInterval(url.check_interval_seconds)}</span>
          {hasData && (
            <span className="ml-2 tabular-nums text-slate-500">
              · {new Date(latest.checked_at).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={handleCheckNow}
          disabled={checkingNow}
          className="shrink-0 rounded-lg border border-[#3b4a45] px-4 py-1.5 text-sm font-medium text-emerald-400 transition-colors hover:border-emerald-400 hover:bg-emerald-400/10 disabled:opacity-50"
        >
          {checkingNow ? "Checking…" : "Check now"}
        </button>
      </div>
    </div>
  );
}
