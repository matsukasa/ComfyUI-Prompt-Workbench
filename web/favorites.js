import { favoriteSettingsPayload, parseFavoriteSettings } from "./settings.js";

const stores = new WeakMap();

async function requestFavorites(api, change) {
  const response = await api.fetchApi("/prompt_workbench/favorites", change ? {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  } : undefined);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Favorites request failed (${response.status})`);
  return { ...parseFavoriteSettings(body), revision: Number(body.revision) || 0,
    initialized: body.initialized !== false };
}

export async function fetchSharedFavorites(api) {
  const response = await api.fetchApi("/prompt_workbench/favorites");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Favorites request failed (${response.status})`);
  return parseFavoriteSettings(body);
}

export async function saveSharedFavorites(api, settings = {}) {
  const response = await api.fetchApi("/prompt_workbench/favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(favoriteSettingsPayload(settings)),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Favorites request failed (${response.status})`);
  return parseFavoriteSettings(body);
}

export class SharedFavoritesStore {
  constructor(api) {
    this.api = api;
    this.base = { favorites: [], favoriteTagSets: [], revision: -1 };
    this.listeners = new Set();
    this.pending = [];
    this.queue = Promise.resolve();
    this.initialPromise = null;
  }

  get value() {
    const value = { favorites: new Set(this.base.favorites), favoriteTagSets: new Set(this.base.favoriteTagSets) };
    for (const batch of this.pending) {
      for (const { kind, key, favorite } of batch) {
        if (favorite) value[kind].add(key);
        else value[kind].delete(key);
      }
    }
    return parseFavoriteSettings({ favorites: [...value.favorites], favoriteTagSets: [...value.favoriteTagSets] });
  }

  publish() {
    const value = this.value;
    for (const listener of this.listeners) listener(value);
    return value;
  }

  accept(snapshot) {
    if (snapshot.revision >= this.base.revision) this.base = snapshot;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.base.revision >= 0) listener(this.value);
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => {
        this.refresh().catch(() => {});
      }, 5000);
      this.pollTimer.unref?.();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { clearInterval(this.pollTimer); this.pollTimer = null; }
    };
  }

  initialize(seed = {}) {
    if (!this.initialPromise) {
      this.initialPromise = requestFavorites(this.api).then(async (snapshot) => {
        // The server applies a seed only if no shared file exists yet.
        // Merely loading an old workflow must never re-add deleted favorites.
        if (!snapshot.initialized) snapshot = await requestFavorites(this.api, {
          operations: [], seed: favoriteSettingsPayload(seed),
        });
        this.accept(snapshot);
        return this.publish();
      }).catch((error) => { this.initialPromise = null; throw error; });
    }
    return this.initialPromise;
  }

  update(operations, seed = {}) {
    const batch = operations.map((operation) => ({ ...operation }));
    this.pending.push(batch);
    if (this.base.revision >= 0) this.publish();
    const task = this.queue.catch(() => {}).then(() => this.initialize(seed)).then(async () => {
      const snapshot = await requestFavorites(this.api, { operations: batch });
      this.accept(snapshot);
    }).finally(() => {
      this.pending = this.pending.filter((item) => item !== batch);
      if (this.base.revision >= 0) this.publish();
    });
    this.queue = task;
    return task.then(() => this.value);
  }

  refresh() {
    if (!this.initialPromise) return Promise.resolve(this.value);
    const task = this.queue.catch(() => {}).then(async () => {
      this.accept(await requestFavorites(this.api));
      return this.publish();
    });
    this.queue = task;
    return task;
  }
}

export function sharedFavoritesStore(api) {
  if (!stores.has(api)) stores.set(api, new SharedFavoritesStore(api));
  return stores.get(api);
}
