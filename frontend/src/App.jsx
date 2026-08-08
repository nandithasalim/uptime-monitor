import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api";
import UrlCard from "./UrlCard.jsx";
import UrlTable from "./UrlTable.jsx";

function KpiCard({ label, value, unit, sub, tone = "default" }) {
  const toneClass =
    tone === "up"
      ? "text-emerald-400"
      : tone === "down"
      ? "text-rose-400"
      : tone === "warn"
      ? "text-amber-400"
      : "text-white";
  return (
    <div className="rounded-2xl border border-[#2a3733] bg-[#111917] px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`font-mono text-3xl font-medium tabular-nums ${toneClass}`}>
          {value}
        </span>
        {unit && <span className="font-mono text-sm text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 truncate text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-[#2a3733] bg-[#111917] p-5">
      <div className="h-5 w-1/3 rounded bg-[#2a3733]" />
      <div className="mt-2 h-3 w-1/2 rounded bg-[#2a3733]" />
      <div className="mt-6 grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="h-2 w-10 rounded bg-[#2a3733]" />
            <div className="mt-2 h-5 w-12 rounded bg-[#2a3733]" />
          </div>
        ))}
      </div>
      <div className="mt-5 h-24 rounded bg-[#2a3733]/60" />
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

  const formRef = useRef(null);
  const listRef = useRef(null);
  const nameRef = useRef(null);

  const loadUrls = useCallback(async () => {
    try {
      const data = await api.listUrls();
      setUrls(data);
      setError(null);
    } catch (e) {
      // Deliberately NOT falling back to placeholder/sample data: for a
      // monitoring tool, showing invented numbers when the API is unreachable
      // is worse than showing nothing. Fail loudly instead.
      setError("Live API unreachable. Is the backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUrls();
    const interval = setInterval(loadUrls, 2000); // 2s poll keeps the dashboard
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
      setError(e.message || "Failed to add monitor.");
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

  const scrollTo = (ref, focus) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focus) setTimeout(() => nameRef.current?.focus(), 400);
  };

  const upCount = urls.filter((u) => u.latest_check?.is_up).length;
  const downCount = urls.filter((u) => u.latest_check && !u.latest_check.is_up).length;
  const allUp = urls.length > 0 && downCount === 0;

  // Slowest responding monitor — more actionable than an average across
  // unrelated endpoints, because it names the one service that's degrading.
  const responding = urls.filter(
    (u) => u.latest_check?.is_up && u.latest_check.response_time_ms != null
  );
  const slowest = responding.length
    ? responding.reduce((a, b) =>
        a.latest_check.response_time_ms > b.latest_check.response_time_ms ? a : b
      )
    : null;

  const expiringSoon = urls.filter(
    (u) => u.latest_check?.ssl_days_remaining != null && u.latest_check.ssl_days_remaining <= 14
  );

  // Surface problems first: down monitors, then not-yet-checked, then healthy.
  // With more than a handful of monitors you shouldn't have to scroll to find
  // the broken one. Within each group, keep the original (creation) order so
  // healthy monitors don't shuffle around on every poll.
  const rank = (u) => {
    if (!u.latest_check) return 1; // pending
    return u.latest_check.is_up ? 2 : 0; // up : down
  };
  const sortedUrls = [...urls].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="min-h-screen bg-[#070a09] text-slate-100">
      <div className="grid-backdrop">
        <div className="mx-auto max-w-6xl px-6 pb-10 pt-14">
          {urls.length > 0 && (
            <div
              className={`inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-medium ${
                allUp
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-300"
              }`}
            >
              <span className="relative flex h-2 w-2">
                {allUp && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    allUp ? "bg-emerald-400" : "bg-rose-500"
                  }`}
                />
              </span>
              {allUp
                ? "All systems operational"
                : `${downCount} of ${urls.length} monitor${urls.length === 1 ? "" : "s"} down`}
            </div>
          )}

          <h1 className="mt-8 max-w-3xl text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Know the second
            <br />
            something breaks.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Probes every endpoint you ship, tracks response time and SSL expiry, and fires a
            webhook the moment status flips.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => scrollTo(formRef, true)}
              className="flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-[#052e1a] transition-colors hover:bg-emerald-300"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add monitor
            </button>
            <button
              onClick={() => scrollTo(listRef, false)}
              className="rounded-full border border-[#2a3733] px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-[#3b4a45] hover:text-white"
            >
              View dashboard
            </button>
          </div>

          {urls.length > 0 && (
            <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard label="Monitors" value={urls.length} />
              <KpiCard label="Operational" value={upCount} tone="up" />
              <KpiCard label="Down" value={downCount} tone={downCount > 0 ? "down" : "default"} />
              {expiringSoon.length > 0 ? (
                <KpiCard
                  label="SSL expiring"
                  value={expiringSoon.length}
                  sub={`within 14 days · ${expiringSoon[0].name}`}
                  tone="warn"
                />
              ) : (
                <KpiCard
                  label="Slowest"
                  value={slowest ? Math.round(slowest.latest_check.response_time_ms) : "—"}
                  unit={slowest ? "ms" : null}
                  sub={slowest ? slowest.name : "nothing responding"}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="scroll-mt-6 rounded-2xl border border-[#2a3733] bg-[#111917] p-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_auto_auto]">
            <div>
              <label
                htmlFor="monitor-name"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400"
              >
                Name
              </label>
              <input
                id="monitor-name"
                ref={nameRef}
                type="text"
                placeholder="Core API"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-[#2a3733] bg-[#0a0f0e] px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="monitor-url"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400"
              >
                URL
              </label>
              <input
                id="monitor-url"
                type="text"
                placeholder="https://example.com"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full rounded-xl border border-[#2a3733] bg-[#0a0f0e] px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="monitor-interval"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400"
              >
                Interval
              </label>
              <select
                id="monitor-interval"
                value={form.check_interval_seconds}
                onChange={(e) => setForm({ ...form, check_interval_seconds: e.target.value })}
                className="w-full rounded-xl border border-[#2a3733] bg-[#0a0f0e] px-4 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
              >
                <option value={30}>Every 30s</option>
                <option value={60}>Every 1 min</option>
                <option value={300}>Every 5 min</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-emerald-400 px-6 py-2.5 text-sm font-semibold text-[#052e1a] transition-colors hover:bg-emerald-300 disabled:opacity-50"
              >
                {submitting ? "Adding…" : "Add monitor"}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-3 text-xs font-medium text-slate-400 transition-colors hover:text-emerald-400"
          >
            {showAdvanced ? "− Hide" : "+ Add"} alert webhook (optional)
          </button>

          {showAdvanced && (
            <div className="mt-3">
              <label
                htmlFor="monitor-webhook"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400"
              >
                Alert webhook
              </label>
              <input
                id="monitor-webhook"
                type="text"
                placeholder="https://hooks.example.com/… — gets a POST when this URL goes down or recovers"
                value={form.webhook_url}
                onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                className="w-full rounded-xl border border-[#2a3733] bg-[#0a0f0e] px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
              />
            </div>
          )}
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/50 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div ref={listRef} className="mt-10 scroll-mt-6">
          {urls.length > 0 && (
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-slate-400">
                Monitors
              </h2>
              <div className="flex gap-1 rounded-xl border border-[#2a3733] bg-[#111917] p-1">
                <button
                  onClick={() => setView("cards")}
                  className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                    view === "cards"
                      ? "bg-emerald-400 text-[#052e1a]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                    view === "table"
                      ? "bg-emerald-400 text-[#052e1a]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  Table
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : urls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#2a3733] py-16 text-center text-slate-400">
              No monitors yet. Add one above to start watching an endpoint.
            </div>
          ) : view === "table" ? (
            <UrlTable urls={sortedUrls} onDelete={handleDelete} />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {sortedUrls.map((u) => (
                <UrlCard key={u.id} url={u} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
