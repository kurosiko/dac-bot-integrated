# Music Link Resolver 設計書

## 1. 目的

Spotify / YouTube / YouTube Music のいずれかの楽曲 URL から同一 Recording を特定し、各サービス上の canonical link を返す。

```text
Recording
   ├── Spotify Track
   ├── YouTube Music ATV / Song
   └── YouTube OMV
```

YouTube Music はアルバム/シングルの公式音源（ATV）、YouTube は公式 Music Video（OMV）として扱う。同じ `videoId` の流用は前提にしない。

## 2. Runtime / Integration

本機能は既存の dac-bot-integrated に統合する。

- TypeScript
- Hono
- Cloudflare Workers
- Cloudflare D1
- Discord `CommandModule`

構造:

```text
src/index.ts
  ├── GET /music
  │     └── src/handler/music.ts
  │            └── src/music/cache.ts
  │                   └── src/music/resolver.ts
  │                          ├── providers/spotify.ts
  │                          ├── providers/youtubeMusic.ts
  │                          └── providers/youtube.ts
  │
  └── Discord POST /
        └── src/mod/command/music.ts
               └── src/mod/api.ts
                      └── same cached resolver
```

REST API と Discord command は同じ Resolver を使用する。

## 3. API

### `GET /music`

```http
GET /music?url={URL}
```

対応 URL:

```text
https://open.spotify.com/track/{trackId}
https://youtube.com/watch?v={videoId}
https://www.youtube.com/watch?v={videoId}
https://youtu.be/{videoId}
https://music.youtube.com/watch?v={videoId}
```

任意 URL をそのまま fetch せず、hostname と ID を検証して Provider 側で URL を再構築する。

## 4. Response

```json
{
  "track": {
    "title": "Song Name",
    "artists": [{ "name": "Artist Name" }],
    "album": { "name": "Album Name" },
    "duration_ms": 213000,
    "isrc": "JPXXXXXXXXXX",
    "thumbnail": "https://..."
  },
  "source": {
    "service": "spotify",
    "url": "https://open.spotify.com/track/..."
  },
  "links": {
    "spotify": {
      "id": "...",
      "url": "https://open.spotify.com/track/...",
      "type": "TRACK",
      "confidence": 1,
      "match_method": "source"
    },
    "youtube_music": {
      "id": "...",
      "url": "https://music.youtube.com/watch?v=...",
      "type": "ATV",
      "confidence": 0.95,
      "match_method": "search"
    },
    "youtube": {
      "id": "...",
      "url": "https://www.youtube.com/watch?v=...",
      "type": "OMV",
      "confidence": 0.99,
      "match_method": "counterpart"
    }
  },
  "warnings": []
}
```

取得できないサービスは `null` とし、誤った候補を強制的に返さない。

## 5. Internal Types

```ts
type MusicService = "spotify" | "youtube_music" | "youtube";

type MatchMethod =
  | "source"
  | "counterpart"
  | "isrc"
  | "metadata"
  | "search";

interface MusicTrack {
  title: string;
  artists: { name: string }[];
  album?: { name: string };
  duration_ms?: number;
  isrc?: string;
  thumbnail?: string;
}

interface ServiceLink {
  id: string;
  url: string;
  type: "TRACK" | "ATV" | "OMV";
  confidence: number;
  match_method: MatchMethod;
}
```

## 6. Spotify Provider

Spotify Track URL から ID を抽出し、入力元 metadata はまず公式 oEmbed と公開ページ metadata を利用する。

```text
Spotify URL
   ↓
Track ID
   ↓
oEmbed ─────────→ title / thumbnail
public page ────→ artist (best effort)
```

Spotify Web API / Development Mode を必須にしない。

YouTube / YouTube Music から Spotify を逆引きする場合は、Spotify Web Player が利用している内部 Pathfinder API を best-effort fallback として利用する。匿名 session は旧 `get_access_token` を先に試し、利用できない場合は現行 Web Player の `/api/token` TOTP flow と `client-token` を試す。

これらは非公式 endpoint のため Provider 内へ隔離し、失敗した場合は Resolver 全体を失敗させず `spotify: null` とする。

## 7. YouTube Music Provider

YouTube Music は楽曲同定の中心 Provider とする。

Cloudflare Worker 内から Python の `ytmusicapi` を実行せず、同ライブラリが利用する YouTube Music Innertube request を TypeScript で実装する。

Client context:

```text
clientName = WEB_REMIX
clientVersion = 1.YYYYMMDD.01.00
hl = en
gl = JP
```

### Song search

`youtubei/v1/search` を Song filter 付きで呼び、`MUSIC_VIDEO_TYPE_ATV` の候補のみを canonical YouTube Music Song として採用する。

```text
Track metadata
    ↓
YTM Song Search
    ↓
ATV candidates
    ↓
Matcher
    ↓
best ATV
```

## 8. ATV / OMV Counterpart

ATV と OMV の対応は検索より provider-native relation を優先する。

`youtubei/v1/next` の watch playlist 内にある `playlistPanelVideoWrapperRenderer` の primary / counterpart を解析する。

```text
ATV
 │
 ▼
YouTube Music next
 │
 ▼
Song / Video switcher counterpart
 │
 ▼
OMV
```

counterpart が `MUSIC_VIDEO_TYPE_OMV` と判定できる場合のみ canonical YouTube MV として返す。

`match_method = "counterpart"`、標準 confidence は `0.99` とする。

## 9. YouTube Input

YouTube URL 入力時は oEmbed を fallback metadata として取得し、YouTube Music `next` から ATV / OMV pair を探索する。

- 入力が ATV: その ATV を YouTube Music source として利用
- 入力が OMV: counterpart の ATV を canonical YouTube Music Song とする
- UGC / 不明: metadata から YTM Song search を行い ATV を再特定
- OMV と確認できない通常 YouTube URLは canonical YouTube link として強制採用しない

## 10. Matching

`src/music/normalize.ts` と `src/music/matcher.ts` で Provider 間の候補を比較する。

正規化:

- Unicode NFKC
- lowercase
- punctuation / symbol
- whitespace
- `feat.` / `ft.`

ただし以下の version token は同一視しない。

- Live
- Remix
- Remaster
- Acoustic
- Instrumental
- Radio Edit
- Nightcore
- Sped Up
- Slowed

評価対象:

- title
- artist
- album
- duration
- version compatibility

基本 threshold は `0.85`。Spotify metadata で artist が取得できない場合の YTM search のみ、title-only fallback としてより保守的な制限付きで扱う。

## 11. Confidence / Match Method

目安:

| Method | Confidence |
|---|---:|
| 入力元そのもの | 1.00 |
| YouTube counterpart | 0.99 |
| 高一致 metadata | 0.90–0.97 |
| search | 0.85+ |

confidence だけではなく `match_method` を必ず付ける。

## 12. Partial Result / Errors

一部 Provider が取得できない場合は成功レスポンスを返す。

```json
{
  "links": {
    "spotify": null,
    "youtube_music": {},
    "youtube": {}
  },
  "warnings": ["SPOTIFY_TRACK_NOT_FOUND"]
}
```

HTTP error:

- `400 INVALID_PARAMETERS`
- `400 UNSUPPORTED_URL`
- `404 TRACK_NOT_FOUND`
- `502 UPSTREAM_ERROR`

入力元そのものを取得できない場合のみエラーとし、cross-provider failure は原則 warning にする。

## 13. D1 Cache

REST API と Discord command は同じ D1 cache を使用する。

key:

```text
spotify:{trackId}
youtube:{videoId}
youtube_music:{videoId}
```

schema:

```sql
CREATE TABLE IF NOT EXISTS music_cache (
    key TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    resolved_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
```

TTL は MVP で 24 時間。

既存 DB にまだ `music_cache` が作成されていない場合、cache read/write failure は無視して Resolver を通常実行する。

## 14. Discord Command

```text
/music url:<Spotify / YouTube Music / YouTube URL>
```

`src/mod/command/music.ts` を `CommandModule` として実装し、以下の両方へ登録する。

- `src/index.ts` の `commands` Map
- `src/register.ts` の command registration array

Discord command からも `src/mod/api.ts -> resolveMusicCached()` を通す。

## 15. Security

allowlist:

```text
open.spotify.com
youtube.com
www.youtube.com
youtu.be
music.youtube.com
```

入力 URL そのものを任意 fetch しない。Spotify / YouTube の ID を抽出後、固定された Provider endpoint のみへ request する。

## 16. Current MVP Status

実装済み:

- `GET /music`
- Spotify / YouTube / YouTube Music URL parser
- Spotify oEmbed / public metadata
- YTM Song search
- ATV filtering
- ATV ↔ OMV counterpart
- Normalizer
- Matcher
- confidence / match_method
- partial results / warnings
- best-effort Spotify reverse lookup
- D1 cache
- Discord `/music`
- Discord command registration

未実装 / 将来:

- ISRC の本格利用
- MusicBrainz fallback
- counterpart が存在しない場合の YouTube OMV search fallback
- API-level rate limiting
- Playlist / Album / Podcast / Audiobook
- Apple Music / Deezer / Tidal 等

## 17. Reliability

Spotify Web Player internal API と YouTube Music Innertube は公式の安定 API ではないため、仕様変更で破損する可能性がある。

そのため:

```text
Handler
  ↓
Cache
  ↓
Resolver
  ↓
Provider
```

を維持し、外部仕様変更を Provider 内に閉じ込める。

Provider が壊れても、他サービスで取得できた結果は partial result として返す。
