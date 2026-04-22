import { Context } from "hono";
import { ErrorReason, generateErrorResponse } from "../error_handle";
import { PostRequest } from "../types";
import { addVocabulary, convertDB } from "../util";

export const db_post = async (
  c: Context<{ Bindings: CloudflareBindings}>,
) => {
  let body: PostRequest;
  try {
    body = await c.req.json<PostRequest>();
  } catch (e) {
    return c.json(generateErrorResponse(ErrorReason.InvalidParm), 400);
  }

  const result = await addVocabulary(c.env.DB, body.word, convertDB(body.type), body.category);

  if (result.error) {
    return c.json(generateErrorResponse(result.error), result.status as any);
  }

  return c.json({ success: true });
}
