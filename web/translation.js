export async function getTranslationProviders(api) {
  const response = await api.fetchApi("/prompt_workbench/providers");
  if (!response.ok) throw new Error(`Provider lookup failed (${response.status})`);
  const body = await response.json();
  return Array.isArray(body.providers) ? body.providers : [];
}

async function translateBatch(api, texts, options = {}) {
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
        catalog: options.catalog || "",
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

export function translationBatches(texts) {
  const batches = [];
  let batch = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const text of texts) {
    const size = encoder.encode(JSON.stringify(text)).length + 1;
    // Leave room for the request envelope under the server's 64 KiB limit.
    if (batch.length && (batch.length >= 100 || bytes + size > 60000)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(text);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function translateTags(api, texts, options = {}) {
  const results = [];
  for (const batch of translationBatches(texts)) {
    if (options.isCancelled?.()) return results;
    try {
      const translated = await translateBatch(api, batch, options);
      batch.forEach((source, index) => results.push(translated[index] || {
        source, translated: "", error: "Translation result is missing",
      }));
    } catch (error) {
      // Preserve successful earlier batches and report only the unfinished
      // work as failed; avoid repeatedly hitting a failing/rate-limited API.
      texts.slice(results.length).forEach((source) => results.push({ source, translated: "", error: error.message }));
      options.onProgress?.(results.length, texts.length);
      return results;
    }
    options.onProgress?.(results.length, texts.length);
  }
  return results;
}
