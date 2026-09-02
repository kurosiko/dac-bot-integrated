export type MusicService = "spotify" | "youtube" | "youtube_music";
export type MatchMethod = "source" | "counterpart" | "isrc" | "metadata" | "search";
export type MusicLinkType = "TRACK" | "ATV" | "OMV";

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
  type: MusicLinkType;
  confidence: number;
  match_method: MatchMethod;
}

export interface MusicResolveResult {
  track: MusicTrack;
  source: {
    service: MusicService;
    url: string;
  };
  links: {
    spotify: ServiceLink | null;
    youtube_music: ServiceLink | null;
    youtube: ServiceLink | null;
  };
  warnings: string[];
}

export type MusicResolverErrorCode =
  | "INVALID_PARAMETERS"
  | "UNSUPPORTED_URL"
  | "TRACK_NOT_FOUND"
  | "UPSTREAM_ERROR";

export class MusicResolverError extends Error {
  constructor(
    public code: MusicResolverErrorCode,
    message: string,
    public provider?: MusicService,
  ) {
    super(message);
    this.name = "MusicResolverError";
  }
}
