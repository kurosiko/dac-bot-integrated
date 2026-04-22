import type { CommandModule } from "../mod.d.ts";
import { fetchRanking } from "../api";

const ranking: CommandModule = {
  data: {
    name: "ranking",
    description: "Botの使用回数ランキングを表示します",
    options: [
      {
        name: "type",
        description: "集計するタイプを選択（未指定なら全モデル合計）",
        type: 3,
        required: false,
        choices: [
          { name: "Onesan", value: "onesan" },
          { name: "Mesugaki", value: "mesugaki" },
          { name: "Osugaki", value: "osugaki" }
        ]
      }
    ]
  },
  execute: async (interaction: any, env: any, executionCtx?: any) => {
    const options = interaction.data?.options || [];
    const typeOption = options.find((opt: any) => opt.name === "type");
    const type = typeOption ? typeOption.value : null;

    const rankingData = await fetchRanking(type, env.DB);
    
    if (!rankingData || rankingData.length === 0) {
      return { type: 4, data: { content: "データがありません。もっと使ってね！" } };
    }

    const typeStr = type ? `${type} の` : "総合 ";
    let content = `**${typeStr}使用回数ランキング**\n\n`;
    
    rankingData.forEach((row, index) => {
      content += `${index + 1}位: <@${row.user_id}> - ${row.count} 回\n`;
    });

    return { type: 4, data: { content } };
  },
}

export default ranking;
