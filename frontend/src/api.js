const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    // FastAPI validation errors come back as {"detail": [{..., "msg": "..."}]}
    // (a list, one entry per invalid field) or sometimes {"detail": "..."}
    // for a plain HTTPException. Try to surface the actual message instead of
    // a raw status code, falling back gracefully if the body isn't that shape.
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (Array.isArray(body?.detail)) {
        message = body.detail.map((d) => d.msg).join("; ");
      } else if (typeof body?.detail === "string") {
        message = body.detail;
      }
    } catch {
      // response wasn't JSON — keep the generic status message
    }
    throw new Error(message);
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