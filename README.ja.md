# DAC Bot Integrated (日本語版)

**Hono** と **Cloudflare Workers** で構築された Discord スラッシュコマンドボットです。**Cloudflare D1** を使用した動的な語彙管理機能を備えています。

## 特徴

- **キャラクターベースのインタラクション**: 「おねえさん」「メスガキ」「オスガキ」などの様々なモードを搭載。
- **動的な語彙管理**: Cloudflare D1 データベースから語彙を直接追加・取得。
- **ランキングシステム**: ユーザーおよびモデルごとの使用統計を追跡・表示。
- **Cloudflare ネイティブ**: Cloudflare Workers と D1 に完全に最適化されています。

## プロジェクト構造

- `src/index.ts`: メインのエントリーポイント。Discord インタラクションの受信と API エンドポイントの提供。
- `src/mod/command/`: 個別のコマンドモジュール。各ファイルでスラッシュコマンドのメタデータと実行ロジックを定義。
- `src/handler/`: データベース操作ロジック（取得、投稿、削除、ランキング）。
- `src/register.ts`: Discord API にスラッシュコマンドを登録するためのユーティリティスクリプト。
- `wrangler.toml`: Cloudflare Workers の設定ファイル。

## 新しいコマンドの追加方法

コマンドの追加は以下の4つのステップで行います。

1.  **コマンドモジュールの作成**:
    `src/mod/command/` に新しい TypeScript ファイル（例: `my_command.ts`）を作成し、`CommandModule` インターフェースを実装します。

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
            type: 3, // String
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
    `src/index.ts` で作成したコマンドをインポートし、`commands` Map に追加します。

    ```typescript
    import myCommand from "./mod/command/my_command";

    const commands = new Map<string, CommandModule>([
      // ... 既存のコマンド
      [myCommand.data.name, myCommand],
    ]);
    ```

3.  **登録スクリプトへの追加**:
    `src/register.ts` でコマンドをインポートし、`commands` 配列に `data` を追加します。

    ```typescript
    import myCommand from "./mod/command/my_command";

    const commands = [
      // ... 既存のコマンドデータ
      myCommand.data,
    ];
    ```

4.  **Discord への同期**:
    登録スクリプトを実行して、Discord のスラッシュコマンドリストを更新します。環境変数が設定されていることを確認してください。

    ```bash
    # tsx を使用した例
    npx tsx src/register.ts
    ```

## 開発とデプロイ

### ローカル開発
```bash
npm run dev
```

### コマンドの登録
`.dev.vars` または環境変数に以下を設定してください：
- `API_TOKEN`: Discord Bot のトークン。
- `DISCORD_APPLICATION_ID`: Discord アプリケーション ID。
- `GUILD_ID`: (任意) 即時反映用のギルド ID。

### デプロイ
```bash
npm run deploy
```

## ライセンス
MIT
