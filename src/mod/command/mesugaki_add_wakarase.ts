import type { CommandModule } from "../mod.d.ts";
import { addVocabulary } from "../api";

const mesugakiAddWakarase: CommandModule = {
  data: {
    name: "mesugaki_add_wakarase",
    description: "メスガキ語彙マシマシ(wakarase)",
    options: [
      {
        name: "word",
        description: "[here]ぉぉお♡",
        type: 3,
        required: true
      }
    ]
  },
  execute: async (interaction: any, env: any, executionCtx?: any) => {
    const options = interaction.data?.options || [];
    const wordOption = options.find((opt: any) => opt.name === "word");
    if (!wordOption) return { type: 4, data: { content: "Error: word is required" } };

    const success = await addVocabulary("mesugaki", wordOption.value, "wakarase", env.DB);
    
    if (!success) {
      return { type: 4, data: { content: "Failed to add vocabulary", flags: 64 } }; 
    }

    return { type: 4, data: { content: `「\`${wordOption.value}\`」ね♡新しい言葉、アタシが覚えててあげる♡`, flags: 64 } };
  },
}

export default mesugakiAddWakarase;
