import type { CommandModule } from "../mod.d.ts";
import {
  fetchAppleLyrics,
  formatSyncedLyrics,
  searchAppleSong,
} from "../../music/appleLyrics";

const lyric: CommandModule = {
  data: {
    name: "lyric",
    description: "Apple Musicから同期歌詞を検索します",
    options: [
      {
        name: "query",
        description: "曲名とアーティスト名（例: アイドル YOASOBI）",
        type: 3,
        required: true,
      },
    ],
  },

  execute: async (interaction: any) => {
    const query = interaction.data?.options?.find((opt: any) => opt.name === "query")?.value;

    if (typeof query !== "string" || !query.trim()) {
      return {
        type: 4,
        data: { content: "検索文字列を入力してください。", flags: 64 },
      };
    }

    try {
      const song = await searchAppleSong(query.trim());
      if (!song) {
        return {
          type: 4,
          data: { content: "Apple Musicで曲が見つかりませんでした。", flags: 64 },
        };
      }

      const lyrics = await fetchAppleLyrics(song.id);
      if (!lyrics?.length) {
        const link = song.url ? `\n${song.url}` : "";
        return {
          type: 4,
          data: {
            content: `**${song.title}** — ${song.artist}\n歌詞が見つかりませんでした。${link}`,
            allowed_mentions: { parse: [] },
          },
        };
      }

      const lyricLines = formatSyncedLyrics(lyrics);
      const header = `**${song.title}** — ${song.artist}${song.url ? `\n${song.url}` : ""}\n\n`;
      const footer = "\n\n※ Apple Music検索 + Paxsenix lyrics";
      const maxBodyLength = 2000 - header.length - footer.length - 20;

      let body = "";
      let truncated = false;

      for (const line of lyricLines) {
        const next = body ? `${body}\n${line}` : line;
        if (next.length > maxBodyLength) {
          truncated = true;
          break;
        }
        body = next;
      }

      if (!body) body = "歌詞データを表示できませんでした。";
      if (truncated) body += "\n…";

      return {
        type: 4,
        data: {
          content: `${header}${body}${footer}`,
          allowed_mentions: { parse: [] },
        },
      };
    } catch (error) {
      console.error("lyric command error:", error);
      return {
        type: 4,
        data: {
          content: "歌詞の取得に失敗しました。Apple Musicまたは歌詞APIが一時的に利用できない可能性があります。",
          flags: 64,
        },
      };
    }
  },
};

export default lyric;
