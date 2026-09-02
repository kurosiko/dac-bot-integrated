import type { MusicService, ServiceLink } from "../types";
import { MusicResolverError } from "../types";

export function parseYouTubeUrl(raw: string): { id: string; service: MusicService } | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }

  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (host === "youtube.com" || host === "www.youtube.com" || host === "music.youtube.com") {
    id = url.searchParams.get("v");
  }
  if (!id || !/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
  return { id, service: host === "music.youtube.com" ? "youtube_music" : "youtube" };
}

export async function youtubeOEmbed(raw: string): Promise<{ title: string; author: string; thumbnail?: string }> {
  const parsed = parseYouTubeUrl(raw);
  if (!parsed) throw new MusicResolverError("UNSUPPORTED_URL", "Invalid YouTube URL");

  const watchUrl = `https://www.youtube.com/watch?v=${parsed.id}`;
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", watchUrl);
  endpoint.searchParams.set("format", "json");
  const response = await fetch(endpoint.toString());
  if (!response.ok) throw new MusicResolverError("UPSTREAM_ERROR", `YouTube oEmbed returned ${response.status}`, parsed.service);
  const data = await response.json() as { title: string; author_name: string; thumbnail_url?: string };
  return { title: data.title, author: data.author_name, thumbnail: data.thumbnail_url };
}

export function youtubeLink(id: string, service: "youtube" | "youtube_music", confidence = 1): ServiceLink {
  return service === "youtube_music"
    ? { id, url: `https://music.youtube.com/watch?v=${id}`, type: "ATV", confidence }
    : { id, url: `https://www.youtube.com/watch?v=${id}`, type: "OMV", confidence };
}
