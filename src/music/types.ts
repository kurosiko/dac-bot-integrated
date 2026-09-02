export type MusicService = "spotify" | "youtube" | "youtube_music";

export interface MusicArtist {
  name: string;
}

export interface MusicAlbum {
  name: string;
}

export interface MusicTrack {
  title: string;
  artists: MusicArtist[];
  album?: MusicAlbum;
  duration_ms?: number;
  isrc?: string;
  thumbnail?: string;
}

export interface ServiceLink {
  url: string;
  id: string;
  type?: "TRACK" | "ATV" | "OMV";
  confidence: number;
}

export interface MusicResolveResult {
  track: MusicTrack;
  source: { service: MusicService; url: string };
  links: {
    spotify: ServiceLink | null;
    youtube_music: ServiceLink | null;
    youtube: ServiceLink | null;
  };
}

export class MusicResolverError extends Error {
  constructor(
    public code: "UNSUPPORTED_URL" | "TRACK_NOT_FOUND" | "UPSTREAM_ERROR",
    message: string,
    public provider?: MusicService,
  ) {
    super(message);
  }
}
