import type { CommandModule } from "../mod.d.ts";
import { addVocabulary } from "../api";

const onesanAdd: CommandModule = {
  data: {
    name: "onesan_add",
    description: "お姉さんの語彙を追加します",
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

    const success = await addVocabulary("onesan", wordOption.value, null, env.DB);
    
    if (!success) {
      return { type: 4, data: { content: "語彙の追加に失敗しました。APIエラーなどを確認してください。", flags: 64 } }; // flags 64 means Ephemeral
    }

    return { type: 4, data: { content: `お姉さんの語彙を追加しました！\nWord: \`${wordOption.value}\``, flags: 64 } };
  },
}

export default onesanAdd;
