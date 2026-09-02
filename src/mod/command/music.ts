import type { CommandModule } from "../mod.d.ts";
import { fetchMusic } from "../api";

const music: CommandModule = {
  data: {
    name: "music",
    description: "楽曲リンクをSpotify / YouTube Music / YouTubeへ変換します",
    options: [
      {
        name: "url",
        description: "Spotify / YouTube / YouTube Music の楽曲URL",
        type: 3,
        required: true,
      },
    ],
  },
  execute: async (interaction: any, env: any, executionCtx?: ExecutionContext) => {
    const options = interaction.data?.options || [];
    const url = options.find((option: any) => option.name === "url")?.value;
    if (!url) return { type: 4, data: { content: "URLを指定してください" } };

    const result = await fetchMusic(url, env.DB, executionCtx);
    if (!result.ok) {
      return { type: 4, data: { content: `Music resolver error: ${result.error}` } };
    }

    const data = result.data;
    const artists = data.track.artists.map((artist: { name: string }) => artist.name).join(", ");
    const lines = [
      `🎵 **${data.track.title}**${artists ? ` — ${artists}` : ""}`,
      "",
      data.links.spotify ? `Spotify\n${data.links.spotify.url}` : "Spotify\nNot found",
      "",
      data.links.youtube_music ? `YouTube Music\n${data.links.youtube_music.url}` : "YouTube Music\nNot found",
      "",
      data.links.youtube ? `YouTube\n${data.links.youtube.url}` : "YouTube\nOfficial MV not found",
    ];

    return { type: 4, data: { content: lines.join("\n") } };
  },
};

export default music;
