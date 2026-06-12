export async function loadSession(fetchJson: (path: string) => Promise<{ userId?: string }>) {
  const response = await fetchJson("/api/session");

  if (!response.userId) {
    throw new Error("Missing user id");
  }

  return response.userId;
}
