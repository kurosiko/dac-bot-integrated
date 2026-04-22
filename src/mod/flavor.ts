export const generateRandNum = (min: number, max: number) => {
  if (max < min) throw Error("max must be greater than or equal to min");
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export const generateTilde = () => "～".repeat(generateRandNum(3, 7));
export const generateHeart = () => "♡".repeat(generateRandNum(2, 5));
export const generateSmallO = () => "ぉ".repeat(generateRandNum(2, 6));

export const getOnesanPrefix = () => {
  return `うっふ${generateTilde()}ん${generateHeart()}`;
}

export const EndChoice = {
  KOROSHITE: "殺してぇ",
  OROKA: "愚かよ",
} as const;

export type EndChoiceKey = keyof typeof EndChoice;

export const getOnesanSuffix = (choice?: EndChoiceKey | string | null) => {
  if (!choice || !Object.keys(EndChoice).includes(choice)) {
    const keys = Object.keys(EndChoice) as EndChoiceKey[];
    choice = keys[generateRandNum(0, keys.length - 1)];
  }
  
  const base = EndChoice[choice as EndChoiceKey];
  return `${base}${generateTilde()}ん${generateHeart()}`;
}

export const getMesugakiBatouSuffix = () => {
  return generateHeart();
}

export const getMesugakiWakaraseSuffix = () => {
  return `${generateSmallO()}お${generateHeart()}`;
}
