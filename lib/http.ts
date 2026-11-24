/** POST JSON to one of our API routes. Throws with the server's error message on failure. */
export async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res;
}
