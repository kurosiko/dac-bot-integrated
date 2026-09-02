import type { MusicService, ServiceLink } from "../types";
import { MusicResolverError } from "../types";

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be"]);

export function parseYouTubeUrl(raw: string): { id: string; service: MusicService } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  }

  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    id,
    service: host === "music.youtube.com" ? "youtube_music" : "youtube",
  };
}

export async function youtubeOEmbed(raw: string): Promise<{ title: string; author: string; thumbnail?: string }> {
  const parsed = parseYouTubeUrl(raw);
  if (!parsed) throw new MusicResolverError("UNSUPPORTED_URL", "Invalid YouTube URL");

  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${parsed.id}`);
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint.toString(), { redirect: "error" });
  if (!response.ok) {
    if (response.status === 404) {
      throw new MusicResolverError("TRACK_NOT_FOUND", "YouTube video not found", parsed.service);
    }
    throw new MusicResolverError("UPSTREAM_ERROR", `YouTube oEmbed returned ${response.status}`, parsed.service);
  }

  const data = await response.json() as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };

  if (!data.title) {
    throw new MusicResolverError("TRACK_NOT_FOUND", "YouTube metadata not found", parsed.service);
  }

  return {
    title: data.title,
    author: data.author_name ?? "",
    thumbnail: data.thumbnail_url,
  };
}

export function youtubeLink(
  id: string,
  service: "youtube" | "youtube_music",
  confidence: number,
  matchMethod: ServiceLink["match_method"],
): ServiceLink {
  return service === "youtube_music"
    ? {
      id,
      url: `https://music.youtube.com/watch?v=${id}`,
      type: "ATV",
      confidence,
      match_method: matchMethod,
    }
    : {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      type: "OMV",
      confidence,
      match_method: matchMethod,
    };
}
