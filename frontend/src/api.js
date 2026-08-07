const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  listUrls: () => request("/urls"),
  createUrl: (payload) =>
    request("/urls", { method: "POST", body: JSON.stringify(payload) }),
  deleteUrl: (id) => request(`/urls/${id}`, { method: "DELETE" }),
  getChecks: (id, limit = 30) => request(`/urls/${id}/checks?limit=${limit}`),
  checkNow: (id) => request(`/urls/${id}/check-now`, { method: "POST" }),
};
