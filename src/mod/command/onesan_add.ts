import type { CommandModule } from "../mod.d.ts";
import { addVocabulary } from "../api";

const onesanAdd: CommandModule = {
  data: {
    name: "sexy_add",
    description: "激エロおねぇさんの語彙を増やします",
    options: [
      {
        name: "word",
        description: "うっふ〜ん♡[here]♡[option]",
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
      return { type: 4, data: { content: "Failed to add vocabulary", flags: 64 } }; // flags 64 means Ephemeral
    }

    return { type: 4, data: { content: `「\`${wordOption.value}\`」ね♡覚えておいてあげるわ♡`, flags: 64 } };
  },
}

export default onesanAdd;
