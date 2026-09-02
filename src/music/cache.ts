import type { MusicResolveResult } from "./types";
import { resolveMusicUrl } from "./resolver";
import { spotifyTrackId } from "./providers/spotify";
import { parseYouTubeUrl } from "./providers/youtube";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(raw: string): string | null {
  const spotifyId = spotifyTrackId(raw);
  if (spotifyId) return `spotify:${spotifyId}`;

  const youtube = parseYouTubeUrl(raw);
  if (youtube) return `${youtube.service}:${youtube.id}`;

  return null;
}

async function readCache(db: D1Database, key: string): Promise<MusicResolveResult | null> {
  try {
    const row = await db
      .prepare("SELECT response FROM music_cache WHERE key = ? AND expires_at > ? LIMIT 1;")
      .bind(key, Date.now())
      .first<{ response: string }>();

    if (!row?.response) return null;
    return JSON.parse(row.response) as MusicResolveResult;
  } catch (error) {
    console.warn("Music cache read failed:", error);
    return null;
  }
}

async function writeCache(db: D1Database, key: string, result: MusicResolveResult): Promise<void> {
  const now = Date.now();
  try {
    await db
      .prepare(
        "INSERT INTO music_cache (key, response, resolved_at, expires_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET response = excluded.response, resolved_at = excluded.resolved_at, expires_at = excluded.expires_at;",
      )
      .bind(key, JSON.stringify(result), now, now + CACHE_TTL_MS)
      .run();
  } catch (error) {
    console.warn("Music cache write failed:", error);
  }
}

export async function resolveMusicCached(
  raw: string,
  db?: D1Database,
  executionCtx?: ExecutionContext,
): Promise<MusicResolveResult> {
  const key = cacheKey(raw.trim());

  if (db && key) {
    const cached = await readCache(db, key);
    if (cached) return cached;
  }

  const result = await resolveMusicUrl(raw);

  if (db && key) {
    const write = writeCache(db, key, result);
    if (executionCtx) executionCtx.waitUntil(write);
    else await write;
  }

  return result;
}
