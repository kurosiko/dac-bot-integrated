export enum Methods {
  Get,
  Post,
  Delete
}

export enum ModelType{
  Mesugaki = "mesugaki",
  Osugaki = "osugaki",
  Onesan = "onesan",
  None = "none"
}
export type PostRequest = { word: string; type: string; category?: string };