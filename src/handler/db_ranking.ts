import { Context } from "hono";
import { generateErrorResponse } from "../error_handle";
import { convertDB, getRanking, parmParser} from "../util";


export const db_ranking = async (
  c: Context<{ Bindings: CloudflareBindings }>,
) => {
  const type = convertDB(parmParser.string(c.req.query("type")));
  const result = await getRanking(c.env.DB, type);

  if (result.error) {
    return c.json(generateErrorResponse(result.error), result.status as any);
  }

  return c.json(result.results);
}