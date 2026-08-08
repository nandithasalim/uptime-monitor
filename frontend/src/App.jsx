import { useEffect, useState, useCallback } from "react";
import { api } from "./api";
import UrlCard from "./UrlCard.jsx";
import UrlTable from "./UrlTable.jsx";

function StatusBanner({ upCount, downCount, total }) {
  if (total === 0) return null;

  const allUp = downCount === 0;
  return (
    <div
      className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        allUp
          ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
          : "border-rose-900 bg-rose-950/40 text-rose-300"
      }`}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {allUp && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            allUp ? "bg-emerald-400" : "bg-rose-400"
          }`}
        />
      </span>
      <span className="text-sm font-medium">
        {allUp
          ? "All systems operational"
          : `${downCount} of ${total} monitor${total === 1 ? "" : "s"} down`}
      </span>
      <span className="ml-auto text-xs text-slate-500">
        {upCount} up · {downCount} down · {total} total
      </span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="h-4 w-1/3 rounded bg-slate-800" />
      <div className="mt-2 h-3 w-1/2 rounded bg-slate-800" />
      <div className="mt-6 h-5 w-20 rounded-full bg-slate-800" />
      <div className="mt-6 h-16 rounded bg-slate-800" />
    </div>
  );
}

export default function App() {
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: "",
    url: "",
    check_interval_seconds: 60,
    webhook_url: "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState("cards"); // "cards" | "table"

  const loadUrls = useCallback(async () => {
    try {
      const data = await api.listUrls();
      setUrls(data);
      setError(null);
    } catch (e) {
      setError("Could not reach the API. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUrls();
    const interval = setInterval(loadUrls, 2000); // 2s poll: keeps the dashboard
    // feeling close to real-time without hammering the backend API
    return () => clearInterval(interval);
  }, [loadUrls]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return;
    setSubmitting(true);
    try {
      let url = form.url.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      await api.createUrl({
        name: form.name.trim(),
        url,
        check_interval_seconds: Number(form.check_interval_seconds),
        webhook_url: form.webhook_url.trim() || null,
      });
      setForm({ name: "", url: "", check_interval_seconds: 60, webhook_url: "" });
      setShowAdvanced(false);
      await loadUrls();
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to add URL.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setUrls((prev) => prev.filter((u) => u.id !== id));
    try {
      await api.deleteUrl(id);
    } catch (e) {
      loadUrls();
    }
  };

  const upCount = urls.filter((u) => u.latest_check?.is_up).length;
  const downCount = urls.filter((u) => u.latest_check && !u.latest_check.is_up).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Uptime Monitor</h1>
          <p className="mt-1 text-sm text-slate-400">
            Checks every registered URL on its own schedule and tracks response time.
          </p>
        </header>

        <StatusBanner upCount={upCount} downCount={downCount} total={urls.length} />

        <form
          onSubmit={handleSubmit}
          className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="url-name" className="mb-1 block text-xs text-slate-400">
                  Name
                </label>
                <input
                  id="url-name"
                  type="text"
                  placeholder="e.g. Example Site"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="url-url" className="mb-1 block text-xs text-slate-400">
                  URL
                </label>
                <input
                  id="url-url"
                  type="text"
                  placeholder="e.g. https://example.com"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="url-interval" className="mb-1 block text-xs text-slate-400">
                  Check interval
                </label>
                <select
                  id="url-interval"
                  value={form.check_interval_seconds}
                  onChange={(e) => setForm({ ...form, check_interval_seconds: e.target.value })}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  <option value={30}>Every 30s</option>
                  <option value={60}>Every 1 min</option>
                  <option value={300}>Every 5 min</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {submitting ? "Adding…" : "Add"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="self-start text-xs text-slate-500 hover:text-slate-300"
            >
              {showAdvanced ? "− Hide" : "+ Add"} alert webhook (optional)
            </button>

            {showAdvanced && (
              <div>
                <label htmlFor="url-webhook" className="mb-1 block text-xs text-slate-400">
                  Webhook URL
                </label>
                <input
                  id="url-webhook"
                  type="text"
                  placeholder="Gets a POST when this URL goes down or recovers"
                  value={form.webhook_url}
                  onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
            )}
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-800 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {urls.length > 0 && (
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setView("cards")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "cards"
                  ? "bg-sky-500 text-white"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setView("table")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "table"
                  ? "bg-sky-500 text-white"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Table
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : urls.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center text-slate-500">
            No URLs yet. Add one above to start monitoring.
          </div>
        ) : view === "table" ? (
          <UrlTable urls={urls} onDelete={handleDelete} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {urls.map((u) => (
              <UrlCard key={u.id} url={u} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
