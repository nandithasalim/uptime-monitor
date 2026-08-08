function sslLabel(days) {
  if (days === null || days === undefined) return "—";
  if (days < 0) return "expired";
  if (days <= 14) return `${days}d (soon)`;
  return `${days}d`;
}

export default function UrlTable({ urls, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#2a3733]">
      <table className="w-full text-sm">
        <thead className="bg-[#0a0f0e] text-left text-xs uppercase tracking-[0.12em] text-slate-400">
          <tr>
            <th className="px-4 py-3.5 font-medium">Name</th>
            <th className="px-4 py-3.5 font-medium">URL</th>
            <th className="px-4 py-3.5 font-medium">Status</th>
            <th className="px-4 py-3.5 font-medium">Code</th>
            <th className="px-4 py-3.5 font-medium">Response</th>
            <th className="px-4 py-3.5 font-medium">SSL</th>
            <th className="px-4 py-3.5 font-medium">Last error</th>
            <th className="px-4 py-3.5 font-medium">Checked</th>
            <th className="px-4 py-3.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2a3733]">
          {urls.map((u) => {
            const latest = u.latest_check;
            const isUp = latest?.is_up;
            return (
              <tr
                key={u.id}
                className={`transition-colors hover:bg-[#18211e] ${
                  latest && !isUp ? "bg-[#1a1113]" : "bg-[#111917]"
                }`}
              >
                <td className="px-4 py-3.5 font-medium text-white">{u.name}</td>
                <td className="max-w-xs truncate px-4 py-3.5 text-slate-400">
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-emerald-400 hover:underline"
                  >
                    {u.url}
                  </a>
                </td>
                <td className="px-4 py-3.5">
                  {!latest ? (
                    <span className="text-slate-400">Pending</span>
                  ) : isUp ? (
                    <span className="font-medium text-emerald-400">Up</span>
                  ) : (
                    <span className="font-medium text-rose-400">Down</span>
                  )}
                </td>
                <td className="px-4 py-3.5 font-mono text-white tabular-nums">
                  {latest?.status_code ?? "—"}
                </td>
                <td className="px-4 py-3.5 font-mono text-white tabular-nums">
                  {latest?.response_time_ms != null
                    ? `${Math.round(latest.response_time_ms)}ms`
                    : "—"}
                </td>
                <td
                  className={`px-4 py-3.5 font-mono tabular-nums ${
                    latest?.ssl_days_remaining != null && latest.ssl_days_remaining <= 14
                      ? "text-amber-400"
                      : "text-white"
                  }`}
                >
                  {sslLabel(latest?.ssl_days_remaining)}
                </td>
                <td
                  className="max-w-xs truncate px-4 py-3.5 text-rose-300"
                  title={latest?.error ?? ""}
                >
                  {latest?.error ?? <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3.5 text-slate-400 tabular-nums">
                  {latest ? new Date(latest.checked_at).toLocaleTimeString() : "—"}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => onDelete(u.id)}
                    className="text-slate-400 transition-colors hover:text-rose-400"
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
