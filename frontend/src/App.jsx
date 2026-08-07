import { useEffect, useState, useCallback } from "react";
import { api } from "./api";
import UrlCard from "./UrlCard.jsx";

export default function App() {
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: "", url: "" });
  const [submitting, setSubmitting] = useState(false);

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
    const interval = setInterval(loadUrls, 5000);
    return () => clearInterval(interval);
  }, [loadUrls]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return;
    setSubmitting(true);
    try {
      let url = form.url.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      await api.createUrl({ name: form.name.trim(), url });
      setForm({ name: "", url: "" });
      await loadUrls();
    } catch (e) {
      setError("Failed to add URL. Check the console for details.");
      console.error(e);
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
        <header className="mb-8">
          <h1 className="text-2xl font-bold">Uptime Monitor</h1>
          <p className="mt-1 text-sm text-slate-400">
            Checks every registered URL roughly once a minute and tracks response time.
          </p>
          {urls.length > 0 && (
            <div className="mt-3 flex gap-4 text-sm">
              <span className="text-emerald-400">{upCount} up</span>
              <span className="text-rose-400">{downCount} down</span>
              <span className="text-slate-500">{urls.length} total</span>
            </div>
          )}
        </header>

        <form
          onSubmit={handleSubmit}
          className="mb-8 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row"
        >
          <input
            type="text"
            placeholder="Name (e.g. Example Site)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="URL (e.g. https://example.com)"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add URL"}
          </button>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-800 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : urls.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center text-slate-500">
            No URLs yet. Add one above to start monitoring.
          </div>
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
