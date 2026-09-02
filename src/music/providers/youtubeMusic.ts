import { scoreTrackMatch } from "../matcher";
import type { MusicTrack, ServiceLink } from "../types";
import { MusicResolverError } from "../types";
import { youtubeLink } from "./youtube";

const YTM_ORIGIN = "https://music.youtube.com";
const YTM_API = `${YTM_ORIGIN}/youtubei/v1`;
const SONG_SEARCH_PARAMS = "EgWKAQIIAWoMEA4QChADEAQQCRAF";

type JsonObject = Record<string, unknown>;

export interface YtmTrackCandidate {
  videoId: string;
  videoType?: string;
  track: MusicTrack;
}

let visitorPromise: Promise<string | undefined> | undefined;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPath(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") current = current[key];
    else if (isObject(current) && typeof key === "string") current = current[key];
    else return undefined;
  }
  return current;
}

function textFromRuns(value: unknown): string | undefined {
  if (!isObject(value) || !Array.isArray(value.runs)) return undefined;
  return value.runs.map((run) => isObject(run) && typeof run.text === "string" ? run.text : "").join("").trim() || undefined;
}

function collectByKey(value: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) collectByKey(item, key, out);
    return out;
  }
  if (!isObject(value)) return out;
  if (key in value) out.push(value[key]);
  for (const child of Object.values(value)) collectByKey(child, key, out);
  return out;
}

function findWatchEndpoint(value: unknown): JsonObject | undefined {
  const endpoints = collectByKey(value, "watchEndpoint");
  for (const endpoint of endpoints) {
    if (isObject(endpoint) && typeof endpoint.videoId === "string") return endpoint;
  }
  return undefined;
}

function musicVideoType(endpoint: JsonObject | undefined): string | undefined {
  const value = getPath(endpoint, ["watchEndpointMusicSupportedConfigs", "watchEndpointMusicConfig", "musicVideoType"]);
  return typeof value === "string" ? value : undefined;
}

function thumbnailFrom(value: unknown): string | undefined {
  const lists = collectByKey(value, "thumbnails");
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const urls = list
      .map((item) => isObject(item) && typeof item.url === "string" ? item.url : undefined)
      .filter((url): url is string => Boolean(url));
    if (urls.length) return urls[urls.length - 1];
  }
  return undefined;
}

function parseDurationMs(text: string | undefined): number | undefined {
  if (!text || !/^(?:\d+:)*\d{1,2}:\d{2}$/.test(text)) return undefined;
  const parts = text.split(":").map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds * 1000;
}

function metadataRunsToTrack(title: string, runs: unknown[], thumbnail?: string): MusicTrack {
  const artists: Array<{ name: string }> = [];
  let album: { name: string } | undefined;
  let duration_ms: number | undefined;

  for (const run of runs) {
    if (!isObject(run) || typeof run.text !== "string") continue;
    const text = run.text.trim();
    if (!text || text === "•" || text === "·") continue;

    const browseId = getPath(run, ["navigationEndpoint", "browseEndpoint", "browseId"]);
    if (typeof browseId === "string") {
      if (browseId.startsWith("MPRE") || browseId.includes("release_detail")) {
        album ??= { name: text };
      } else if (browseId.startsWith("UC") || browseId.startsWith("MPLA")) {
        if (!artists.some((artist) => artist.name === text)) artists.push({ name: text });
      }
      continue;
    }

    const parsedDuration = parseDurationMs(text);
    if (parsedDuration) duration_ms = parsedDuration;
  }

  return { title, artists, album, duration_ms, thumbnail };
}

function parseResponsiveItem(renderer: unknown): YtmTrackCandidate | null {
  if (!isObject(renderer)) return null;
  const flexColumns = Array.isArray(renderer.flexColumns) ? renderer.flexColumns : [];
  const titleColumn = getPath(flexColumns, [0, "musicResponsiveListItemFlexColumnRenderer", "text"]);
  const title = textFromRuns(titleColumn);
  if (!title) return null;

  const metadataRuns: unknown[] = [];
  for (let index = 1; index < flexColumns.length; index += 1) {
    const runs = getPath(flexColumns, [index, "musicResponsiveListItemFlexColumnRenderer", "text", "runs"]);
    if (Array.isArray(runs)) metadataRuns.push(...runs);
  }

  const endpoint = findWatchEndpoint(renderer);
  const videoId = typeof endpoint?.videoId === "string" ? endpoint.videoId : undefined;
  if (!videoId) return null;

  return {
    videoId,
    videoType: musicVideoType(endpoint),
    track: metadataRunsToTrack(title, metadataRuns, thumbnailFrom(renderer)),
  };
}

function parsePanelItem(renderer: unknown): YtmTrackCandidate | null {
  if (!isObject(renderer) || typeof renderer.videoId !== "string") return null;
  const title = textFromRuns(renderer.title);
  if (!title) return null;
  const bylineRuns = getPath(renderer, ["longBylineText", "runs"]);
  const endpoint = isObject(renderer.navigationEndpoint) && isObject(renderer.navigationEndpoint.watchEndpoint)
    ? renderer.navigationEndpoint.watchEndpoint
    : findWatchEndpoint(renderer);

  return {
    videoId: renderer.videoId,
    videoType: musicVideoType(endpoint),
    track: metadataRunsToTrack(
      title,
      Array.isArray(bylineRuns) ? bylineRuns : [],
      thumbnailFrom(renderer),
    ),
  };
}

async function getVisitorData(): Promise<string | undefined> {
  if (!visitorPromise) {
    visitorPromise = (async () => {
      try {
        const response = await fetch(`${YTM_ORIGIN}/`, {
          redirect: "error",
          headers: { accept: "text/html" },
        });
        if (!response.ok) return undefined;
        const html = await response.text();
        return html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/)?.[1]
          ?? html.match(/"visitorData"\s*:\s*"([^"]+)"/)?.[1];
      } catch {
        return undefined;
      }
    })();
  }
  return visitorPromise;
}

function clientVersion(): string {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `1.${date}.01.00`;
}

async function innertube(endpoint: "search" | "next", body: JsonObject): Promise<unknown> {
  const visitor = await getVisitorData();
  const headers: Record<string, string> = {
    accept: "*/*",
    "content-type": "application/json",
    origin: YTM_ORIGIN,
    referer: `${YTM_ORIGIN}/`,
  };
  if (visitor) headers["x-goog-visitor-id"] = visitor;

  let response: Response;
  try {
    response = await fetch(`${YTM_API}/${endpoint}?alt=json`, {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        ...body,
        context: {
          client: {
            clientName: "WEB_REMIX",
            clientVersion: clientVersion(),
            hl: "en",
            gl: "JP",
          },
          user: {},
        },
      }),
    });
  } catch (error) {
    throw new MusicResolverError("UPSTREAM_ERROR", `YouTube Music ${endpoint} request failed: ${String(error)}`, "youtube_music");
  }

  if (!response.ok) {
    throw new MusicResolverError("UPSTREAM_ERROR", `YouTube Music ${endpoint} returned ${response.status}`, "youtube_music");
  }
  return await response.json() as unknown;
}

export async function searchYtmSongs(track: MusicTrack): Promise<Array<YtmTrackCandidate & { score: number }>> {
  const query = [track.artists[0]?.name, track.title].filter(Boolean).join(" ");
  const response = await innertube("search", {
    query,
    params: SONG_SEARCH_PARAMS,
  });

  const renderers = collectByKey(response, "musicResponsiveListItemRenderer");
  const candidates = renderers
    .map(parseResponsiveItem)
    .filter((candidate): candidate is YtmTrackCandidate => candidate !== null)
    .filter((candidate) => candidate.videoType === "MUSIC_VIDEO_TYPE_ATV");

  return candidates
    .map((candidate) => ({ ...candidate, score: scoreTrackMatch(track, candidate.track) }))
    .sort((a, b) => b.score - a.score);
}

export async function findBestYtmSong(track: MusicTrack): Promise<(YtmTrackCandidate & { link: ServiceLink }) | null> {
  const candidates = await searchYtmSongs(track);
  const best = candidates[0];
  if (!best) return null;

  const threshold = track.artists.length > 0 ? 0.85 : 0.80;
  if (best.score < threshold) return null;

  const confidence = track.artists.length > 0
    ? Math.max(0.85, Math.min(0.97, best.score))
    : Math.max(0.80, Math.min(0.88, best.score));

  return {
    ...best,
    link: youtubeLink(best.videoId, "youtube_music", Number(confidence.toFixed(3)), "search"),
  };
}

export async function getWatchPair(videoId: string): Promise<{ primary: YtmTrackCandidate | null; counterpart: YtmTrackCandidate | null }> {
  const response = await innertube("next", {
    enablePersistentPlaylistPanel: true,
    isAudioOnly: true,
    tunerSettingValue: "AUTOMIX_SETTING_NORMAL",
    videoId,
    playlistId: `RDAMVM${videoId}`,
    watchEndpointMusicSupportedConfigs: {
      watchEndpointMusicConfig: {
        hasPersistentPlaylistPanel: true,
        musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
      },
    },
  });

  const wrappers = collectByKey(response, "playlistPanelVideoWrapperRenderer");
  for (const wrapper of wrappers) {
    if (!isObject(wrapper)) continue;
    const primaryRenderer = getPath(wrapper, ["primaryRenderer", "playlistPanelVideoRenderer"]);
    const counterpartRenderer = getPath(wrapper, ["counterpart", 0, "counterpartRenderer", "playlistPanelVideoRenderer"]);
    const primary = parsePanelItem(primaryRenderer);
    const counterpart = parsePanelItem(counterpartRenderer);
    if (primary?.videoId === videoId || counterpart?.videoId === videoId) return { primary, counterpart };
  }

  const panels = collectByKey(response, "playlistPanelVideoRenderer")
    .map(parsePanelItem)
    .filter((candidate): candidate is YtmTrackCandidate => candidate !== null);
  return {
    primary: panels.find((candidate) => candidate.videoId === videoId) ?? panels[0] ?? null,
    counterpart: null,
  };
}

export async function getOmvCounterpart(atvVideoId: string): Promise<YtmTrackCandidate | null> {
  const pair = await getWatchPair(atvVideoId);
  if (!pair.primary && !pair.counterpart) return null;

  const candidate = pair.primary?.videoId === atvVideoId
    ? pair.counterpart
    : pair.counterpart?.videoId === atvVideoId
      ? pair.primary
      : pair.counterpart;

  if (!candidate) return null;
  if (candidate.videoType && candidate.videoType !== "MUSIC_VIDEO_TYPE_OMV") return null;
  return candidate;
}

export function ytmCandidateLink(candidate: YtmTrackCandidate, confidence: number, method: ServiceLink["match_method"]): ServiceLink {
  return youtubeLink(candidate.videoId, "youtube_music", confidence, method);
}

export function omvCandidateLink(candidate: YtmTrackCandidate, confidence = 0.99): ServiceLink {
  return youtubeLink(candidate.videoId, "youtube", confidence, "counterpart");
}
