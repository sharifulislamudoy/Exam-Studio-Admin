export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
let refreshing: Promise<boolean> | null = null;
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  retry = true,
): Promise<T> {
  const send = () =>
    fetch(API + path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "ExamStudio",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let r = await send();
  if (r.status === 401 && retry) {
    if (!refreshing)
      refreshing = fetch(API + "/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "web" }),
      })
        .then((r) => r.ok)
        .finally(() => {
          refreshing = null;
        });
    if (await refreshing) r = await send();
  }
  const data = await r
    .json()
    .catch(() => ({ message: "Server response could not be read" }));
  if (!r.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || "Request failed",
    );
  return data;
}
