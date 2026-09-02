# DAC Bot Integrated (日本語版)

[English version is here](./README.md)

**Hono** と **Cloudflare Workers** で構築された Discord スラッシュコマンドボットです。**Cloudflare D1** を使用した動的な語彙管理機能を備えています。

## 特徴

- **キャラクターベースのインタラクション**: 「おねえさん」「メスガキ」「オスガキ」などの様々なモードを搭載。
- **動的な語彙管理**: Cloudflare D1 データベースから語彙を直接追加・取得。
- **ランキングシステム**: ユーザーおよびモデルごとの使用統計を追跡・表示。
- **Music Link Resolver**: Spotify / YouTube Music / YouTube の同一楽曲リンクを相互解決。
- **REST API**: HTTP API エンドポイントによる語彙管理と楽曲リンク解決。
- **Cloudflare ネイティブ**: Cloudflare Workers と D1 に完全に最適化されています。

## プロジェクト構造

- `src/index.ts`: メインエントリーポイント。Discord インタラクションの受信と REST API エンドポイントを提供。
- `src/mod/command/`: 個別コマンドモジュール（mesugaki, osugaki, onesan, ranking など）。
- `src/handler/`: REST API ハンドラー（DB 取得、登録、削除、ランキング、楽曲リンク解決）。
- `src/music/`: Music Resolver、正規化・マッチング、D1 キャッシュ、各 Provider 実装。
- `src/util.ts`: コアデータベースユーティリティ関数。
- `src/register.ts`: Discord API にスラッシュコマンドを登録するスクリプト。
- `schema.sql`: D1 データベーススキーマ。
- `wrangler.toml`: Cloudflare Workers 設定ファイル。

---

## REST API リファレンス

### ベース URL

```
https://dac-bot-integrated.kurosiko.workers.dev
```

---

### `GET /`

ヘルスチェックエンドポイント。

**レスポンス** `200 OK`
```
dac-bot-mod-integrated with discord-interaction api
```

---

### `GET /vocabulary`

ランダムな語彙を取得します。

**クエリパラメータ**

| パラメータ   | 型     | 必須  | 説明 |
|-------------|--------|-------|------|
| `type`      | string | **必須** | モデルタイプ: `"mesugaki"`, `"osugaki"`, `"onesan"` のいずれか |
| `category`  | string | 条件付き | `mesugaki` / `osugaki` の場合は必須。`"batou"` または `"wakarase"` |
| `limit`     | number | 任意  | 取得件数（デフォルト: `1`） |

**リクエスト例**

```
GET /vocabulary?type=onesan&limit=3
```

**レスポンス例** `200 OK`
```json
[
  { "id": 1, "word": "かわいいね" },
  { "id": 2, "word": "えらいぞ" },
  { "id": 3, "word": "よくできました" }
]
```

**エラーレスポンス**

- `400`: パラメータが不正
  ```json
  { "message": "Invalid Parameters" }
  ```
- `500`: クエリ失敗または内部エラー

---

### `POST /vocabulary`

新しい語彙を登録します。

**リクエストボディ** (JSON)

| フィールド   | 型     | 必須  | 説明 |
|------------|--------|-------|------|
| `word`     | string | **必須** | 語彙のテキスト |
| `type`     | string | **必須** | `"mesugaki"`, `"osugaki"`, `"onesan"` のいずれか |
| `category` | string | 条件付き | `mesugaki` / `osugaki` の場合は必須。`"batou"` または `"wakarase"` |

**リクエスト例**

```json
{
  "word": "ざぁこ♡",
  "type": "mesugaki",
  "category": "batou"
}
```

**レスポンス例** `200 OK`
```json
{ "success": true }
```

---

### `DELETE /vocabulary/:id`

語彙を ID 指定で削除します。

**パスパラメータ**

| パラメータ | 型     | 説明               |
|-----------|--------|--------------------|
| `id`      | number | 語彙エントリの ID   |

**リクエスト例**

```
DELETE /vocabulary/1
```

**レスポンス例** `200 OK`
```json
{ "success": true }
```

**エラーレスポンス**

- `400`: ID が不正
- `404`: エントリが見つからない
  ```json
  { "message": "Not Found" }
  ```

---

### `GET /ranking`

使用回数ランキングを取得します。

**クエリパラメータ**

| パラメータ | 型     | 必須  | 説明 |
|-----------|--------|-------|------|
| `type`    | string | 任意  | モデルタイプでフィルター: `"mesugaki"`, `"osugaki"`, `"onesan"`。省略時は全体ランキング。 |

**リクエスト例**

```
GET /ranking?type=onesan
```

**レスポンス例** `200 OK`
```json
[
  { "user_id": "123456789", "count": 42 },
  { "user_id": "987654321", "count": 15 }
]
```

---

### `GET /music`

Spotify / YouTube Music / YouTube の楽曲 URL を受け取り、同じ Recording に対応する各サービスのリンクを解決します。

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|----|------|------|
| `url` | string | **必須** | Spotify Track / YouTube Music Song / YouTube 動画 URL |

**リクエスト例**

```
GET /music?url=https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl
```

レスポンスには正規化された `track`、入力元の `source`、`links.spotify`、`links.youtube_music`（ATV / Song）、`links.youtube`（OMV）を含みます。十分な確度で特定できないサービスは `null` になります。解決済みリンクには `confidence` と `match_method` が付きます。

Resolver の結果は D1 に 24 時間キャッシュします。一部 Provider のみ失敗した場合は、取得できたリンクを返しつつ `warnings` に理由を格納します。

---

## Discord 連携

### `POST /` (Discord インタラクションエンドポイント)

Discord スラッシュコマンドのインタラクションを処理します。`X-Signature-Ed25519` および `X-Signature-Timestamp` ヘッダーによるリクエスト検証を行います。

**対応コマンド**

| コマンド | 説明 |
|---------|------|
| `/mesugaki` | メスガキのフレーズを取得（カテゴリ: `batou` / `wakarase`） |
| `/osugaki` | オスガキのフレーズを取得（カテゴリ: `batou` / `wakarase`） |
| `/onesan` | おねえさんのフレーズを取得 |
| `/mesugaki_add_batou` | メスガキ罵倒フレーズを追加 |
| `/mesugaki_add_wakarase` | メスガキわからせフレーズを追加 |
| `/osugaki_add_batou` | オスガキ罵倒フレーズを追加 |
| `/osugaki_add_wakarase` | オスガキわからせフレーズを追加 |
| `/onesan_add` | おねえさんフレーズを追加 |
| `/ranking` | 使用回数ランキングを表示 |
| `/music` | Spotify / YouTube Music / YouTube の楽曲リンクを相互解決 |

**環境変数 (Discord)**

| 変数 | 説明 |
|------|------|
| `DISCORD_PUBLIC_KEY` | Discord アプリケーションの公開鍵（必須、シークレット推奨） |
| `API_BASE_URL` | 自己参照用 API のベース URL |

---

## 新しいコマンドの追加方法

コマンドの追加は以下の4ステップで行います。

1.  **コマンドモジュールの作成**:
    `src/mod/command/` に新しい TypeScript ファイルを作成し、`CommandModule` インターフェースを実装します。

    ```typescript
    import type { CommandModule } from "../mod.d.ts";

    const myCommand: CommandModule = {
      data: {
        name: "mycommand",
        description: "新しいコマンドの説明",
        options: [
          {
            name: "input",
            description: "入力値",
            type: 3,
            required: true
          }
        ]
      },
      execute: async (interaction, env, executionCtx) => {
        const value = interaction.data.options[0].value;
        return {
          type: 4,
          data: { content: `入力された値: ${value}` }
        };
      }
    };

    export default myCommand;
    ```

2.  **メインアプリへの登録**:
    `src/index.ts` でインポートし、`commands` Map に追加します。

3.  **登録スクリプトへの追加**:
    `src/register.ts` の `commands` 配列に `data` を追加します。

4.  **Discord への同期**:
    ```bash
    npx tsx src/register.ts
    ```

## 開発とデプロイ

### ローカル開発

```bash
npm install
npx wrangler d1 execute mesugaki-db --local --file=./schema.sql
npm run dev
```

### デプロイ

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npm run deploy
npx wrangler d1 execute mesugaki-db --remote --file=./schema.sql
```

### Discord Developer Portal での設定

Interaction Endpoint URL を以下に設定:
```
https://dac-bot-integrated.kurosiko.workers.dev/
```

## データベーススキーマ

```sql
CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT
);

CREATE TABLE IF NOT EXISTS usages (
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS music_cache (
    key TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    resolved_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_music_cache_expires_at
    ON music_cache (expires_at);
```

## ライセンス

MIT
