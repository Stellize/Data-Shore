import { createNodeClient, fetchAllEntries, waitForIndex } from './node-client.js';
import { pickCover } from './catalog.js';

/**
 * Keeps hub catalogs in step with their nodes. One sync per archive at a time;
 * failures leave the previous catalog serving so readers never see a dead page.
 */
export function createSyncService({ store, catalogs }) {
  const active = new Map();

  function statusFor(archiveId) {
    const record = active.get(archiveId);
    if (!record) return null;
    return {
      phase: record.phase,
      files: record.files,
      folders: record.folders,
      bytes: record.bytes,
      fetched: record.fetched,
      total: record.total,
      message: record.message,
      startedAt: record.startedAt,
    };
  }

  function cancel(archiveId) {
    const record = active.get(archiveId);
    if (!record) return false;
    record.controller.abort();
    active.delete(archiveId);
    return true;
  }

  function sync(archiveId) {
    if (active.has(archiveId)) return active.get(archiveId).promise;

    const archive = store.getArchiveById(archiveId);
    if (!archive) {
      const error = new Error('Archive not found.');
      error.status = 404;
      throw error;
    }

    const record = {
      phase: 'connecting',
      files: 0,
      folders: 0,
      bytes: 0,
      fetched: 0,
      total: 0,
      message: 'Connecting to the node…',
      startedAt: new Date().toISOString(),
      controller: new AbortController(),
    };
    active.set(archiveId, record);

    archive.status = 'syncing';
    archive.syncError = null;
    store.save();

    record.promise = (async () => {
      const client = createNodeClient(archive.source.url, archive.source.token);
      const signal = record.controller.signal;

      const state = await waitForIndex(client, archive.source.shareId, {
        signal,
        onProgress: (stats) => {
          record.phase = 'indexing';
          record.message = 'The node is reading the folder…';
          record.files = stats?.progress?.files || record.files;
          record.bytes = stats?.progress?.bytes || record.bytes;
        },
      });

      record.phase = 'cataloging';
      record.message = 'Building the public catalog…';
      record.total = state?.totals ? state.totals.files + state.totals.folders : 0;

      const { entries, truncated } = await fetchAllEntries(client, archive.source.shareId, {
        signal,
        onProgress: ({ fetched, total, stats }) => {
          record.fetched = fetched;
          record.total = total;
          record.files = stats?.files ?? record.files;
          record.folders = stats?.folders ?? record.folders;
          record.bytes = stats?.bytes ?? record.bytes;
        },
      });

      if (signal.aborted) {
        const abortError = new Error('Sync cancelled.');
        abortError.code = 'ABORTED';
        throw abortError;
      }

      // The archive may have been deleted while the catalog was building.
      if (!store.getArchiveById(archiveId)) {
        await catalogs.remove(archiveId);
        return { cancelled: true };
      }

      const totals = state?.totals || {};
      const kinds = totals.kinds || countKinds(entries);
      const stats = {
        files: totals.files ?? entries.filter((entry) => entry.type === 'file').length,
        folders: totals.folders ?? entries.filter((entry) => entry.type === 'dir').length,
        bytes: totals.bytes ?? entries.reduce((sum, entry) => sum + (entry.size || 0), 0),
        kinds,
        latestMtime: totals.latestMtime || null,
        truncated: Boolean(totals.truncated || truncated),
      };

      const syncedAt = new Date().toISOString();
      await catalogs.save(archiveId, {
        version: 1,
        archiveId,
        syncedAt,
        stats,
        coverPath: pickCover(entries),
        entries: entries.map((entry) => ({ ...entry, lower: entry.path.toLowerCase() })),
      });

      const liveArchive = store.getArchiveById(archiveId);
      if (!liveArchive) return { cancelled: true };
      liveArchive.stats = stats;
      liveArchive.syncedAt = syncedAt;
      liveArchive.updatedAt = syncedAt;
      liveArchive.status = 'live';
      liveArchive.syncError = null;
      store.recordActivity(
        'archive.synced',
        liveArchive,
        `Indexed ${stats.files.toLocaleString('en-US')} files across ${stats.folders.toLocaleString('en-US')} folders`,
      );
      store.save();
      return { archive: liveArchive, stats, syncedAt };
    })()
      .catch((err) => {
        if (err.code === 'ABORTED') return { cancelled: true };
        const failed = store.getArchiveById(archiveId);
        if (failed) {
          failed.status = 'error';
          failed.syncError = err.message || 'Sync failed.';
          failed.updatedAt = new Date().toISOString();
          store.recordActivity('archive.sync_failed', failed, failed.syncError);
          store.save();
        }
        throw err;
      })
      .finally(() => {
        if (active.get(archiveId) === record) active.delete(archiveId);
      });

    return record.promise;
  }

  return { sync, statusFor, cancel, isActive: (id) => active.has(id) };
}

function countKinds(entries) {
  const counts = {};
  for (const entry of entries) {
    if (entry.type !== 'file') continue;
    counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  }
  return counts;
}
