import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '@datashore/shared';

const DB_VERSION = 1;
const MAX_ACTIVITY = 80;

const DEFAULT_SETTINGS = {
  hubName: 'Data Shore',
  tagline: 'The public reading room for private drives.',
  intro:
    'Data Shore turns any folder into a calm, read-only archive. Browse it, stream it, download it — nobody can edit, move, or delete a thing.',
  announcement: '',
};

function nowIso() {
  return new Date().toISOString();
}

function writeAtomicSync(file, contents) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, contents);
  fs.renameSync(temp, file);
}

function uniqueSlug(base, used) {
  let slug = slugify(base) || 'archive';
  let n = 2;
  while (used.has(slug)) {
    slug = `${slugify(base) || 'archive'}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

export class HubStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'hub.json');
    this.db = this.#load();
    this.saveTimer = null;
  }

  #load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      const fresh = {
        version: DB_VERSION,
        createdAt: nowIso(),
        settings: { ...DEFAULT_SETTINGS },
        archives: [],
        activity: [],
      };
      writeAtomicSync(this.file, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    let db;
    try {
      db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      throw new Error(`Could not read hub database ${this.file}: ${err.message}`);
    }
    db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
    db.archives = Array.isArray(db.archives) ? db.archives : [];
    db.activity = Array.isArray(db.activity) ? db.activity : [];
    for (const archive of db.archives) {
      archive.tags = Array.isArray(archive.tags) ? archive.tags : [];
      archive.views = Number(archive.views) || 0;
      archive.downloadCount = Number(archive.downloadCount) || 0;
      if (archive.status === 'syncing') {
        archive.status = 'error';
        archive.syncError = 'Sync was interrupted by a hub restart. Run sync again.';
      }
    }
    return db;
  }

  save() {
    writeAtomicSync(this.file, JSON.stringify(this.db, null, 2));
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 4000);
    this.saveTimer.unref?.();
  }

  get settings() {
    return this.db.settings;
  }

  updateSettings(patch) {
    const allowed = ['hubName', 'tagline', 'intro', 'announcement'];
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        this.db.settings[key] = String(patch[key]).slice(0, key === 'announcement' ? 300 : 1200);
      }
    }
    this.save();
    return this.db.settings;
  }

  listArchives() {
    return this.db.archives;
  }

  getArchiveById(id) {
    return this.db.archives.find((archive) => archive.id === id) || null;
  }

  getArchiveBySlug(slug) {
    return this.db.archives.find((archive) => archive.slug === slug) || null;
  }

  findArchiveBySource(nodeUrl, shareId) {
    return (
      this.db.archives.find(
        (archive) => archive.source?.url === nodeUrl && archive.source?.shareId === shareId,
      ) || null
    );
  }

  createArchive(input) {
    const used = new Set(this.db.archives.map((archive) => archive.slug));
    const slug = uniqueSlug(input.title, used);
    const archive = {
      id: crypto.randomBytes(8).toString('hex'),
      slug,
      title: String(input.title || 'Untitled archive').slice(0, 120),
      description: String(input.description || '').slice(0, 600),
      curator: String(input.curator || '').slice(0, 80),
      tags: Array.isArray(input.tags)
        ? input.tags.map((tag) => String(tag).trim().slice(0, 24)).filter(Boolean).slice(0, 8)
        : [],
      source: {
        url: input.source.url,
        token: input.source.token,
        shareId: input.source.shareId,
        nodeName: input.source.nodeName || '',
      },
      stats: {
        files: 0,
        folders: 0,
        bytes: 0,
        kinds: {},
        latestMtime: null,
      },
      coverPath: input.coverPath ? String(input.coverPath).slice(0, 1024) : null,
      visibility: input.visibility === 'unlisted' ? 'unlisted' : 'public',
      featured: Boolean(input.featured),
      downloads: input.downloads !== false,
      status: 'syncing',
      syncError: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      syncedAt: null,
      views: 0,
      downloadCount: 0,
    };
    this.db.archives.push(archive);
    this.recordActivity('archive.created', archive, `Published “${archive.title}”`);
    this.save();
    return archive;
  }

  updateArchive(id, patch) {
    const archive = this.getArchiveById(id);
    if (!archive) return null;
    const strings = { title: 120, description: 600, curator: 80 };
    for (const [key, max] of Object.entries(strings)) {
      if (patch[key] !== undefined) archive[key] = String(patch[key]).slice(0, max);
    }
    if (patch.tags !== undefined) {
      archive.tags = (Array.isArray(patch.tags) ? patch.tags : String(patch.tags).split(','))
        .map((tag) => String(tag).trim().replace(/^#/, '').slice(0, 24))
        .filter(Boolean)
        .slice(0, 8);
    }
    if (patch.visibility !== undefined) {
      archive.visibility = patch.visibility === 'unlisted' ? 'unlisted' : 'public';
    }
    if (patch.featured !== undefined) archive.featured = Boolean(patch.featured);
    if (patch.downloads !== undefined) archive.downloads = Boolean(patch.downloads);
    if (patch.coverPath !== undefined) {
      archive.coverPath = patch.coverPath ? String(patch.coverPath).slice(0, 1024) : null;
    }
    archive.updatedAt = nowIso();
    this.save();
    return archive;
  }

  deleteArchive(id) {
    const index = this.db.archives.findIndex((archive) => archive.id === id);
    if (index === -1) return null;
    const [archive] = this.db.archives.splice(index, 1);
    this.db.activity = this.db.activity.filter((item) => item.archiveId !== id);
    this.save();
    return archive;
  }

  recordActivity(type, archive, detail) {
    this.db.activity.unshift({
      at: nowIso(),
      type,
      archiveId: archive?.id || null,
      archiveTitle: archive?.title || null,
      detail: String(detail || ''),
    });
    this.db.activity = this.db.activity.slice(0, MAX_ACTIVITY);
  }

  increment(archiveId, field) {
    const archive = this.getArchiveById(archiveId);
    if (!archive) return;
    archive[field] = (Number(archive[field]) || 0) + 1;
    this.scheduleSave();
  }
}

export function publicSettings(settings) {
  return {
    hubName: settings.hubName,
    tagline: settings.tagline,
    intro: settings.intro,
    announcement: settings.announcement,
  };
}

export function toPublicArchive(archive) {
  if (!archive) return null;
  return {
    id: archive.id,
    slug: archive.slug,
    title: archive.title,
    description: archive.description,
    curator: archive.curator,
    tags: archive.tags,
    stats: archive.stats,
    coverPath: archive.coverPath || null,
    visibility: archive.visibility,
    featured: archive.featured,
    downloads: archive.downloads,
    status: archive.syncedAt ? archive.status : 'syncing',
    createdAt: archive.createdAt,
    updatedAt: archive.updatedAt,
    syncedAt: archive.syncedAt,
    views: archive.views,
    downloadCount: archive.downloadCount,
  };
}

export function toConsoleArchive(archive) {
  if (!archive) return null;
  return {
    ...toPublicArchive(archive),
    node: archive.source
      ? {
          url: archive.source.url,
          shareId: archive.source.shareId,
          nodeName: archive.source.nodeName,
        }
      : null,
    hasCredentials: Boolean(archive.source?.token),
  };
}
