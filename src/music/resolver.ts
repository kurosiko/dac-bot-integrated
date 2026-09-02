import type { MusicResolveResult, MusicTrack } from "./types";
import { MusicResolverError } from "./types";
import { resolveSpotify, searchSpotify, spotifyTrackId } from "./providers/spotify";
import { parseYouTubeUrl, youtubeLink, youtubeOEmbed } from "./providers/youtube";
import {
  findBestYtmSong,
  getOmvCounterpart,
  getWatchPair,
  omvCandidateLink,
  ytmCandidateLink,
  type YtmTrackCandidate,
} from "./providers/youtubeMusic";

function mergeTrack(preferred: MusicTrack, enrichment?: MusicTrack | null): MusicTrack {
  if (!enrichment) return preferred;
  return {
    title: preferred.title || enrichment.title,
    artists: preferred.artists.length ? preferred.artists : enrichment.artists,
    album: preferred.album ?? enrichment.album,
    duration_ms: preferred.duration_ms ?? enrichment.duration_ms,
    isrc: preferred.isrc ?? enrichment.isrc,
    thumbnail: preferred.thumbnail ?? enrichment.thumbnail,
  };
}

function isAtv(candidate: YtmTrackCandidate | null): boolean {
  return candidate?.videoType === "MUSIC_VIDEO_TYPE_ATV";
}

function isOmv(candidate: YtmTrackCandidate | null): boolean {
  return candidate?.videoType === "MUSIC_VIDEO_TYPE_OMV";
}

async function resolveFromSpotify(url: string): Promise<MusicResolveResult> {
  const warnings: string[] = [];
  const spotify = await resolveSpotify(url);
  if (!spotify.track.artists.length) warnings.push("SPOTIFY_ARTIST_METADATA_UNAVAILABLE");

  let ytm = null;
  try {
    ytm = await findBestYtmSong(spotify.track);
  } catch (error) {
    warnings.push(`YOUTUBE_MUSIC_SEARCH_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }

  let youtube = null;
  if (ytm) {
    try {
      const counterpart = await getOmvCounterpart(ytm.videoId);
      if (counterpart) youtube = omvCandidateLink(counterpart);
      else warnings.push("YOUTUBE_OMV_NOT_FOUND");
    } catch (error) {
      warnings.push(`YOUTUBE_COUNTERPART_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    warnings.push("YOUTUBE_MUSIC_ATV_NOT_FOUND");
  }

  return {
    track: mergeTrack(spotify.track, ytm?.track),
    source: { service: "spotify", url },
    links: {
      spotify: spotify.link,
      youtube_music: ytm?.link ?? null,
      youtube,
    },
    warnings,
  };
}

async function getCanonicalYtmFromInput(
  videoId: string,
  fallbackTrack: MusicTrack,
): Promise<YtmTrackCandidate | null> {
  try {
    const pair = await getWatchPair(videoId);
    if (pair.primary?.videoId === videoId && isAtv(pair.primary)) return pair.primary;
    if (pair.counterpart?.videoId === videoId && isAtv(pair.counterpart)) return pair.counterpart;
    if (isAtv(pair.primary)) return pair.primary;
    if (isAtv(pair.counterpart)) return pair.counterpart;
  } catch {
    // Fall through to metadata search.
  }

  const searched = await findBestYtmSong(fallbackTrack);
  return searched ?? null;
}

async function resolveFromYoutube(
  url: string,
  service: "youtube" | "youtube_music",
  videoId: string,
): Promise<MusicResolveResult> {
  const warnings: string[] = [];
  const oembed = await youtubeOEmbed(url);
  const fallbackTrack: MusicTrack = {
    title: oembed.title,
    artists: oembed.author ? [{ name: oembed.author }] : [],
    thumbnail: oembed.thumbnail,
  };

  let directPair: Awaited<ReturnType<typeof getWatchPair>> | null = null;
  try {
    directPair = await getWatchPair(videoId);
  } catch (error) {
    warnings.push(`YOUTUBE_MUSIC_LOOKUP_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }

  let atv: YtmTrackCandidate | null = null;
  let omv: YtmTrackCandidate | null = null;

  for (const candidate of [directPair?.primary ?? null, directPair?.counterpart ?? null]) {
    if (!candidate) continue;
    if (isAtv(candidate)) atv ??= candidate;
    if (isOmv(candidate)) omv ??= candidate;
  }

  if (!atv) {
    try {
      atv = await getCanonicalYtmFromInput(videoId, fallbackTrack);
    } catch (error) {
      warnings.push(`YOUTUBE_MUSIC_SEARCH_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (atv && !omv) {
    try {
      omv = await getOmvCounterpart(atv.videoId);
    } catch (error) {
      warnings.push(`YOUTUBE_COUNTERPART_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const normalizedTrack = mergeTrack(atv?.track ?? fallbackTrack, fallbackTrack);

  let spotify = null;
  try {
    spotify = await searchSpotify(normalizedTrack);
    if (!spotify) warnings.push("SPOTIFY_TRACK_NOT_FOUND");
  } catch (error) {
    warnings.push(`SPOTIFY_SEARCH_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }

  const youtubeMusicLink = atv
    ? ytmCandidateLink(
      atv,
      atv.videoId === videoId && service === "youtube_music" ? 1 : 0.95,
      atv.videoId === videoId && service === "youtube_music" ? "source" : "metadata",
    )
    : null;

  let youtubeResult = null;
  if (omv) {
    youtubeResult = omv.videoId === videoId && service === "youtube"
      ? youtubeLink(omv.videoId, "youtube", 1, "source")
      : omvCandidateLink(omv);
  } else if (service === "youtube") {
    warnings.push("YOUTUBE_SOURCE_NOT_CONFIRMED_AS_OMV");
  }

  return {
    track: mergeTrack(normalizedTrack, spotify?.track),
    source: { service, url },
    links: {
      spotify: spotify?.link ?? null,
      youtube_music: youtubeMusicLink,
      youtube: youtubeResult,
    },
    warnings,
  };
}

export async function resolveMusicUrl(raw: string): Promise<MusicResolveResult> {
  const url = raw.trim();
  if (!url) throw new MusicResolverError("INVALID_PARAMETERS", "url is required");

  if (spotifyTrackId(url)) return await resolveFromSpotify(url);

  const youtube = parseYouTubeUrl(url);
  if (youtube) {
    return await resolveFromYoutube(url, youtube.service as "youtube" | "youtube_music", youtube.id);
  }

  throw new MusicResolverError("UNSUPPORTED_URL", "Supported services are Spotify, YouTube and YouTube Music");
}
