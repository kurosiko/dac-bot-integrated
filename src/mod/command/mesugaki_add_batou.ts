import type { CommandModule } from "../mod.d.ts";
import { addVocabulary } from "../api";

const mesugakiAddBatou: CommandModule = {
  data: {
    name: "mesugaki_add_batou",
    description: "メスガキ語彙マシマシ(罵倒)",
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

    const success = await addVocabulary("mesugaki", wordOption.value, "batou", env.DB);
    
    if (!success) {
      return { type: 4, data: { content: "Failed to add vocabulary", flags: 64 } }; 
    }

    return { type: 4, data: { content: `Added mesugaki (batou) vocabulary\nWord: \`${wordOption.value}\``, flags: 64 } };
  },
}

export default mesugakiAddBatou;
