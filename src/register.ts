import onesan from "./mod/command/onesan";
import mesugaki from "./mod/command/mesugaki";
import osugaki from "./mod/command/osugaki";
import onesanAdd from "./mod/command/onesan_add";
import mesugakiAddBatou from "./mod/command/mesugaki_add_batou";
import mesugakiAddWakarase from "./mod/command/mesugaki_add_wakarase";
import osugakiAddBatou from "./mod/command/osugaki_add_batou";
import osugakiAddWakarase from "./mod/command/osugaki_add_wakarase";
import ranking from "./mod/command/ranking";

const commands = [
  onesan.data,
  mesugaki.data,
  osugaki.data,
  onesanAdd.data,
  mesugakiAddBatou.data,
  mesugakiAddWakarase.data,
  osugakiAddBatou.data,
  osugakiAddWakarase.data,
  ranking.data,
];

const token = process.env.API_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.GUILD_ID;

if (!token || !applicationId) {
  console.error("API_TOKEN and DISCORD_APPLICATION_ID are required");
  process.exit(1);
}

const globalUrl = `https://discord.com/api/v10/applications/${applicationId}/commands`;
const url = guildId 
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : globalUrl;

try {
  if (guildId) {
    console.log("Checking for global commands to clear...");
    const globalResponse = await fetch(globalUrl, {
      headers: { Authorization: `Bot ${token}` },
    });
    
    if (globalResponse.ok) {
      const globalCommands = await globalResponse.json() as any[];
      if (globalCommands.length > 0) {
        console.log(`Clearing ${globalCommands.length} global commands...`);
        await fetch(globalUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([]),
        });
        console.log("Global commands cleared.");
      } else {
        console.log("No global commands to clear.");
      }
    }
  }

  if (guildId) {
    console.log(`Registering ${commands.length} commands to Guild ${guildId}...`);
  } else {
    console.log(`Registering ${commands.length} commands globally to Discord...`);
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (response.ok) {
    console.log("Successfully registered all commands!");
  } else {
    console.error("Error registering commands");
    const errorJson = await response.json();
    console.error(JSON.stringify(errorJson, null, 2));
    process.exit(1);
  }
} catch (error) {
  console.error("Network error while registering commands:", error);
  process.exit(1);
}
