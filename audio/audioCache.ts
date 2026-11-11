import { Directory, File, Paths } from "expo-file-system";
import { STORAGE_KEYS, storage } from "@/lib/storage";

const CACHE_DIRECTORY = "zestmusic-audio";
/** Total bytes the cache may occupy before eviction starts. */
const CACHE_BUDGET_BYTES = 2 * 1024 ** 3;
/** Entries not used for this long are deleted. */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Evict down to this fraction of the budget to avoid constant churn. */
const CACHE_TARGET_RATIO = 0.8;
/** Never evict a file written this recently; it may still be copying. */
const RECENTLY_WRITTEN_MS = 60_000;
/** Debounce index writes; a lost write is recovered by reconciliation. */
const INDEX_WRITE_DELAY_MS = 1_000;

interface CacheEntry {
  size: number;
  lastAccess: number;
}

type CacheIndex = Record<string, CacheEntry>;

let index: CacheIndex | null = null;
let loadPromise: Promise<CacheIndex> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let maintenance: Promise<void> | null = null;

export function getCacheDirectory(): Directory {
  return new Directory(Paths.cache, CACHE_DIRECTORY);
}

function sanitizeIndex(value: unknown): CacheIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: CacheIndex = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object") continue;

    const { size, lastAccess } = entry as Partial<CacheEntry>;
    if (Number.isFinite(size) && Number.isFinite(lastAccess)) {
      result[name] = { size: size as number, lastAccess: lastAccess as number };
    }
  }
  return result;
}

async function loadIndex(): Promise<CacheIndex> {
  if (index) return index;
  if (!loadPromise) {
    loadPromise = (async (): Promise<CacheIndex> => {
      let loaded: CacheIndex;
      try {
        const raw = await storage.getItem(STORAGE_KEYS.audioCacheIndex);
        loaded = sanitizeIndex(raw ? JSON.parse(raw) : null);
      } catch (error) {
        console.warn("[AudioCache] Could not read cache index", error);
        loaded = {};
      }

      index = loaded;
      return loaded;
    })();
  }
  return loadPromise;
}

async function persistIndex() {
  if (!index) return;

  try {
    await storage.setItem(STORAGE_KEYS.audioCacheIndex, JSON.stringify(index));
  } catch (error) {
    console.warn("[AudioCache] Could not write cache index", error);
  }
}

function scheduleIndexWrite() {
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persistIndex();
  }, INDEX_WRITE_DELAY_MS);
}

/** Record that a cached file was just used, so eviction reflects playback. */
export async function touchCacheEntry(file: File): Promise<void> {
  try {
    const current = await loadIndex();
    current[file.name] = { size: file.size, lastAccess: Date.now() };
    scheduleIndexWrite();
  } catch (error) {
    console.warn("[AudioCache] Could not update cache index", error);
  }
}

function deleteFile(
  files: Map<string, File>,
  current: CacheIndex,
  name: string,
): number {
  const file = files.get(name);
  if (!file) {
    delete current[name];
    return 0;
  }

  const size = file.size;
  try {
    file.delete();
    delete current[name];
    files.delete(name);
    return size;
  } catch (error) {
    console.warn("[AudioCache] Could not delete cached file", { name, error });
    return 0;
  }
}

async function runMaintenance(pinnedName?: string) {
  try {
    const current = await loadIndex();
    const directory = getCacheDirectory();

    if (!directory.exists) {
      if (Object.keys(current).length > 0) {
        index = {};
        await persistIndex();
      }
      return;
    }

    const files = new Map<string, File>();
    for (const entry of directory.list()) {
      if (entry instanceof File) files.set(entry.name, entry);
    }

    // Reconcile: drop entries whose file vanished, adopt files with no entry.
    for (const name of Object.keys(current)) {
      if (!files.has(name)) delete current[name];
    }

    const now = Date.now();
    let total = 0;
    for (const [name, file] of files) {
      const entry = current[name];
      if (entry) {
        entry.size = file.size;
      } else {
        current[name] = { size: file.size, lastAccess: file.lastModified ?? now };
      }
      total += file.size;
    }

    // Drop entries past the TTL.
    for (const [name, entry] of Object.entries(current)) {
      if (name === pinnedName) continue;
      if (now - entry.lastAccess <= CACHE_MAX_AGE_MS) continue;
      total -= deleteFile(files, current, name);
    }

    // Size cap, evicting down to the low watermark.
    if (total > CACHE_BUDGET_BYTES) {
      const target = CACHE_BUDGET_BYTES * CACHE_TARGET_RATIO;
      const candidates = Object.entries(current).sort(
        ([, a], [, b]) => a.lastAccess - b.lastAccess,
      );

      for (const [name] of candidates) {
        if (total <= target) break;
        if (name === pinnedName) continue;

        const lastModified = files.get(name)?.lastModified;
        if (lastModified == null || now - lastModified < RECENTLY_WRITTEN_MS) {
          continue;
        }

        total -= deleteFile(files, current, name);
      }
    }

    await persistIndex();
  } catch (error) {
    console.warn("[AudioCache] Cache maintenance failed", error);
  }
}

/**
 * Reconcile the index with the cache directory, then delete expired and
 * least-recently-used files until the cache fits its budget.
 *
 * Best-effort and single-flight, so it is safe to call on startup and after
 * a cache write.
 */
export function maintainAudioCache(
  options: { pinnedName?: string } = {},
): Promise<void> {
  if (maintenance) return maintenance;

  maintenance = runMaintenance(options.pinnedName).finally(() => {
    maintenance = null;
  });
  return maintenance;
}
