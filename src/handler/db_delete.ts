import { Context } from "hono";
import { deleteVocabularyInternal, parmParser } from "../util";
import { generateErrorResponse } from "../error_handle";

export const db_delete = async (
  c: Context<{ Bindings: CloudflareBindings}>,
) => {
  const id_num = parmParser.number(c.req.param("id"));

  const result = await deleteVocabularyInternal(c.env.DB, id_num);

  if (result.error) {
    if (typeof result.error === "string") return c.json({ message: result.error }, result.status as any);
    return c.json(generateErrorResponse(result.error), result.status as any);
  }

  return c.json({ success: true });
}