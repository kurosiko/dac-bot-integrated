import type { Context } from "hono";
import { resolveMusicUrl } from "../music/resolver";
import { MusicResolverError } from "../music/types";

export async function music_resolve(c: Context): Promise<Response> {
  const url = c.req.query("url");
  if (!url) return c.json({ message: "Invalid Parameters", error: { code: "UNSUPPORTED_URL" } }, 400);

  try {
    return c.json(await resolveMusicUrl(url));
  } catch (error) {
    if (error instanceof MusicResolverError) {
      const status = error.code === "UNSUPPORTED_URL" ? 400 : error.code === "TRACK_NOT_FOUND" ? 404 : 502;
      return c.json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.provider ? { provider: error.provider } : {}),
        },
      }, status);
    }
    throw error;
  }
}
