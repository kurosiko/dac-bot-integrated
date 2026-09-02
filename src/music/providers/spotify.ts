import type { MusicTrack, ServiceLink } from "../types";
import { MusicResolverError } from "../types";
import { scoreTrackMatch } from "../matcher";

const TRACK_ID = /^[A-Za-z0-9]{22}$/;
const SEARCH_TRACKS_HASH = "bc1ca2fcd0ba1013a0fc88e6cc4f190af501851e3dafd3e1ef85840297694428";
const SPOTIFY_TOTP_SECRET = "GM3TMMJTGYZTQNZVGM4DINJZHA4TGOBYGMZTCMRTGEYDSMJRHE4TEOBUG4YTCMRUGQ4DQOJUGQYTAMRRGA2TCMJSHE3TCMBY";
const SPOTIFY_TOTP_VERSION = 61;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

type UnknownObject = Record<string, unknown>;

interface SpotifyWebSession {
  accessToken: string;
  clientToken?: string;
  expiresAt: number;
}

let sessionPromise: Promise<SpotifyWebSession | null> | null = null;
let cachedSession: SpotifyWebSession | null = null;

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
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
    });
    if (!response.ok) return {};
    const html = await response.text();
    return { artist: parseArtistFromHtml(html) };
  } catch {
    return {};
  }
}

function isObject(value: unknown): value is UnknownObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return out;
}

async function spotifyTotp(nowMs = Date.now()): Promise<string> {
  const counter = BigInt(Math.floor(nowMs / 1000 / 30));
  const message = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i -= 1) {
    message[i] = Number(value & 0xffn);
    value >>= 8n;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(SPOTIFY_TOTP_SECRET),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = signature[signature.length - 1] & 0x0f;
  const code = (
    ((signature[offset] & 0x7f) << 24)
    | (signature[offset + 1] << 16)
    | (signature[offset + 2] << 8)
    | signature[offset + 3]
  ) % 1_000_000;
  return code.toString().padStart(6, "0");
}

async function fetchSpotifyRootConfig(): Promise<{ clientVersion?: string }> {
  try {
    const response = await fetch("https://open.spotify.com/", {
      redirect: "error",
      headers: { accept: "text/html", "user-agent": USER_AGENT },
    });
    if (!response.ok) return {};
    const html = await response.text();
    const encoded = html.match(/<script id="appServerConfig" type="text\/plain">([^<]+)<\/script>/i)?.[1];
    if (!encoded) return {};
    const decoded = atob(encoded);
    const config = JSON.parse(decoded) as { clientVersion?: string };
    return { clientVersion: config.clientVersion };
  } catch {
    return {};
  }
}

async function fetchAccessToken(): Promise<{ accessToken: string; clientId?: string; expiresAt: number } | null> {
  const legacy = new URL("https://open.spotify.com/get_access_token");
  legacy.searchParams.set("reason", "transport");
  legacy.searchParams.set("productType", "web_player");

  try {
    const response = await fetch(legacy.toString(), {
      redirect: "error",
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    if (response.ok) {
      const data = await response.json() as {
        accessToken?: string;
        clientId?: string;
        accessTokenExpirationTimestampMs?: number;
      };
      if (data.accessToken) {
        return {
          accessToken: data.accessToken,
          clientId: data.clientId,
          expiresAt: data.accessTokenExpirationTimestampMs ?? Date.now() + 55 * 60_000,
        };
      }
    }
  } catch {
    // Newer web player deployments use /api/token with a TOTP challenge.
  }

  for (const offsetMs of [0, -30_000, 30_000]) {
    try {
      const code = await spotifyTotp(Date.now() + offsetMs);
      const endpoint = new URL("https://open.spotify.com/api/token");
      endpoint.searchParams.set("reason", "init");
      endpoint.searchParams.set("productType", "web-player");
      endpoint.searchParams.set("totp", code);
      endpoint.searchParams.set("totpVer", String(SPOTIFY_TOTP_VERSION));
      endpoint.searchParams.set("totpServer", code);

      const response = await fetch(endpoint.toString(), {
        redirect: "error",
        headers: {
          accept: "application/json",
          "content-type": "application/json;charset=UTF-8",
          "user-agent": USER_AGENT,
        },
      });
      if (!response.ok) continue;
      const data = await response.json() as {
        accessToken?: string;
        clientId?: string;
        accessTokenExpirationTimestampMs?: number;
      };
      if (data.accessToken) {
        return {
          accessToken: data.accessToken,
          clientId: data.clientId,
          expiresAt: data.accessTokenExpirationTimestampMs ?? Date.now() + 55 * 60_000,
        };
      }
    } catch {
      // Try the adjacent 30 second TOTP window.
    }
  }
  return null;
}

async function fetchClientToken(
  clientId: string | undefined,
  clientVersion: string | undefined,
): Promise<string | undefined> {
  if (!clientId || !clientVersion) return undefined;
  try {
    const response = await fetch("https://clienttoken.spotify.com/v1/clienttoken", {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_data: {
          client_version: clientVersion,
          client_id: clientId,
          js_sdk_data: {
            device_brand: "unknown",
            device_model: "unknown",
            os: "windows",
            os_version: "NT 10.0",
            device_id: crypto.randomUUID().replace(/-/g, ""),
            device_type: "computer",
          },
        },
      }),
    });
    if (!response.ok) return undefined;
    const data = await response.json() as {
      response_type?: string;
      granted_token?: { token?: string };
    };
    return data.granted_token?.token;
  } catch {
    return undefined;
  }
}

async function getSpotifyWebSession(): Promise<SpotifyWebSession | null> {
  if (cachedSession && cachedSession.expiresAt - 30_000 > Date.now()) return cachedSession;
  if (sessionPromise) return await sessionPromise;

  sessionPromise = (async () => {
    const [access, root] = await Promise.all([fetchAccessToken(), fetchSpotifyRootConfig()]);
    if (!access) return null;
    const clientToken = await fetchClientToken(access.clientId, root.clientVersion);
    return {
      accessToken: access.accessToken,
      clientToken,
      expiresAt: access.expiresAt,
    };
  })();

  try {
    cachedSession = await sessionPromise;
    return cachedSession;
  } finally {
    sessionPromise = null;
  }
}

export async function resolveSpotify(raw: string): Promise<{ track: MusicTrack; link: ServiceLink }> {
  const id = spotifyTrackId(raw);
  if (!id) throw new MusicResolverError("UNSUPPORTED_URL", "Invalid Spotify track URL");

  const canonical = `https://open.spotify.com/track/${id}`;
  const oembed = new URL("https://open.spotify.com/oembed");
  oembed.searchParams.set("url", canonical);

  const [oembedResponse, publicMetadata] = await Promise.all([
    fetch(oembed.toString(), { redirect: "error", headers: { "user-agent": USER_AGENT } }),
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

function collectTrackObjects(value: unknown, out: UnknownObject[] = []): UnknownObject[] {
  if (Array.isArray(value)) {
    for (const item of value) collectTrackObjects(item, out);
    return out;
  }
  if (!isObject(value)) return out;

  const uri = typeof value.uri === "string" ? value.uri : undefined;
  const id = typeof value.id === "string" ? value.id : undefined;
  if ((uri?.startsWith("spotify:track:") || TRACK_ID.test(id ?? "")) && typeof value.name === "string") {
    out.push(value);
  }
  for (const child of Object.values(value)) collectTrackObjects(child, out);
  return out;
}

function spotifyCandidateFromObject(value: UnknownObject): { track: MusicTrack; id: string } | null {
  const uri = typeof value.uri === "string" ? value.uri : "";
  const directId = typeof value.id === "string" ? value.id : "";
  const id = uri.startsWith("spotify:track:") ? uri.slice("spotify:track:".length) : directId;
  if (!TRACK_ID.test(id) || typeof value.name !== "string") return null;

  const artists: Array<{ name: string }> = [];
  const artistContainer = isObject(value.artists) ? value.artists : null;
  const items = artistContainer && Array.isArray(artistContainer.items) ? artistContainer.items : [];
  for (const item of items) {
    if (!isObject(item)) continue;
    const profile = isObject(item.profile) ? item.profile : null;
    if (profile && typeof profile.name === "string") artists.push({ name: profile.name });
  }

  const albumObj = isObject(value.album)
    ? value.album
    : isObject(value.albumOfTrack)
      ? value.albumOfTrack
      : null;
  const album = albumObj && typeof albumObj.name === "string" ? { name: albumObj.name } : undefined;
  const durationObj = isObject(value.duration)
    ? value.duration
    : isObject(value.trackDuration)
      ? value.trackDuration
      : null;
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

export async function searchSpotify(
  track: MusicTrack,
): Promise<{ track: MusicTrack; link: ServiceLink } | null> {
  const session = await getSpotifyWebSession();
  if (!session) return null;

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

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${session.accessToken}`,
    "app-platform": "WebPlayer",
    origin: "https://open.spotify.com",
    referer: "https://open.spotify.com/",
    "user-agent": USER_AGENT,
  };
  if (session.clientToken) headers["client-token"] = session.clientToken;

  let response: Response;
  try {
    response = await fetch(endpoint.toString(), { redirect: "error", headers });
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
