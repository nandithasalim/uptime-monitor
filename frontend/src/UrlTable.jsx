function sslLabel(days) {
  if (days === null || days === undefined) return "—";
  if (days < 0) return "expired";
  if (days <= 14) return `${days}d (soon)`;
  return `${days}d`;
}

export default function UrlTable({ urls, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#1b2320]">
      <table className="w-full text-sm">
        <thead className="bg-[#0a0f0e] text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">URL</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium">Response</th>
            <th className="px-4 py-3 font-medium">SSL</th>
            <th className="px-4 py-3 font-medium">Last error</th>
            <th className="px-4 py-3 font-medium">Checked</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1b2320]">
          {urls.map((u) => {
            const latest = u.latest_check;
            const isUp = latest?.is_up;
            return (
              <tr
                key={u.id}
                className={`transition-colors hover:bg-[#111716] ${
                  latest && !isUp ? "bg-rose-950/20" : "bg-[#0d1211]"
                }`}
              >
                <td className="px-4 py-3 font-medium text-slate-100">{u.name}</td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-500">
                  <a href={u.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {u.url}
                  </a>
                </td>
                <td className="px-4 py-3">
                  {!latest ? (
                    <span className="text-slate-500">Pending</span>
                  ) : isUp ? (
                    <span className="text-emerald-400">Up</span>
                  ) : (
                    <span className="text-rose-400">Down</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-slate-300 tabular-nums">
                  {latest?.status_code ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-slate-300 tabular-nums">
                  {latest?.response_time_ms != null
                    ? `${Math.round(latest.response_time_ms)}ms`
                    : "—"}
                </td>
                <td
                  className={`px-4 py-3 font-mono tabular-nums ${
                    latest?.ssl_days_remaining != null && latest.ssl_days_remaining <= 14
                      ? "text-amber-400"
                      : "text-slate-300"
                  }`}
                >
                  {sslLabel(latest?.ssl_days_remaining)}
                </td>
                <td
                  className="max-w-xs truncate px-4 py-3 text-slate-500"
                  title={latest?.error ?? ""}
                >
                  {latest?.error ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-500 tabular-nums">
                  {latest ? new Date(latest.checked_at).toLocaleTimeString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(u.id)}
                    className="text-slate-600 transition-colors hover:text-rose-400"
                    title="Remove monitor"
                    aria-label={`Remove ${u.name}`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
