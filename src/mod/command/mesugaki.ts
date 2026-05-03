import type { CommandModule } from "../mod.d.ts";
import { fetchVocabulary } from "../api";
import { getMesugakiBatouSuffix, getMesugakiWakaraseSuffix } from "../flavor";

const mesugaki: CommandModule = {
  data: {
    name: "mesugaki",
    description: "メスガキがしゃべります",
    options: [
      {
        name: "category",
        description: "どっちをご所望で？",
        type: 3,  
        required: true,
        choices: [
          { name: "batou", value: "batou" },
          { name: "wakarase", value: "wakarase" }
        ]
      }
    ]
  },
  execute: async (interaction: any, env: any, executionCtx?: any) => {
    const options = interaction.data?.options || [];
    const catOption = options.find((opt: any) => opt.name === "category");
    const category = catOption ? catOption.value : null;
    
    const user_id = interaction.member?.user?.id || interaction.user?.id;
    const word = await fetchVocabulary("mesugaki", category, user_id, env.DB, executionCtx);
    
    if (!word) {
      return { type: 4, data: { content: "No vocabulary found" } };
    }

    let finalResponse = word;
    if (category === "batou") {
      finalResponse += getMesugakiBatouSuffix();
    } else if (category === "wakarase") {
      finalResponse += getMesugakiWakaraseSuffix();
    }

    return { type: 4, data: { content: finalResponse } };
  },
}

export default mesugaki;
