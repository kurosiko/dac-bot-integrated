import type { CommandModule } from "../mod.d.ts";
import { addVocabulary } from "../api";

const osugakiAddWakarase: CommandModule = {
  data: {
    name: "osugaki_add_wakarase",
    description: "開発中",
    options: [
      {
        name: "word",
        description: "追加する言葉",
        type: 3,
        required: true
      }
    ]
  },
  execute: async (interaction: any, env: any, executionCtx?: any) => {
    const options = interaction.data?.options || [];
    const wordOption = options.find((opt: any) => opt.name === "word");
    if (!wordOption) return { type: 4, data: { content: "Error: word is required" } };

    const success = await addVocabulary("osugaki", wordOption.value, "wakarase", env.DB);
    
    if (!success) {
      return { type: 4, data: { content: "語彙の追加に失敗しました。APIエラーなどを確認してください。", flags: 64 } }; 
    }

    return { type: 4, data: { content: `オスガキ（わからせ）の語彙を追加しました！\nWord: \`${wordOption.value}\``, flags: 64 } };
  },
}

export default osugakiAddWakarase;
