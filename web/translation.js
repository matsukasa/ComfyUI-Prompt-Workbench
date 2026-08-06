export async function getTranslationProviders(api) {
  const response = await api.fetchApi("/prompt_workbench/providers");
  if (!response.ok) throw new Error(`Provider lookup failed (${response.status})`);
  const body = await response.json();
  return Array.isArray(body.providers) ? body.providers : [];
}

export async function translateTags(api, texts, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Math.min(Number(options.timeoutMs || 12000), 30000));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await api.fetchApi("/prompt_workbench/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: options.provider || "local",
        source: options.source || "auto",
        target: options.target || "en",
        timeout: Math.ceil(timeoutMs / 1000),
        texts,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Translation failed (${response.status})`);
    return body.results || [];
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Translation timed out");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
