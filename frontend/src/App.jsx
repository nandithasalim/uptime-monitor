import { useEffect, useState } from "react";
import { UrlCard } from "./UrlCard";
import { UrlTable } from "./UrlTable";
import { api } from "./api";
import { statusTokens } from "./ui";

function App() {
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [view, setView] = useState("grid");
  const [form, setForm] = useState({
    name: "",
    url: "",
    check_interval_seconds: 60,
    webhook_url: "",
  });

  const fetchUrls = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get("/urls");
      setUrls(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUrls();
    const id = setInterval(fetchUrls, 30000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.post("/urls", form);
      setForm({ name: "", url: "", check_interval_seconds: 60, webhook_url: "" });
      fetchUrls();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this monitor?")) return;
    try {
      await api.delete(`/urls/${id}`);
      fetchUrls();
    } catch (err) {
      alert(err.message);
    }
  };

  const downCount = urls.filter((u) => u.latest_check && !u.latest_check.is_up).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Uptime Monitor</h1>
          <p className="text-slate-400">
            {urls.length} monitors · {downCount} down
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-8 grid gap-4 md:grid-cols-5 items-end"
        >
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="My API"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">URL</label>
            <input
              required
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://example.com"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">Interval (sec)</label>
            <input
              required
              type="number"
              min={10}
              value={form.check_interval_seconds}
              onChange={(e) => setForm({ ...form, check_interval_seconds: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-1 flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
            >
              Add
            </button>
          </div>
          {formError && (
            <div className="md:col-span-5 text-rose-400 text-sm">{formError}</div>
          )}
        </form>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-1.5 text-sm rounded-lg border ${view === "grid" ? "bg-slate-800 border-slate-700" : "border-slate-800 text-slate-400"}`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-3 py-1.5 text-sm rounded-lg border ${view === "table" ? "bg-slate-800 border-slate-700" : "border-slate-800 text-slate-400"}`}
            >
              Table
            </button>
          </div>
          <button
            onClick={fetchUrls}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            Refresh
          </button>
        </div>

        {loading && urls.length === 0 ? (
          <div className="text-slate-500 text-center py-20">Loading monitors…</div>
        ) : error ? (
          <div className="text-rose-400 text-center py-20">{error}</div>
        ) : urls.length === 0 ? (
          <div className="text-slate-500 text-center py-20">No monitors yet. Add one above.</div>
        ) : view === "grid" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {urls.map((u) => (
              <UrlCard key={u.id} url={u} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <UrlTable urls={urls} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}

export default App;
