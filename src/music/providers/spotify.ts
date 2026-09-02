import type { MusicTrack, ServiceLink } from "../types";
import { MusicResolverError } from "../types";
import { scoreTrackMatch } from "../matcher";

const TRACK_ID = /^[A-Za-z0-9]{22}$/;
const SEARCH_TRACKS_HASH = "bc1ca2fcd0ba1013a0fc88e6cc4f190af501851e3dafd3e1ef85840297694428";

export function spotifyTrackId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== "open.spotify.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "track" || !parts[1] || !TRACK_ID.test(parts[1])) return null;
  return parts[1];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function meta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return undefined;
}

function parseArtistFromHtml(html: string): string | undefined {
  const titleTag = decodeHtml(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "");
  const titleMatch = titleTag.match(/\b(?:song and lyrics by|song by)\s+(.+?)\s*\|\s*spotify/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  const description = meta(html, "og:description") ?? meta(html, "description") ?? "";
  const dotParts = description.split(/\s+[·•]\s+/).map((part) => part.trim()).filter(Boolean);
  if (dotParts.length >= 2 && /^(song|track)$/i.test(dotParts[1])) return dotParts[0];

  const byMatch = description.match(/\bby\s+([^·•|]+)(?:\s+[·•|]|$)/i);
  return byMatch?.[1]?.trim();
}

async function fetchPublicPageMetadata(canonical: string): Promise<{ artist?: string }> {
  try {
    const response = await fetch(canonical, {
      redirect: "error",
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return {};
    const html = await response.text();
    return { artist: parseArtistFromHtml(html) };
  } catch {
    return {};
  }
}

export async function resolveSpotify(raw: string): Promise<{ track: MusicTrack; link: ServiceLink }> {
  const id = spotifyTrackId(raw);
  if (!id) throw new MusicResolverError("UNSUPPORTED_URL", "Invalid Spotify track URL");

  const canonical = `https://open.spotify.com/track/${id}`;
  const oembed = new URL("https://open.spotify.com/oembed");
  oembed.searchParams.set("url", canonical);

  const [oembedResponse, publicMetadata] = await Promise.all([
    fetch(oembed.toString(), { redirect: "error" }),
    fetchPublicPageMetadata(canonical),
  ]);

  if (!oembedResponse.ok) {
    if (oembedResponse.status === 404) {
      throw new MusicResolverError("TRACK_NOT_FOUND", "Spotify track not found", "spotify");
    }
    throw new MusicResolverError("UPSTREAM_ERROR", `Spotify oEmbed returned ${oembedResponse.status}`, "spotify");
  }

  const data = await oembedResponse.json() as { title?: string; thumbnail_url?: string };
  if (!data.title) {
    throw new MusicResolverError("TRACK_NOT_FOUND", "Spotify track metadata not found", "spotify");
  }

  return {
    track: {
      title: data.title,
      artists: publicMetadata.artist ? [{ name: publicMetadata.artist }] : [],
      thumbnail: data.thumbnail_url,
    },
    link: {
      url: canonical,
      id,
      type: "TRACK",
      confidence: 1,
      match_method: "source",
    },
  };
}

type UnknownObject = Record<string, unknown>;

function isObject(value: unknown): value is UnknownObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectTrackObjects(value: unknown, out: UnknownObject[] = []): UnknownObject[] {
  if (Array.isArray(value)) {
    for (const item of value) collectTrackObjects(item, out);
    return out;
  }
  if (!isObject(value)) return out;

  const uri = typeof value.uri === "string" ? value.uri : undefined;
  if (uri?.startsWith("spotify:track:") && typeof value.name === "string") out.push(value);
  for (const child of Object.values(value)) collectTrackObjects(child, out);
  return out;
}

function spotifyCandidateFromObject(value: UnknownObject): { track: MusicTrack; id: string } | null {
  const uri = typeof value.uri === "string" ? value.uri : "";
  const id = uri.startsWith("spotify:track:") ? uri.slice("spotify:track:".length) : "";
  if (!TRACK_ID.test(id) || typeof value.name !== "string") return null;

  const artists: Array<{ name: string }> = [];
  const artistContainer = isObject(value.artists) ? value.artists : null;
  const items = artistContainer && Array.isArray(artistContainer.items) ? artistContainer.items : [];
  for (const item of items) {
    if (!isObject(item)) continue;
    const profile = isObject(item.profile) ? item.profile : null;
    if (profile && typeof profile.name === "string") artists.push({ name: profile.name });
  }

  const albumObj = isObject(value.album) ? value.album : null;
  const album = albumObj && typeof albumObj.name === "string" ? { name: albumObj.name } : undefined;
  const durationObj = isObject(value.duration) ? value.duration : null;
  const duration = durationObj && typeof durationObj.totalMilliseconds === "number"
    ? durationObj.totalMilliseconds
    : undefined;

  return {
    id,
    track: {
      title: value.name,
      artists,
      album,
      duration_ms: duration,
    },
  };
}

async function getAnonymousSpotifyToken(): Promise<string | null> {
  const endpoint = new URL("https://open.spotify.com/get_access_token");
  endpoint.searchParams.set("reason", "transport");
  endpoint.searchParams.set("productType", "web_player");
  try {
    const response = await fetch(endpoint.toString(), {
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json() as { accessToken?: string };
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function searchSpotify(track: MusicTrack): Promise<{ track: MusicTrack; link: ServiceLink } | null> {
  const token = await getAnonymousSpotifyToken();
  if (!token) return null;

  const query = [track.artists[0]?.name, track.title].filter(Boolean).join(" ");
  const endpoint = new URL("https://api-partner.spotify.com/pathfinder/v1/query");
  endpoint.searchParams.set("operationName", "searchTracks");
  endpoint.searchParams.set("variables", JSON.stringify({
    searchTerm: query,
    offset: 0,
    limit: 5,
    numberOfTopResults: 5,
    includeAudiobooks: false,
    includePreReleases: false,
  }));
  endpoint.searchParams.set("extensions", JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: SEARCH_TRACKS_HASH },
  }));

  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      redirect: "error",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "app-platform": "WebPlayer",
        origin: "https://open.spotify.com",
        referer: "https://open.spotify.com/",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const json = await response.json() as unknown;
  const candidates = collectTrackObjects(json)
    .map(spotifyCandidateFromObject)
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  let best: { track: MusicTrack; id: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreTrackMatch(track, candidate.track);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (!best || best.score < 0.85) return null;

  return {
    track: best.track,
    link: {
      id: best.id,
      url: `https://open.spotify.com/track/${best.id}`,
      type: "TRACK",
      confidence: Number(best.score.toFixed(3)),
      match_method: "search",
    },
  };
}
