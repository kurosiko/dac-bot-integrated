import type { MusicResolveResult } from "./types";
import { MusicResolverError } from "./types";
import { resolveSpotify, spotifyTrackId } from "./providers/spotify";
import { parseYouTubeUrl, youtubeLink, youtubeOEmbed } from "./providers/youtube";

export async function resolveMusicUrl(url: string): Promise<MusicResolveResult> {
  if (spotifyTrackId(url)) {
    const spotify = await resolveSpotify(url);
    return {
      track: spotify.track,
      source: { service: "spotify", url },
      links: { spotify: spotify.link, youtube_music: null, youtube: null },
    };
  }

  const youtube = parseYouTubeUrl(url);
  if (youtube) {
    const metadata = await youtubeOEmbed(url);
    return {
      track: {
        title: metadata.title,
        artists: metadata.author ? [{ name: metadata.author }] : [],
        thumbnail: metadata.thumbnail,
      },
      source: { service: youtube.service, url },
      links: {
        spotify: null,
        youtube_music: youtube.service === "youtube_music" ? youtubeLink(youtube.id, "youtube_music") : null,
        youtube: youtube.service === "youtube" ? youtubeLink(youtube.id, "youtube") : null,
      },
    };
  }

  throw new MusicResolverError("UNSUPPORTED_URL", "Supported services are Spotify, YouTube and YouTube Music");
}
