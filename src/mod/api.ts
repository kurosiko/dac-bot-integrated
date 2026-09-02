import {
  getVocabulary,
  getRanking,
  addVocabulary as addVocabularyDB,
  convertDB,
} from "../util";
import { resolveMusicUrl } from "../music/resolver";
import type { MusicResolveResult } from "../music/types";

export async function fetchVocabulary(
  type_str: string,
  category: string | null | undefined,
  user_id: string | null | undefined,
  db: any,
  executionCtx?: any,
): Promise<string | null> {
  const type = convertDB(type_str);
  const result = await getVocabulary(db, type, category, 1, user_id, executionCtx);
  if (result.results && Array.isArray(result.results) && result.results.length > 0) {
    return (result.results[0] as any).word || null;
  }
  return null;
}

export async function fetchRanking(
  type_str: string | null | undefined,
  db: any,
): Promise<{ user_id: string; count: number }[]> {
  const type = convertDB(type_str || "");
  const result = await getRanking(db, type);
  return (result.results as any) || [];
}

export async function addVocabulary(
  type_str: string,
  word: string,
  category: string | null | undefined,
  db: any,
): Promise<boolean> {
  const type = convertDB(type_str);
  const result = await addVocabularyDB(db, word, type, category);
  return !!result.success;
}

export async function fetchMusic(
  url: string,
): Promise<{ ok: true; data: MusicResolveResult } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await resolveMusicUrl(url) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
