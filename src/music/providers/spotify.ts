import type { MusicTrack, ServiceLink } from "../types";
import { MusicResolverError } from "../types";

const SPOTIFY_TRACK = /^https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]+)(?:[/?].*)?$/;

export function spotifyTrackId(url: string): string | null {
  return url.match(SPOTIFY_TRACK)?.[1] ?? null;
}

export async function resolveSpotify(url: string): Promise<{ track: MusicTrack; link: ServiceLink }> {
  const id = spotifyTrackId(url);
  if (!id) throw new MusicResolverError("UNSUPPORTED_URL", "Invalid Spotify track URL");

  const canonical = `https://open.spotify.com/track/${id}`;
  const oembed = new URL("https://open.spotify.com/oembed");
  oembed.searchParams.set("url", canonical);

  const response = await fetch(oembed.toString(), {
    headers: { "User-Agent": "dac-bot-integrated/1.0" },
  });
  if (!response.ok) {
    throw new MusicResolverError("UPSTREAM_ERROR", `Spotify oEmbed returned ${response.status}`, "spotify");
  }

  const data = await response.json() as { title?: string; thumbnail_url?: string };
  if (!data.title) throw new MusicResolverError("TRACK_NOT_FOUND", "Spotify track metadata not found", "spotify");

  // oEmbed reliably exposes title + artwork. Artist enrichment is performed by
  // the cross-provider resolver so this provider remains independent of HTML layout.
  return {
    track: {
      title: data.title,
      artists: [],
      thumbnail: data.thumbnail_url,
    },
    link: { url: canonical, id, type: "TRACK", confidence: 1.0 },
  };
}
