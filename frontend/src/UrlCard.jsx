import { statusTokens } from "./ui";

function Sparkline({ data = [] }) {
  if (data.length < 2) return <div className="h-8 w-full bg-slate-900/50 rounded" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-full text-slate-500">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
    </svg>
  );
}

export function UrlCard({ url, onDelete }) {
  const latest = url.latest_check;
  const up = latest?.is_up ?? false;
  const status = up ? "up" : latest ? "down" : "unknown";
  const token = statusTokens[status];
  const responseTimes = (url.recent_checks || []).map((c) => c.response_time_ms);

  return (
    <div
      className={`relative rounded-xl border-l-4 bg-slate-900 border border-slate-800 p-5 shadow-sm transition hover:shadow-md ${token.border} ${status === "down" ? "shadow-rose-900/20" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-100">{url.name}</h3>
          <a
            href={url.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 hover:text-indigo-400 truncate max-w-[200px] block"
          >
            {url.url}
          </a>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${token.bg} ${token.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${token.dot}`} />
          {token.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-950 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Status</div>
          <div className="text-sm font-medium text-slate-200">{latest?.status_code ?? "—"}</div>
        </div>
        <div className="bg-slate-950 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Response</div>
          <div className="text-sm font-medium text-slate-200">
            {latest ? `${latest.response_time_ms}ms` : "—"}
          </div>
        </div>
        <div className="bg-slate-950 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Checked</div>
          <div className="text-sm font-medium text-slate-200">
            {latest ? new Date(latest.checked_at).toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-slate-500 mb-1">Response time</div>
        <Sparkline data={responseTimes} />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Every {url.check_interval_seconds}s
        </div>
        <button
          onClick={() => onDelete(url.id)}
          className="text-slate-500 hover:text-rose-400 text-sm"
          title="Remove"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
