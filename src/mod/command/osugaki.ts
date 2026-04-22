import type { CommandModule } from "../mod.d.ts";
import { fetchVocabulary } from "../api";

const osugaki: CommandModule = {
  data: {
    name: "osugaki",
    description: "開発中(というか機能案ぼしゅーちゅう)",
    options: [
      {
        name: "category",
        description: "choose category",
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
    const word = await fetchVocabulary("osugaki", category, user_id, env.DB, executionCtx);
    
    if (!word) {
      return { type: 4, data: { content: "No vocabulary found" } };
    }

    return { type: 4, data: { content: word } };
  },
}

export default osugaki;
