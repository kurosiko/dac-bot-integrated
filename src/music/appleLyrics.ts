type AppleSong = {
  id: string;
  title: string;
  artist: string;
  url?: string;
};

type PaxSyllable = {
  text?: string;
  part?: boolean;
};

type PaxLine = {
  text?: PaxSyllable[];
  timestamp?: number;
};

let cachedAppleToken = "";

const APPLE_HOME = "https://beta.music.apple.com";
const APPLE_ORIGIN = "https://music.apple.com";
const TOKEN_RE = /eyJ[A-Za-z0-9\-_]+=*\.[A-Za-z0-9\-_]+=*\.[A-Za-z0-9\-_]+=*/;
const INDEX_RE = /\/assets\/index~[^/"']+\.js/;

async function getAppleToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedAppleToken) return cachedAppleToken;

  const home = await fetch(APPLE_HOME, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!home.ok) throw new Error(`Apple Music homepage returned ${home.status}`);

  const html = await home.text();
  const indexPath = html.match(INDEX_RE)?.[0];
  if (!indexPath) throw new Error("Apple Music index bundle not found");

  const bundle = await fetch(`${APPLE_HOME}${indexPath}`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: `${APPLE_ORIGIN}/`,
    },
  });
  if (!bundle.ok) throw new Error(`Apple Music bundle returned ${bundle.status}`);

  const js = await bundle.text();
  const token = js.match(TOKEN_RE)?.[0];
  if (!token) throw new Error("Apple Music web token not found");

  cachedAppleToken = token;
  return token;
}

async function appleSearchRequest(query: string, token: string): Promise<Response> {
  const url = new URL("https://amp-api.music.apple.com/v1/catalog/jp/search");
  url.searchParams.set("term", query);
  url.searchParams.set("types", "songs");
  url.searchParams.set("limit", "5");
  url.searchParams.set("l", "ja-JP");
  url.searchParams.set("platform", "web");
  url.searchParams.set("format[resources]", "map");

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: APPLE_ORIGIN,
      Referer: `${APPLE_ORIGIN}/`,
      "User-Agent": "Mozilla/5.0",
    },
  });
}

export async function searchAppleSong(query: string): Promise<AppleSong | null> {
  let token = await getAppleToken();
  let response = await appleSearchRequest(query, token);

  if (response.status === 401) {
    cachedAppleToken = "";
    token = await getAppleToken(true);
    response = await appleSearchRequest(query, token);
  }

  if (!response.ok) {
    throw new Error(`Apple Music search returned ${response.status}`);
  }

  const root = (await response.json()) as any;
  const item = root?.results?.songs?.data?.[0];
  if (!item?.id) return null;

  const detail = root?.resources?.songs?.[item.id];
  const attrs = detail?.attributes;
  if (!attrs?.name) return null;

  return {
    id: String(item.id),
    title: String(attrs.name),
    artist: String(attrs.artistName ?? ""),
    url: typeof attrs.url === "string" ? attrs.url : undefined,
  };
}

export async function fetchAppleLyrics(songId: string): Promise<PaxLine[] | null> {
  const url = new URL("https://lyrics.paxsenix.org/apple-music/lyrics");
  url.searchParams.set("id", songId);

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Lyrics provider returned ${response.status}`);
  }

  const body = (await response.json()) as any;
  const lines = Array.isArray(body) ? body : body?.content;
  return Array.isArray(lines) ? lines : null;
}

export function formatSyncedLyrics(lines: PaxLine[]): string[] {
  return lines
    .map((line) => {
      const timestamp = Number(line.timestamp ?? 0);
      const totalSeconds = Math.max(0, Math.floor(timestamp / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

      const text = (line.text ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      return text ? `[${time}] ${text}` : "";
    })
    .filter(Boolean);
}
