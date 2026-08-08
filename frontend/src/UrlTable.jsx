import { statusTokens } from "./ui";

export function UrlTable({ urls, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">URL</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium">Response</th>
            <th className="px-4 py-3 font-medium">Checked</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {urls.map((u) => {
            const latest = u.latest_check;
            const up = latest?.is_up ?? false;
            const status = up ? "up" : latest ? "down" : "unknown";
            const token = statusTokens[status];
            return (
              <tr key={u.id} className={`${token.rowBg} hover:bg-slate-800/50 transition`}>
                <td className="px-4 py-3 font-medium text-slate-200">{u.name}</td>
                <td className="px-4 py-3 text-slate-400">
                  <a href={u.url} target="_blank" rel="noreferrer" className="hover:text-indigo-400">
                    {u.url}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${token.bg} ${token.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${token.dot}`} />
                    {token.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">{latest?.status_code ?? "—"}</td>
                <td className="px-4 py-3 text-slate-300">
                  {latest ? `${latest.response_time_ms}ms` : "—"}
                </td>
                <td className="px-4 py-3 text-slate-400">
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
