# DAC Bot Integrated

[日本語版はこちら (Japanese version is here)](./README.ja.md)

A Discord Slash Command bot built with **Hono** and **Cloudflare Workers**, featuring dynamic vocabulary management using **Cloudflare D1**.

## Features

- **Character-based Interactions**: Includes various character modes like "Onesan", "Mesugaki", and "Osugaki".
- **Dynamic Vocabulary**: Commands to add and fetch vocabulary directly from a Cloudflare D1 database.
- **Ranking System**: Tracks and displays usage statistics per user and model.
- **Music Link Resolver**: Resolves Spotify / YouTube Music / YouTube links for the same recording.
- **REST API**: Vocabulary management and music-link resolution via HTTP API endpoints.
- **Cloudflare Native**: Fully optimized for Cloudflare Workers and D1.

## Project Structure

- `src/index.ts`: Main entry point. Handles Discord interaction webhooks and provides REST API endpoints.
- `src/mod/command/`: Individual command modules. Each file defines a slash command's metadata and execution logic.
- `src/handler/`: REST API handler functions for database operations and music resolution.
- `src/music/`: Music resolver, matching/normalization logic, cache, and provider integrations.
- `src/mod/`: Discord command implementations (mesugaki, osugaki, onesan, ranking, music, etc.).
- `src/util.ts`: Core database utility functions.
- `src/register.ts`: Utility script to register slash commands with the Discord API.
- `schema.sql`: D1 database schema.
- `wrangler.toml`: Cloudflare Workers configuration.

---

## REST API Reference

### Base URL

```
https://dac-bot-integrated.kurosiko.workers.dev
```

---

### `GET /`

Health check endpoint.

**Response** `200 OK`
```
dac-bot-mod-integrated with discord-interaction api
```

---

### `GET /vocabulary`

Fetch random vocabulary entries.

**Query Parameters**

| Param    | Type   | Required | Description |
|----------|--------|----------|-------------|
| `type`   | string | **Yes**  | Model type. One of: `"mesugaki"`, `"osugaki"`, `"onesan"` |
| `category` | string | Conditional | Required for `mesugaki` / `osugaki`. One of: `"batou"`, `"wakarase"` |
| `limit`  | number | No       | Number of entries to return (default: `1`) |

**Example Request**

```
GET /vocabulary?type=onesan&limit=3
```

**Example Response** `200 OK`
```json
[
  { "id": 1, "word": "かわいいね" },
  { "id": 2, "word": "えらいぞ" },
  { "id": 3, "word": "よくできました" }
]
```

**Error Responses**

- `400`: Invalid parameters (missing type, invalid type, missing category for mesugaki/osugaki, invalid limit)
  ```json
  { "message": "Invalid Parameters" }
  ```
- `500`: Query failed or internal error
  ```json
  { "message": "Query Failed" }
  ```

---

### `POST /vocabulary`

Add a new vocabulary entry.

**Request Body** (JSON)

| Field      | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `word`    | string | **Yes**  | The vocabulary text |
| `type`    | string | **Yes**  | One of: `"mesugaki"`, `"osugaki"`, `"onesan"` |
| `category` | string | Conditional | Required for `mesugaki` / `osugaki`. One of: `"batou"`, `"wakarase"` |

**Example Request**

```json
{
  "word": "ざぁこ♡",
  "type": "mesugaki",
  "category": "batou"
}
```

**Example Response** `200 OK`
```json
{ "success": true }
```

**Error Responses**

- `400`: Invalid parameters
  ```json
  { "message": "Invalid Parameters" }
  ```
- `500`: Query failed or internal error

---

### `DELETE /vocabulary/:id`

Delete a vocabulary entry by ID.

**Path Parameters**

| Param | Type   | Description                |
|-------|--------|----------------------------|
| `id`  | number | The vocabulary entry ID    |

**Example Request**

```
DELETE /vocabulary/1
```

**Example Response** `200 OK`
```json
{ "success": true }
```

**Error Responses**

- `400`: Invalid ID parameter
- `404`: Entry not found
  ```json
  { "message": "Not Found" }
  ```
- `500`: Query failed or internal error

---

### `GET /ranking`

Get usage rankings.

**Query Parameters**

| Param  | Type   | Required | Description |
|--------|--------|----------|-------------|
| `type` | string | No       | Filter by model type. One of: `"mesugaki"`, `"osugaki"`, `"onesan"`. Omit for overall ranking. |

**Example Request**

```
GET /ranking?type=onesan
```

**Example Response** `200 OK`
```json
[
  { "user_id": "123456789", "count": 42 },
  { "user_id": "987654321", "count": 15 }
]
```

**Error Responses**

- `400`: Invalid type parameter
  ```json
  { "message": "Invalid Parameters" }
  ```
- `500`: Query failed or internal error

---
    
### `GET /music`

Resolve a Spotify, YouTube Music, or YouTube track URL into the canonical links for the same recording.

**Query Parameters**

| Param | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | **Yes** | Spotify Track, YouTube Music Song, or YouTube video URL |

**Example Request**

```
GET /music?url=https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl
```

The response contains normalized `track` metadata, the original `source`, and `links.spotify`, `links.youtube_music` (ATV / Song), and `links.youtube` (OMV). A service may be `null` when a sufficiently reliable match is unavailable. Each resolved link includes `confidence` and `match_method`.

The resolver uses a 24-hour D1 cache. Provider failures that affect only one target service are returned as partial results with entries in `warnings`.

---

## Discord Integration

### `POST /` (Discord Interaction Endpoint)

Handles Discord slash command interactions. Receives POST requests from Discord with `X-Signature-Ed25519` and `X-Signature-Timestamp` headers for request verification.

**Supported Commands**

| Command | Description |
|---------|-------------|
| `/mesugaki` | Fetches a mesugaki phrase (category: `batou` / `wakarase`) |
| `/osugaki` | Fetches an osugaki phrase (category: `batou` / `wakarase`) |
| `/onesan` | Fetches an onesan phrase |
| `/mesugaki_add_batou` | Add a mesugaki batou phrase |
| `/mesugaki_add_wakarase` | Add a mesugaki wakarase phrase |
| `/osugaki_add_batou` | Add an osugaki batou phrase |
| `/osugaki_add_wakarase` | Add an osugaki wakarase phrase |
| `/onesan_add` | Add an onesan phrase |
| `/ranking` | Show usage rankings |
| `/music` | Resolve a Spotify / YouTube Music / YouTube track URL across services |

**Environment Variables (Discord)**

| Variable | Description |
|----------|-------------|
| `DISCORD_PUBLIC_KEY` | Discord Application Public Key (required, should be set as secret) |
| `API_BASE_URL` | Base URL for self-referencing API calls |

---

## How to Add a New Command

Adding a command involves four steps:

1.  **Create the Command Module**:
    Create a new TypeScript file in `src/mod/command/` (e.g., `my_command.ts`). Implement the `CommandModule` interface:

    ```typescript
    import type { CommandModule } from "../mod.d.ts";

    const myCommand: CommandModule = {
      data: {
        name: "mycommand",
        description: "This is my new command",
        options: [
          {
            name: "input",
            description: "Some input",
            type: 3,
            required: true
          }
        ]
      },
      execute: async (interaction, env, executionCtx) => {
        const value = interaction.data.options[0].value;
        return {
          type: 4,
          data: { content: `You said: ${value}` }
        };
      }
    };

    export default myCommand;
    ```

2.  **Register in the Main App**:
    In `src/index.ts`, import your new command and add it to the `commands` Map:

    ```typescript
    import myCommand from "./mod/command/my_command";

    const commands = new Map<string, CommandModule>([
      [myCommand.data.name, myCommand],
    ]);
    ```

3.  **Add to Registration Script**:
    In `src/register.ts`, import your command and add its `data` to the `commands` array:

    ```typescript
    import myCommand from "./mod/command/my_command";

    const commands = [
      myCommand.data,
    ];
    ```

4.  **Synchronize with Discord**:
    Run the registration script to update Discord's slash command list. Ensure your environment variables are set.

    ```bash
    npx tsx src/register.ts
    ```

## Development & Deployment

### Prerequisites

- Node.js or Bun
- Cloudflare account with Workers and D1 enabled

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up `.dev.vars` with required environment variables:
   ```
   DISCORD_PUBLIC_KEY=your_public_key
   API_BASE_URL=http://localhost:8787
   ```
3. Initialize the local D1 database:
   ```bash
   npx wrangler d1 execute mesugaki-db --local --file=./schema.sql
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

### Deployment

1. Set production secrets:
   ```bash
   npx wrangler secret put DISCORD_PUBLIC_KEY
   ```
2. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```
3. Initialize the production D1 database:
   ```bash
   npx wrangler d1 execute mesugaki-db --remote --file=./schema.sql
   ```
4. (Optional) Configure the Discord Interaction Endpoint URL in the Discord Developer Portal:
   ```
   https://dac-bot-integrated.kurosiko.workers.dev/
   ```

## Database Schema

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

## License

MIT
