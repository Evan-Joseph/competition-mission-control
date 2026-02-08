import { json, errorJson, readJson } from "../_lib/http.js";
import { requireDB, dbAll } from "../_lib/db.js";
import { ensureCompetitionsSchema } from "../_lib/schema.js";

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isYMD(s) {
  return YMD_RE.test(String(s || "").trim());
}

function envStr(env, key, fallback = null) {
  const v = env && env[key];
  return v ? String(v) : fallback;
}

function trim(s, max = 800) {
  if (!s) return "";
  const x = String(s);
  return x.length > max ? x.slice(0, max) + "…" : x;
}

function parseJsonArray(raw, fallback = []) {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function rowToCompetition(r) {
  return {
    id: r.id,
    name: r.name,
    registration_deadline_at: r.registration_deadline_at,
    submission_deadline_at: r.submission_deadline_at || null,
    result_deadline_at: r.result_deadline_at || null,
    included_in_plan: Boolean(r.included_in_plan),
    registered: Boolean(r.registered),
    status_text: trim(r.status_text || "", 600),
    team_members: parseJsonArray(r.team_members, []).map((x) => String(x)).filter(Boolean),
    links: parseJsonArray(r.links, [])
      .map((x) => {
        if (typeof x === "string") return { title: "", url: x };
        if (x && typeof x === "object") return { title: String(x.title || ""), url: String(x.url || "") };
        return null;
      })
      .filter((x) => x && x.url),
  };
}

function isMissedRegistration(c, todayISO) {
  return c.registration_deadline_at < todayISO && !c.registered;
}

function safeExtractJsonObject(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // Try to salvage: extract first {...} block.
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i === -1 || j === -1 || j <= i) return null;
    try {
      return JSON.parse(s.slice(i, j + 1));
    } catch {
      return null;
    }
  }
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  const allowedKeys = new Set([
    "included_in_plan",
    "registered",
    "registration_deadline_at",
    "submission_deadline_at",
    "result_deadline_at",
    "status_text",
    "team_members",
    "links",
  ]);
  const out = [];
  for (const a of actions.slice(0, 20)) {
    if (!a || typeof a !== "object") continue;
    if (a.type !== "update_competition") continue;
    const competition_id = String(a.competition_id || "").trim();
    if (!competition_id) continue;
    const patch = a.patch && typeof a.patch === "object" ? a.patch : null;
    if (!patch) continue;

    // Keep only allowed keys to avoid surprising writes; backend will validate types.
    const cleanedPatch = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!allowedKeys.has(k)) continue;
      // Accept ISO timestamps from model output; normalize to YYYY-MM-DD when obvious.
      if ((k === "registration_deadline_at" || k === "submission_deadline_at" || k === "result_deadline_at") && typeof v === "string" && v.includes("T")) {
        cleanedPatch[k] = v.slice(0, 10);
        continue;
      }
      cleanedPatch[k] = v;
    }
    if (Object.keys(cleanedPatch).length === 0) continue;

    out.push({
      id: String(a.id || "") || "action_" + crypto.randomUUID().replaceAll("-", ""),
      type: "update_competition",
      title: String(a.title || "").trim() || "更新竞赛",
      competition_id,
      patch: cleanedPatch,
      reason: a.reason ? String(a.reason) : undefined,
    });
  }
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  if (request.method !== "POST") {
    return errorJson(405, "Method not allowed", { allow: ["POST"] });
  }

  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return errorJson(400, e.message);
  }

  const message = String(body.message || "").trim();
  if (!message) return errorJson(400, "message is required");

  const todayISO = isYMD(body.todayISO) ? String(body.todayISO) : new Date().toISOString().slice(0, 10);
  const includeMissed = Boolean(body.includeMissed);
  const useWebSearch = Boolean(body.useWebSearch);

  const apiKey = envStr(env, "GLM_API_KEY");
  if (!apiKey) {
    return errorJson(501, "AI is not configured. Set GLM_API_KEY (Pages env var / secret).");
  }

  const baseUrl = envStr(env, "GLM_API_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions");
  const model = envStr(env, "GLM_MODEL", "glm-4.7-flash");
  const bochaKey = envStr(env, "BOCHA_API_KEY");

  try {
    await ensureCompetitionsSchema(db);
  } catch (e) {
    return errorJson(500, "failed to initialize schema", { detail: String(e && e.message ? e.message : e) });
  }

  let rows;
  try {
    rows = await dbAll(
      db.prepare(
        `SELECT
           id,
           name,
           registration_deadline_at,
           submission_deadline_at,
           result_deadline_at,
           included_in_plan,
           registered,
           status_text,
           team_members,
           links
         FROM competitions
         ORDER BY registration_deadline_at ASC, name COLLATE NOCASE ASC`
      )
    );
  } catch (e) {
    return errorJson(500, "failed to load competitions", { detail: String(e && e.message ? e.message : e) });
  }

  let competitions = rows.map(rowToCompetition);
  if (!includeMissed) competitions = competitions.filter((c) => !isMissedRegistration(c, todayISO));

  const system = [
    "你是团队内部的『竞赛规划看板』AI 助手。",
    "上下文默认仅包含『有效竞赛』（已错过报名的竞赛已排除）。",
    "你只能基于我提供的 JSON 数据回答；不确定就明确说不确定，并说明需要什么补充信息。",
    "你不会、也不能真实报名/提交/代办任何操作；你只能提出建议并生成『行动卡片』供用户确认后写入看板。",
    "你可以做问候、每日建议、压力分析、规划建议；当且仅当用户确认后，行动卡片才会被写入。",
    "如果启用联网搜索，请在 content 中给出关键结论的来源链接（原始 URL）。",
    "",
    "输出格式要求：你必须输出一个 JSON 对象（不要输出 Markdown 代码块）。",
    "JSON 结构：",
    '{ "content": "中文回复文本", "actions": [ { "id": "...", "type": "update_competition", "title": "动作标题", "competition_id": "comp_xxx", "patch": { ... }, "reason": "可选理由" } ] }',
    "",
    "actions 说明：",
    "- type 只能是 update_competition。",
    "- competition_id 必须来自数据中的 competitions[].id。",
    "- patch 只允许修改这些字段：included_in_plan, registered, registration_deadline_at, submission_deadline_at, result_deadline_at, status_text, team_members, links。",
    "- 日期必须是 YYYY-MM-DD，或对 submission/result 设为 null。",
    "",
    "如果你没有任何安全可执行的动作，actions 必须是空数组。",
  ].join("\\n");

  const dataset = {
    todayISO,
    competitions,
  };

  let webSearchBlock = "";
  if (useWebSearch) {
    if (!bochaKey) {
      webSearchBlock = "\\n\\n联网搜索：未配置（缺少 BOCHA_API_KEY）。";
    } else {
      try {
        const r = await fetch("https://api.bochaai.com/v1/web-search", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${bochaKey}` },
          body: JSON.stringify({ query: message, freshness: "oneYear", summary: true, count: 5 }),
        });
        const text = await r.text();
        let j;
        try {
          j = JSON.parse(text);
        } catch {
          j = null;
        }
        if (!r.ok) {
          webSearchBlock = `\\n\\n联网搜索：失败（HTTP ${r.status}）\\n${trim(text, 800) || ""}`;
        } else {
          const values = Array.isArray(j?.webPages?.value) ? j.webPages.value.slice(0, 5) : [];
          webSearchBlock =
            "\\n\\n联网搜索结果（Bocha Top 5）：\\n" +
            values
              .map((it, idx) => {
                const title = trim(it?.name || it?.title || "", 120) || "";
                const url = trim(it?.url || "", 220) || "";
                const summary = trim(it?.summary || it?.snippet || "", 260) || "";
                const site = trim(it?.siteName || "", 60) || "";
                const date = trim(it?.datePublished || "", 32) || "";
                const head = `(${idx + 1}) ${title}${site ? ` [${site}]` : ""}${date ? ` (${date})` : ""}`;
                return [head, url, summary].filter(Boolean).join("\\n");
              })
              .join("\\n\\n");
        }
      } catch (e) {
        webSearchBlock = `\\n\\n联网搜索：失败（${String(e && e.message ? e.message : e)}）`;
      }
    }
  }

  const messages = [
    { role: "system", content: system },
    {
      role: "user",
      content: "看板数据（JSON）：\\n" + JSON.stringify(dataset) + webSearchBlock + "\\n\\n用户问题：\\n" + message,
    },
  ];

  let resp;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    resp = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e && e.name === "AbortError") {
      return errorJson(504, "AI request timed out (30s)");
    }
    return errorJson(502, "AI request failed", { detail: String(e && e.message ? e.message : e) });
  }
  clearTimeout(timeoutId);

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return errorJson(502, "AI returned non-JSON response", { status: resp.status, body: text.slice(0, 2000) });
  }

  if (!resp.ok) {
    return errorJson(502, "AI error", { status: resp.status, body: data });
  }

  const raw = data?.choices?.[0]?.message?.content ?? "";
  const parsed = safeExtractJsonObject(raw);
  const content = parsed && typeof parsed.content === "string" ? parsed.content : String(raw || "");
  const actions = parsed ? normalizeActions(parsed.actions) : [];

  return json({ ok: true, reply: { content, actions } });
}
