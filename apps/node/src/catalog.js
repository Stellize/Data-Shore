import { makeShare } from './fsutil.js';
import { buildIndex } from './indexer.js';

const PROGRESS_INTERVAL = 400;

export class ShareCatalog {
  constructor(share) {
    this.share = share;
    this.index = null;
    this.state = 'cold'; // cold | building | ready | error
    this.error = null;
    this.progress = { scanned: 0, files: 0, bytes: 0 };
    this.startedAt = null;
    this.builtAt = null;
    this.promise = null;
  }

  start() {
    if (this.state === 'building' || this.state === 'ready') return this.promise;
    this.state = 'building';
    this.error = null;
    this.progress = { scanned: 0, files: 0, bytes: 0 };
    this.startedAt = Date.now();
    let lastEmit = 0;

    this.promise = buildIndex(this.share, {
      onProgress: (progress) => {
        const now = Date.now();
        if (now - lastEmit < PROGRESS_INTERVAL) return;
        lastEmit = now;
        this.progress = progress;
      },
    })
      .then((index) => {
        this.index = index;
        this.state = 'ready';
        this.builtAt = Date.now();
        this.progress = { scanned: index.stats.files, files: index.stats.files, bytes: index.stats.bytes };
        return index;
      })
      .catch((err) => {
        this.state = 'error';
        this.error = err.message;
        throw err;
      })
      .finally(() => {
        this.promise = null;
      });

    // Warm-up failures are reported through state; avoid unhandled rejections.
    this.promise.catch(() => {});
    return this.promise;
  }

  async ensure() {
    if (this.index) return this.index;
    if (this.promise) return this.promise;
    return this.start();
  }

  async refresh() {
    if (this.state === 'building') return this.promise;
    this.state = 'cold';
    this.index = null;
    return this.ensure();
  }

  snapshotStats() {
    return {
      state: this.state,
      progress: this.progress,
      error: this.error,
      builtAt: this.builtAt ? new Date(this.builtAt).toISOString() : null,
      ...(this.index
        ? {
            totals: {
              files: this.index.stats.files,
              folders: this.index.stats.folders,
              bytes: this.index.stats.bytes,
              kinds: this.index.stats.kinds,
              latestMtime: this.index.stats.latestMtime,
            },
          }
        : {}),
    };
  }
}

export function createCatalogManager(config) {
  const catalogs = new Map(
    config.shares.map((share) => {
      const safeShare = makeShare(share);
      return [safeShare.id, new ShareCatalog(safeShare)];
    }),
  );
  return {
    get(shareId) {
      return catalogs.get(shareId) || null;
    },
    list() {
      return [...catalogs.values()];
    },
    warmAll() {
      for (const catalog of catalogs.values()) catalog.start();
    },
    async stopAll() {
      await Promise.allSettled([...catalogs.values()].map((catalog) => catalog.promise));
    },
  };
}
