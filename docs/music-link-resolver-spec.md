# Universal Music Link Resolver API 仕様書

## 1. 概要

Spotify / YouTube / YouTube Music のいずれかの楽曲 URL を入力すると、その楽曲を特定し、3 サービスに対応する URL と楽曲メタデータを返す API を提供する。

- Spotify: 正式な Track
- YouTube Music: アルバム/シングルとして配信される Song (ATV)
- YouTube: Original Music Video (OMV / 公式 MV)

単純な URL 変換ではなく、入力 URL から楽曲を特定して共通 Track モデルへ正規化し、各サービス上の同一楽曲を解決する。

```text
                     Track
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Spotify     YouTube Music   YouTube
        Track          ATV          OMV
                         │
                         └─ counterpart ─→ OMV
```

YouTube と YouTube Music は同一 `videoId` の流用を前提とせず、それぞれ目的に合ったコンテンツを解決する。

## 2. Goals

### 2.1 入力

以下の URL を受け付ける。

```text
https://open.spotify.com/track/{trackId}
https://youtube.com/watch?v={videoId}
https://www.youtube.com/watch?v={videoId}
https://youtu.be/{videoId}
https://music.youtube.com/watch?v={videoId}
```

### 2.2 出力

最低限、以下を返す。

- 楽曲名
- アーティスト
- アルバム
- サムネイル
- Spotify URL
- YouTube Music URL (ATV)
- YouTube URL (OMV)

取得可能なら以下も返す。

- ISRC
- duration
- release information

### 2.3 API キー依存の最小化

可能な限り以下を要求しない。

- Spotify Premium
- Spotify OAuth
- Spotify Client ID / Secret
- Google API Key
- YouTube Data API

公開情報から取得可能な範囲を利用する。

## 3. Non-Goals

初期バージョンでは以下を保証しない。

- Spotify Playlist 全体の変換
- YouTube Playlist 全体の変換
- Album 単位の変換
- Podcast
- Audiobook
- ローカルファイル
- 音源ダウンロード
- 音声ストリーミング
- 歌詞取得
- 100% の楽曲一致保証
- MV が存在しない楽曲に対する MV 生成

本システムは音源そのものを配信・保存せず、メタデータと各サービスへのリンクのみ提供する。

## 4. API

### `GET /v1/resolve`

```http
GET /v1/resolve?url={URL}
```

Example:

```text
/v1/resolve?url=https://open.spotify.com/track/xxxxxxxx
```

Response:

```json
{
  "track": {
    "title": "Example Song",
    "artists": [{ "name": "Example Artist" }],
    "album": { "name": "Example Album" },
    "duration_ms": 213000,
    "isrc": "USXXXXXXXXXX",
    "thumbnail": "https://..."
  },
  "source": {
    "service": "spotify",
    "url": "https://open.spotify.com/track/..."
  },
  "links": {
    "spotify": {
      "url": "https://open.spotify.com/track/...",
      "id": "xxxxxxxx",
      "confidence": 1.0
    },
    "youtube_music": {
      "url": "https://music.youtube.com/watch?v=yyyyyyyy",
      "video_id": "yyyyyyyy",
      "type": "ATV",
      "confidence": 0.99
    },
    "youtube": {
      "url": "https://www.youtube.com/watch?v=zzzzzzzz",
      "video_id": "zzzzzzzz",
      "type": "OMV",
      "confidence": 1.0
    }
  }
}
```

## 5. Internal Track Model

各サービス固有のデータを直接相互変換せず、一度内部 Track モデルへ正規化する。

```rust
struct Track {
    title: String,
    artists: Vec<Artist>,
    album: Option<Album>,
    duration_ms: Option<u64>,
    isrc: Option<String>,
    thumbnail: Option<String>,
}

struct Artist {
    name: String,
}

struct Album {
    name: String,
}
```

サービス固有 ID は別管理する。

```rust
struct ServiceLinks {
    spotify: Option<SpotifyLink>,
    youtube_music: Option<YoutubeMusicLink>,
    youtube: Option<YoutubeLink>,
}
```

## 6. Provider Architecture

各サービスを独立した Provider として実装する。

```text
                 Resolver
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
SpotifyProvider  YTMProvider  YouTubeProvider
```

概念的な interface:

```rust
trait Provider {
    async fn resolve_url(&self, url: &Url) -> Result<TrackCandidate>;
    async fn search(&self, track: &Track) -> Result<Vec<TrackCandidate>>;
}
```

将来的に Apple Music / SoundCloud / Bandcamp / Deezer / Tidal / Amazon Music などを追加できる構造にする。

## 7. Spotify Resolver

### 7.1 Spotify URL 入力

Spotify Track ID を抽出する。

```text
open.spotify.com/track/{id}
                    ↓
                   id
```

公開 Spotify 情報から `title`, `artist`, `thumbnail` を取得する。

候補となる取得方法:

1. Spotify oEmbed
2. Spotify Embed ページ
3. Spotify 公開ページ metadata

Spotify Web API を必須としない。

### 7.2 Spotify 検索

他サービスから Spotify を解決する場合、`title`, `artist`, `album`, `ISRC` を利用する。

検索結果は以下で検証する。

- title similarity
- artist similarity
- album similarity
- duration difference
- ISRC match

ISRC 完全一致を最優先する。

## 8. YouTube Music Resolver

YouTube Music は主要な楽曲識別 Provider として扱う。

検索時は「動画」ではなく `Song` を取得する。

```python
ytmusic.search("Artist Song", filter="songs")
```

候補から `title`, `artist`, `album`, `duration` を比較して ATV を決定する。

### 8.1 ATV

YouTube Music 側では原則として `MUSIC_VIDEO_TYPE_ATV` を採用する。

ATV はアルバムアートを表示する公式配信音源として扱う。

```text
https://music.youtube.com/watch?v={ATV_VIDEO_ID}
```

## 9. YouTube Resolver

YouTube 側では原則として公式 MV (`MUSIC_VIDEO_TYPE_OMV`) を返す。

### 9.1 ATV → OMV

YouTube Music 上で ATV を取得できた場合、Song / Video switcher の対応関係を利用する。

```text
ATV
 │
 ▼
get_watch_playlist()
 │
 ▼
counterpart
 │
 ▼
OMV
```

`ATV -> counterpart -> OMV` を最も信頼度の高い MV 解決方法とする。

## 10. YouTube URL 入力

YouTube URL が入力された場合、まず動画タイプを判定する。

### OMV

```text
OMV
 ↓
対応する ATV を取得/検索
 ↓
Track 生成
```

### ATV

そのまま YouTube Music 側の候補として利用する。

### UGC

UGC を正規 Track として直接採用しない。

```text
UGC
 ↓
metadata 抽出
 ↓
title / artist 推定
 ↓
YTM Song 検索
 ↓
ATV 取得
 ↓
Track 確定
```

## 11. MV Fallback

すべての楽曲に OMV が存在するとは限らない。

ATV に `counterpart` が存在しない場合、基本動作は以下とする。

```json
{ "youtube": null }
```

オプションとして MV 検索 fallback を利用可能にする。

```http
GET /v1/resolve?url=...&youtube_fallback=true
```

fallback の候補評価では以下を加点する。

- Official Music Video
- Official Video
- OMV
- Artist official channel
- VEVO
- exact title
- exact artist

以下を減点する。

- Topic
- Provided to YouTube
- Official Audio
- Lyrics / Lyric Video
- Live
- Cover
- Fan upload
- UGC

## 12. Matching Engine

異なるサービス間の Track 一致判定を独立モジュールとして実装する。

```text
Candidate
   │
   ▼
Normalizer
   │
   ▼
Matcher
   │
   ▼
Score 0.0 - 1.0
```

### 12.1 Normalization

比較前に以下を正規化する。

- lowercase
- Unicode normalization
- 全角/半角正規化
- `feat.` / `ft.` 正規化
- 記号・余分な空白の正規化

ただし `Live`, `Remix`, `Acoustic`, `Instrumental`, `Radio Edit`, `Remaster` などはバージョン識別に必要なので完全には削除しない。

### 12.2 Score

主な評価要素:

- ISRC exact: 非常に強い
- title exact: 強い
- artist exact: 強い
- album exact: 中程度
- duration ±2 sec: 強い
- duration ±5 sec: 中程度
- version mismatch: 大幅減点

## 13. Confidence

すべてのサービス解決結果に confidence を持たせる。

```text
1.00  Provider 自身による明示的対応
0.95+ ISRC 一致
0.90+ title/artist/duration 高一致
0.80+ 検索結果から高確率
<0.80  不確実
```

低 confidence の候補を無理に返さない。

デフォルト閾値は `0.85` とする。

## 14. Resolution Priority

可能な限り以下の順序で楽曲を確定する。

1. Provider による直接対応
2. ISRC
3. title + artist + duration
4. title + artist + album
5. title + artist

特に `ATV ↔ OMV` の YouTube 自身による counterpart は検索結果より優先する。

## 15. Error Handling

### Unsupported URL

```json
{
  "error": {
    "code": "UNSUPPORTED_URL",
    "message": "Unsupported music service URL"
  }
}
```

### Track Not Found

```json
{
  "error": {
    "code": "TRACK_NOT_FOUND"
  }
}
```

### Partial Result

一部サービスのみ取得できない場合は HTTP エラーにしない。

```json
{
  "links": {
    "spotify": {},
    "youtube_music": {},
    "youtube": null
  }
}
```

### Upstream Failure

```json
{
  "error": {
    "code": "UPSTREAM_ERROR",
    "provider": "youtube_music"
  }
}
```

## 16. Cache

外部サービスへの不要なアクセスを防ぐためキャッシュする。

Primary key 候補:

```text
spotify:{trackId}
youtube:{videoId}
youtube_music:{videoId}
isrc:{ISRC}
```

保存内容:

- Track
- ServiceLinks
- confidence
- resolved_at

このプロジェクトが Cloudflare Workers / D1 を利用しているため、初期実装では既存の D1 基盤を利用する案を優先して検討する。

## 17. Rate Limit

公開 API 化する場合、自 API 側で Rate Limit を設ける。

例:

```text
Anonymous: 60 requests / minute / IP
```

Provider ごとにも concurrency limit を設け、Spotify / YouTube 側へ大量の同時リクエストを送らない。

## 18. Project Architecture

既存プロジェクトが TypeScript + Hono + Cloudflare Workers で構成されているため、本リポジトリへ統合する場合は Rust/Axum の別サーバーを新設するより、まず Worker 上の TypeScript モジュールとして Provider / Resolver を分離実装する。

推奨構造:

```text
src/
├── handler/
│   └── musicResolve.ts
├── music/
│   ├── resolver.ts
│   ├── matcher.ts
│   ├── normalize.ts
│   ├── types.ts
│   └── providers/
│       ├── spotify.ts
│       ├── youtube.ts
│       └── youtubeMusic.ts
└── index.ts
```

API handler は Resolver の内部実装に依存しすぎないようにする。

## 19. Resolution Flow

### Spotify 入力

```text
Spotify URL
    ↓
Spotify metadata
    ↓
Track 生成
    ↓
YTM Song 検索
    ↓
ATV 確定
    ↓
counterpart 取得
    ↓
OMV 確定
    ↓
Spotify + YTM + YouTube
```

### YouTube Music 入力

```text
YTM URL
    ↓
videoId
    ↓
ATV metadata
    ↓
Track 生成
    ├──── counterpart → OMV
    │
    └──── Spotify 検索
              ↓
         Spotify Track
```

### YouTube MV 入力

```text
YouTube URL
    ↓
videoId
    ↓
OMV metadata
    ↓
対応 ATV 取得
    ↓
Track 生成
    ↓
Spotify 検索
```

## 20. Reliability Strategy

外部サービスの非公式 endpoint や HTML 構造は変更される可能性があるため、Provider 実装を交換可能にする。

```text
API Handler
     ↓
Resolver
     ↓
Provider Interface
     ↓
Provider Implementation
```

Spotify の取得方式が壊れても Spotify Provider のみ交換できる構造を維持する。

## 21. Security

入力 URL は必ず hostname を検証する。

許可する hostname:

```text
open.spotify.com
youtube.com
www.youtube.com
youtu.be
music.youtube.com
```

任意 URL への HTTP アクセスは禁止し、SSRF を防止する。リダイレクト先についても同様に検証する。

## 22. MVP

### Input

- Spotify Track
- YouTube Video
- YouTube Music Song

### Output

- title
- artists
- album
- thumbnail
- Spotify URL
- YouTube Music ATV URL
- YouTube OMV URL
- confidence

### Resolution

- Spotify metadata
- YTM Song search
- ATV ↔ OMV counterpart
- Spotify search

Playlist / Album 対応などは後回しにする。

## 23. Future Extensions

Provider 方式により以下を追加可能とする。

- Apple Music
- Deezer
- Tidal
- Amazon Music
- SoundCloud
- Bandcamp
- MusicBrainz
- Last.fm

API も将来的に以下へ拡張できる。

```http
GET /v1/resolve
POST /v1/resolve/batch
GET /v1/search
```

## 24. Service Definition

本 API における「同じ曲」は単なる同一タイトルではなく、可能な限り一つの Recording に属する各サービス上の表現として扱う。

```text
Recording
   │
   ├── Spotify Track
   ├── YouTube Music ATV
   └── YouTube OMV
```

基本仕様:

- **YouTube Music URL = 正式なアルバム/シングル音源 (ATV)**
- **YouTube URL = その楽曲に YouTube が関連付けた公式 Music Video (OMV)**

この区別を Resolver の中心的な不変条件とする。
