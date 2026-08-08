const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `${res.status} error`;
    try {
      const data = await res.json();
      if (data.detail) {
        message = Array.isArray(data.detail)
          ? data.detail.map((d) => `${d.loc?.join(".")}: ${d.msg}`).join(", ")
          : String(data.detail);
      } else if (data.message) {
        message = data.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  delete: (path) => request("DELETE", path),
};
