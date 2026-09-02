import type { MusicTrack } from "./types";
import { tokenSimilarity, versionCompatible } from "./normalize";

function artistScore(source: MusicTrack, candidate: MusicTrack): number {
  if (!source.artists.length || !candidate.artists.length) return 0;
  let best = 0;
  for (const sourceArtist of source.artists) {
    for (const candidateArtist of candidate.artists) {
      best = Math.max(best, tokenSimilarity(sourceArtist.name, candidateArtist.name));
    }
  }
  return best;
}

export function scoreTrackMatch(source: MusicTrack, candidate: MusicTrack): number {
  const title = tokenSimilarity(source.title, candidate.title);
  const artist = artistScore(source, candidate);
  const album = source.album?.name && candidate.album?.name
    ? tokenSimilarity(source.album.name, candidate.album.name)
    : 0;

  let duration = 0;
  if (source.duration_ms && candidate.duration_ms) {
    const diff = Math.abs(source.duration_ms - candidate.duration_ms);
    duration = diff <= 2_000 ? 1 : diff <= 5_000 ? 0.7 : diff <= 10_000 ? 0.25 : 0;
  }

  let score: number;
  if (source.artists.length > 0) {
    score = title * 0.58 + artist * 0.30 + album * 0.07 + duration * 0.05;
  } else {
    score = title * 0.88 + album * 0.07 + duration * 0.05;
  }

  if (!versionCompatible(source.title, candidate.title)) score -= 0.25;
  return Math.max(0, Math.min(1, score));
}
