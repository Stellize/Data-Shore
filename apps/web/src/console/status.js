export function syncPercent(sync) {
  if (!sync || !sync.total) return null;
  return Math.min(100, Math.round((sync.fetched / sync.total) * 100));
}

export function phaseLabel(sync) {
  if (!sync) return 'Syncing';
  if (sync.phase === 'connecting') return 'Connecting to node';
  if (sync.phase === 'indexing') return 'Node is indexing';
  if (sync.phase === 'cataloging') return 'Building catalog';
  return 'Syncing';
}

export function statusOf(archive) {
  if (archive.sync || archive.status === 'syncing') {
    return { tone: 'syncing', label: 'Syncing', pulse: true };
  }
  if (archive.status === 'error') {
    return { tone: 'error', label: archive.syncedAt ? 'Stale' : 'Error' };
  }
  if (archive.status === 'live') {
    return { tone: 'live', label: 'Live' };
  }
  return { tone: 'idle', label: 'New' };
}

export function activityIcon(type) {
  switch (type) {
    case 'archive.created':
      return 'plus';
    case 'archive.synced':
      return 'sync';
    case 'archive.sync_failed':
      return 'alert';
    default:
      return 'dot';
  }
}
