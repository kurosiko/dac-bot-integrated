import { Hono } from "hono";
import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from "discord-interactions";
import { ErrorReason, generateErrorResponse } from "./error_handle";
import type { CommandModule } from "./mod/mod.d.ts";

import onesan from "./mod/command/onesan";
import mesugaki from "./mod/command/mesugaki";
import osugaki from "./mod/command/osugaki";
import onesanAdd from "./mod/command/onesan_add";
import mesugakiAddBatou from "./mod/command/mesugaki_add_batou";
import mesugakiAddWakarase from "./mod/command/mesugaki_add_wakarase";
import osugakiAddBatou from "./mod/command/osugaki_add_batou";
import osugakiAddWakarase from "./mod/command/osugaki_add_wakarase";
import ranking from "./mod/command/ranking";
import { db_fetch } from "./handler/db_fetch";
import { db_delete } from "./handler/db_delete";
import { db_post } from "./handler/db_post";
import { db_ranking } from "./handler/db_ranking";
//for CF env not local
type Bindings = CloudflareBindings & {
  DISCORD_PUBLIC_KEY: string;
  API_BASE_URL: string;
};

const commands = new Map<string, CommandModule>([
  [onesan.data.name, onesan],
  [mesugaki.data.name, mesugaki],
  [osugaki.data.name, osugaki],
  [onesanAdd.data.name, onesanAdd],
  [mesugakiAddBatou.data.name, mesugakiAddBatou],
  [mesugakiAddWakarase.data.name, mesugakiAddWakarase],
  [osugakiAddBatou.data.name, osugakiAddBatou],
  [osugakiAddWakarase.data.name, osugakiAddWakarase],
  [ranking.data.name, ranking],
]);

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json(generateErrorResponse(ErrorReason.InternalError), 500);
});
app.notFound((c) => {
  return c.json({ message: "Not Found" }, 404);
});



app.get("/", (c) => {
  return c.text("dac-bot-mod-integrated with discord-interaction api");
});

app.get("/vocabulary", async (c) => {
  return await db_fetch(c);
});

app.get("/ranking", async (c) => {
  return await db_ranking(c);
});

app.post("/vocabulary", async (c) => {
  return await db_post(c);
});

app.delete("/vocabulary/:id", async (c) => {
  return await db_delete(c);
});







app.post("/", async (c) => {
  const signature = c.req.header("x-signature-ed25519");
  const timestamp = c.req.header("x-signature-timestamp");
  const body = await c.req.raw.clone().arrayBuffer();

  if (!signature || !timestamp) {
    return c.text("Missing signature in header", 401);
  }

  const isValidRequest = await verifyKey(body, signature, timestamp, c.env.DISCORD_PUBLIC_KEY);
  
  if (!isValidRequest) {
    return c.text("Verifing key was faild", 401);
  }

  const interaction = JSON.parse(new TextDecoder().decode(body));
  if (interaction.type === InteractionType.PING) {
    return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
      headers: { "content-type": "application/json" },
    });
  }

  const commandName = interaction.data?.name;
  const command = commands.get(commandName);

  if (command) {
    try {
      const response = await command.execute(interaction, c.env, c.executionCtx);
      return c.json(response);
    } catch (e) {
      console.error("Command execution error:", e);
      return c.json({ type: 4, data: { content: "Error occur while executing command" } });
    }
  }
  return c.json({ error: "Unknown type" }, 400);
});

export default app;