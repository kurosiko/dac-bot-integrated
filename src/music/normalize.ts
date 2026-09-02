const VERSION_RULES: Array<[string, RegExp]> = [
  ["live", /\blive\b/i],
  ["remix", /\bremix\b/i],
  ["remaster", /\b(?:remaster(?:ed)?|\d{4}\s+remaster)\b/i],
  ["acoustic", /\bacoustic\b/i],
  ["instrumental", /\binstrumental\b/i],
  ["radio-edit", /\bradio\s+edit\b/i],
  ["nightcore", /\bnightcore\b/i],
  ["sped-up", /\bsped\s*up\b/i],
  ["slowed", /\bslowed(?:\s*(?:\+|and)\s*reverb)?\b/i],
];

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(?:feat|ft)\.?\s+/g, " feat ")
    .replace(/&/g, " and ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractVersionTags(value: string): Set<string> {
  const tags = new Set<string>();
  for (const [tag, pattern] of VERSION_RULES) {
    if (pattern.test(value)) tags.add(tag);
  }
  return tags;
}

export function tokenSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const aTokens = new Set(na.split(" "));
  const bTokens = new Set(nb.split(" "));
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  const jaccard = union ? intersection / union : 0;

  if (na.includes(nb) || nb.includes(na)) return Math.max(jaccard, 0.88);
  return jaccard;
}

export function versionCompatible(a: string, b: string): boolean {
  const aa = extractVersionTags(a);
  const bb = extractVersionTags(b);
  if (aa.size === 0 && bb.size === 0) return true;
  if (aa.size !== bb.size) return false;
  for (const tag of aa) {
    if (!bb.has(tag)) return false;
  }
  return true;
}
