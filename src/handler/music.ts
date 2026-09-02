import type { Context } from "hono";
import { resolveMusicUrl } from "../music/resolver";
import { MusicResolverError } from "../music/types";

export async function music_resolve(c: Context<{ Bindings: CloudflareBindings }>): Promise<Response> {
  const url = c.req.query("url")?.trim();
  if (!url) {
    return c.json({ error: { code: "INVALID_PARAMETERS", message: "url query parameter is required" } }, 400);
  }

  try {
    return c.json(await resolveMusicUrl(url));
  } catch (error) {
    if (error instanceof MusicResolverError) {
      const status = error.code === "INVALID_PARAMETERS" || error.code === "UNSUPPORTED_URL"
        ? 400
        : error.code === "TRACK_NOT_FOUND"
          ? 404
          : 502;
      return c.json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.provider ? { provider: error.provider } : {}),
        },
      }, status as 400 | 404 | 502);
    }
    throw error;
  }
}
