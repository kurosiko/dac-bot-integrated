import { Context } from "hono";
import { ErrorReason, generateErrorResponse } from "./error_handle";
import { Methods, ModelType } from "./types";

//renew here when you need to add db
export const convertDB = (db_str: string): ModelType => {
  switch (db_str) {
    case ("mesugaki"):
      return ModelType.Mesugaki;
    case ("osugaki"):
      return ModelType.Osugaki;
    case ("onesan"):
      return ModelType.Onesan;
    default:
      return ModelType.None;
  }
}
//renew here when you need to convert parm to new type
export const parmParser = {
  string: (parm: string | undefined) => (parm !== undefined ? parm : ""),
  number: (parm: string | undefined) => (parm !== undefined ? Number(parm) : 1)
}

//check has category when select mesugaki or osugaki
export const checkHasCategory = (type: ModelType, category: string | null | undefined):boolean => (type === ModelType.Mesugaki || type === ModelType.Osugaki) && !category;


const generateQuery = (
  Method: Methods,
  hasCategory: boolean = false
): string => {
  switch (Method) {
    case Methods.Get:
      if (hasCategory) {
        return "SELECT id, word FROM vocabulary WHERE type = ? AND category = ? ORDER BY RANDOM() LIMIT ?;";
      }
      return "SELECT id, word FROM vocabulary WHERE type = ? ORDER BY RANDOM() LIMIT ?;";
    case Methods.Post:
      return "INSERT INTO vocabulary (word, type, category) VALUES (?, ?, ?);";
    case Methods.Delete:
      return "DELETE FROM vocabulary WHERE id = ?;";
    default:
      throw new Error("Invalid query generation parameters");
  }
}

export const getVocabulary  = async (
  db: D1Database,
  type: ModelType,
  category: string | null | undefined,
  limit: number = 1,
  user_id: string | null | undefined = null,
  executionCtx?: ExecutionContext
) => {
  if (checkHasCategory(type, category)) {
      return { error: ErrorReason.InvalidParm, status: 400 };
  }
  
  if (isNaN(limit) || limit <= 0) {
    return { error: ErrorReason.InvalidParm, status: 400 };
  }

  try {
    //!!category for detect null or undefined
    // !category means if null or undefined -> true
    //!!category means if null or undefined -> false 
    const query = generateQuery(Methods.Get, !!category);
    const prep = category
      ? db.prepare(query).bind(type, category, limit)
      : db.prepare(query).bind(type, limit);
    const word = await prep.all();

    if (!word.success) {
      return { error: ErrorReason.QueryFailed, status: 500 };
    }
    
    //for ranking
    if (user_id && word.results && word.results.length > 0) {
      const usageQuery = "INSERT INTO usages (user_id, type, count) VALUES (?, ?, 1) ON CONFLICT(user_id, type) DO UPDATE SET count = count + 1;";
      if (executionCtx) {
        executionCtx.waitUntil(
          db.prepare(usageQuery).bind(user_id, type).run()
        );
      } else {
        await db.prepare(usageQuery).bind(user_id, type).run();
      }
    }

    return { results: word.results || [], status: 200 };
  } catch (e) {
    console.error(e);
    return { error: ErrorReason.InternalError, status: 500 };
  }
}

export const addVocabulary= async (
  db: D1Database,
  word: string,
  type: ModelType,
  category?: string | null
) => {
  if (checkHasCategory(type, category)) {
    return { error: ErrorReason.InvalidParm, status: 400 };
  }

  try {
    const query = generateQuery(Methods.Post);
    const prep = db.prepare(query).bind(word.trim(), type, category || null);
    const result = await prep.run();

    if (!result.success) {
      return { error: ErrorReason.QueryFailed, status: 500 };
    }
    return { success: true, status: 200 };
  } catch (e) {
    console.error(e);
    return { error: ErrorReason.InternalError, status: 500 };
  }
}

export const deleteVocabularyInternal = async (
  db: D1Database,
  id: number
) => {
  if (isNaN(id)) {
    return { error: ErrorReason.InvalidParm, status: 400 };
  }

  try {
    const query = generateQuery(Methods.Delete);
    const prep = db.prepare(query).bind(id);
    const result = await prep.run();

    if (!result.success) {
      return { error: ErrorReason.QueryFailed, status: 500 };
    }

    if (result.meta.changes === 0) {
      return { error: "Not Found", status: 404 };
    }

    return { success: true, status: 200 };
  } catch (e) {
    console.error(e);
    return { error: ErrorReason.InternalError, status: 500 };
  }
}


export const getRanking= async (
  db: D1Database,
  type: ModelType
) => {
  try {
    let prep;
    if (type !== ModelType.None) {
      prep = db.prepare("SELECT user_id, count FROM usages WHERE type = ? ORDER BY count DESC LIMIT 10;").bind(type);
    } else {
      prep = db.prepare("SELECT user_id, SUM(count) as count FROM usages GROUP BY user_id ORDER BY count DESC LIMIT 10;");
    }

    const result = await prep.all();
    if (!result.success) {
      return { error: ErrorReason.QueryFailed, status: 500 };
    }
    return { results: result.results || [], status: 200 };
  } catch (e) {
    console.error(e);
    return { error: ErrorReason.InternalError, status: 500 };
  }
}







