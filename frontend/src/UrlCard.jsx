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
      : "text-slate-100";
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1.5 font-mono text-lg font-medium tabular-nums ${toneClass}`}>
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

  const accent = !hasData ? "bg-slate-600" : isUp ? "bg-emerald-400" : "bg-rose-500";
  const chartColor = !hasData ? "#64748b" : isUp ? "#34d399" : "#fb7185";
  const gradientId = `grad-${url.id}`;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-colors ${
        hasData && !isUp
          ? "border-rose-900/50 bg-gradient-to-br from-rose-950/30 to-[#0d1211]"
          : "border-[#1b2320] bg-[#0d1211]"
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-[3px] ${accent}`} />

      <div className="p-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                {hasData && isUp && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${accent}`} />
              </span>
              <h3 className="truncate text-lg font-semibold text-slate-50">{url.name}</h3>
            </div>
            <a
              href={url.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-sm text-slate-500 hover:text-slate-300 hover:underline"
            >
              {url.url}
            </a>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                !hasData
                  ? "bg-slate-800 text-slate-400"
                  : isUp
                  ? "bg-emerald-400/10 text-emerald-400"
                  : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {!hasData ? "Pending" : isUp ? "Up" : "Down"}
            </span>
            <button
              onClick={() => onDelete(url.id)}
              className="text-slate-600 transition-colors hover:text-rose-400"
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
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#0a0f0e",
                    border: "1px solid #1b2320",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#94a3b8" }}
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
            <div className="flex h-full items-center justify-center text-xs text-slate-600">
              Collecting data…
            </div>
          )}
        </div>

        {url.last_incident && (
          <div
            className={`mt-3 text-xs ${
              url.last_incident.is_up ? "text-slate-500" : "text-rose-400"
            }`}
          >
            {url.last_incident.is_up
              ? `Recovered ${new Date(url.last_incident.changed_at).toLocaleTimeString()}`
              : `Down since ${new Date(url.last_incident.changed_at).toLocaleTimeString()}`}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[#1b2320] px-6 py-3 text-xs text-slate-500">
        <span>{formatInterval(url.check_interval_seconds)}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCheckNow}
            disabled={checkingNow}
            className="transition-colors hover:text-emerald-400 disabled:opacity-50"
          >
            {checkingNow ? "Checking…" : "Check now"}
          </button>
          <span className="tabular-nums">
            {hasData && !isUp && latest.error
              ? latest.error.slice(0, 36)
              : hasData
              ? `Checked ${new Date(latest.checked_at).toLocaleTimeString()}`
              : "No checks yet"}
          </span>
        </div>
      </div>
    </div>
  );
}
