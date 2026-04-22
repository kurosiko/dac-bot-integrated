import { Context } from "hono";
import { getVocabulary, convertDB, parmParser } from "../util";
import { generateErrorResponse } from "../error_handle";

export const db_fetch = async (
  c: Context<{ Bindings: CloudflareBindings }>,
) => {
  const type = convertDB(parmParser.string(c.req.query("type")));
  const category = c.req.query("category");
  const limit = parmParser.number(c.req.query("limit"));

  const result = await getVocabulary(c.env.DB, type, category, limit);

  if (result.error) {
    return c.json(generateErrorResponse(result.error), result.status as any);
  }

  return c.json(result.results);
}
