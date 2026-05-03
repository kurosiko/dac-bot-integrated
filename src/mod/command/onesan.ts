import type { CommandModule } from "../mod.d.ts";
import { fetchVocabulary } from "../api";
import { generateHeart, getOnesanPrefix, getOnesanSuffix } from "../flavor";

const onesan: CommandModule = {
  data: {
<<<<<<< HEAD
    name: "onesan",
    description: "うっふ～～ん♡します",
    options: [
      {
        name: "語尾指定",
        description: "語尾を選択します",
=======
    name: "sexy",
    description: "激エロおねぇさんが喋ります",
    options: [
      {
        name: "suffix",
        description: "うっふ〜ん♡[content]♡[here]",
>>>>>>> 8aab1198f913dc7da4e292e3c713762a68cc447a
        type: 3, 
        required: false,
        choices: [
          { name: "殺して～", value: "KOROSHITE" },
          { name: "愚かよ～", value: "OROKA" }
        ]
      }
    ]
  },
  execute: async (interaction: any, env: any, executionCtx?: any) => {
    const options = interaction.data?.options || [];
    const suffixOption = options.find((opt: any) => opt.name === "suffix");
    const suffixChoice = suffixOption ? suffixOption.value : null;

    const user_id = interaction.member?.user?.id || interaction.user?.id;
    const word = await fetchVocabulary("onesan", null, user_id, env.DB, executionCtx);
    
    if (!word) {
      return { type: 4, data: { content: "No vocabulary found" } };
    }

    const prefix = getOnesanPrefix();
    const suffix = getOnesanSuffix(suffixChoice);
    return { type: 4, data: { content: `${prefix}${word}${generateHeart()}${suffix}` } };
  },
}

export default onesan;
