function sslLabel(days) {
    if (days === null || days === undefined) return "—";
    if (days < 0) return "expired";
    if (days <= 14) return `${days}d (soon)`;
    return `${days}d`;
  }
  
  export default function UrlTable({ urls, onDelete }) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Response</th>
              <th className="px-4 py-3">SSL expiry</th>
              <th className="px-4 py-3">Last error</th>
              <th className="px-4 py-3">Last checked</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {urls.map((u) => {
              const latest = u.latest_check;
              const isUp = latest?.is_up;
              return (
                <tr key={u.id} className="bg-slate-950 hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-medium text-slate-100">{u.name}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-400">
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
                  <td className="px-4 py-3 text-slate-300">{latest?.status_code ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {latest?.response_time_ms != null ? `${Math.round(latest.response_time_ms)} ms` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{sslLabel(latest?.ssl_days_remaining)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-500" title={latest?.error ?? ""}>
                    {latest?.error ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {latest ? new Date(latest.checked_at).toLocaleTimeString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(u.id)}
                      className="text-slate-500 hover:text-rose-400"
                      title="Remove"
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
  