import type { CommandModule } from "../mod.d.ts";
import { addVocabulary } from "../api";

const mesugakiAddBatou: CommandModule = {
  data: {
    name: "mesugaki_add_batou",
    description: "メスガキ語彙マシマシ(batou)",
    options: [
      {
        name: "word",
        description: "[here]",
        type: 3,
        required: true
      }
    ]
  },
  execute: async (interaction: any, env: any, executionCtx?: any) => {
    const options = interaction.data?.options || [];
    const wordOption = options.find((opt: any) => opt.name === "word");
    if (!wordOption) return { type: 4, data: { content: "Error: word is required" } };

    const success = await addVocabulary("mesugaki", wordOption.value, "batou", env.DB);
    
    if (!success) {
      return { type: 4, data: { content: "Failed to add vocabulary", flags: 64 } }; 
    }
    //e.g. 「ぬるぽ」ね♡ 新しい言葉、アタシが覚えててあげる♡
    return {
      type: 4, data: {
        content: `「\`${wordOption.value}\`」ね♡新しい言葉、アタシが覚えててあげる♡`, flags: 64
      }
    };
  },
}

export default mesugakiAddBatou;
