# DAC Bot Integrated

[日本語版はこちら (Japanese version is here)](./README.ja.md)

A Discord Slash Command bot built with **Hono** and **Cloudflare Workers**, featuring dynamic vocabulary management using **Cloudflare D1**.

## Features

- **Character-based Interactions**: Includes various character modes like "Onesan", "Mesugaki", and "Osugaki".
- **Dynamic Vocabulary**: Commands to add and fetch vocabulary directly from a Cloudflare D1 database.
- **Ranking System**: Tracks and displays usage statistics per user and model.
- **Cloudflare Native**: Fully optimized for Cloudflare Workers and D1.

## Project Structure

- `src/index.ts`: The main entry point. Handles Discord interaction webhooks and provides API endpoints.
- `src/mod/command/`: contains individual command modules. Each file defines a slash command's metadata and execution logic.
- `src/handler/`: Logic for database interactions (Fetch, Post, Delete, Ranking).
- `src/register.ts`: Utility script to register slash commands with the Discord API.
- `wrangler.toml`: Cloudflare Workers configuration.

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
            type: 3, // String
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
      // ... existing commands
      [myCommand.data.name, myCommand],
    ]);
    ```

3.  **Add to Registration Script**:
    In `src/register.ts`, import your command and add its `data` to the `commands` array:

    ```typescript
    import myCommand from "./mod/command/my_command";

    const commands = [
      // ... existing command data
      myCommand.data,
    ];
    ```

4.  **Synchronize with Discord**:
    Run the registration script to update Discord's slash command list. Ensure your environment variables are set.

    ```bash
    # Example using tsx
    npx tsx src/register.ts
    ```

## Development & Deployment

### Local Development
```bash
npm run dev
```

### Register Commands
Ensure `.dev.vars` or environment variables contain:
- `API_TOKEN`: Your Discord Bot Token.
- `DISCORD_APPLICATION_ID`: Your Discord Application ID.
- `GUILD_ID`: (Optional) Your Discord Guild ID for faster command updates.

### Deployment
```bash
npm run deploy
```

## License
MIT
