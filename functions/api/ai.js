import { json, errorJson, readJson } from "../_lib/http.js";
import { requireDB, dbAll } from "../_lib/db.js";
import { parseISODate, daysBetween } from "../_lib/time.js";

function envStr(env, key, fallback = null) {
  const v = env && env[key];
  return v ? String(v) : fallback;
}

function computeNextDeadline(row, now) {
  const candidates = [
    { key: "registration_end", label: "报名截止", date: parseISODate(row.registration_end) },
    { key: "submission_end", label: "提交截止", date: parseISODate(row.submission_end) },
    { key: "result_end", label: "结果公布", date: parseISODate(row.result_end) },
  ].filter((c) => c.date);

  const future = candidates.filter((c) => c.date.getTime() >= now.getTime()).sort((a, b) => a.date - b.date);
  if (future.length > 0) {
    const c = future[0];
    return { key: c.key, label: c.label, dateISO: c.date.toISOString().slice(0, 10), daysLeft: daysBetween(now, c.date) };
  }

  const past = candidates.sort((a, b) => b.date - a.date);
  if (past.length > 0) {
    const c = past[0];
    return { key: c.key, label: c.label, dateISO: c.date.toISOString().slice(0, 10), daysLeft: -daysBetween(c.date, now) };
  }

  return null;
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
  const useWebSearch = Boolean(body.useWebSearch);

  const apiKey = envStr(env, "GLM_API_KEY");
  if (!apiKey) {
    return errorJson(501, "AI is not configured. Set GLM_API_KEY (Pages env var / secret).");
  }

  const baseUrl = envStr(env, "GLM_API_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions");
  const model = envStr(env, "GLM_MODEL", "glm-4.7-flash");
  const bochaKey = envStr(env, "BOCHA_API_KEY");

  const members = await dbAll(
    db.prepare(`SELECT id, name FROM members ORDER BY created_at ASC`)
  );

  const competitions = await dbAll(
    db.prepare(
      `SELECT
         c.id,
         c.name,
         c.variant,
         c.display_name,
         c.source_tag,
         c.type_tags_json,
         c.offline_defense,
         c.schedule_basis_year,
         c.registration_start, c.registration_end,
         c.submission_start, c.submission_end,
         c.result_start, c.result_end,
         c.registration_text, c.submission_text, c.result_text,
         c.evidence_links_json,
         c.notes,
         p.state AS progress_state,
         p.state_detail AS progress_state_detail,
         p.award AS progress_award,
         p.owner_member_id AS progress_owner_member_id,
         p.risk_level AS progress_risk_level,
         p.notes AS progress_notes,
         p.updated_at AS progress_updated_at
       FROM competitions c
       LEFT JOIN competition_progress p ON p.competition_id = c.id
       ORDER BY c.display_name COLLATE NOCASE ASC`
    )
  );

  // Keep context bounded (Flash models are fast but still have context limits).
  const trim = (s, max = 500) => {
    if (!s) return null;
    const x = String(s);
    return x.length > max ? x.slice(0, max) + "…" : x;
  };

  const now = new Date();
  const compactCompetitions = competitions.map((c) => ({
    id: c.id,
    name: c.name,
    variant: c.variant,
    display_name: c.display_name,
    source_tag: c.source_tag,
    type_tags_json: c.type_tags_json,
    offline_defense: c.offline_defense,
    schedule_basis_year: c.schedule_basis_year,
    registration_start: c.registration_start,
    registration_end: c.registration_end,
    submission_start: c.submission_start,
    submission_end: c.submission_end,
    result_start: c.result_start,
    result_end: c.result_end,
    registration_text: trim(c.registration_text, 160),
    submission_text: trim(c.submission_text, 160),
    result_text: trim(c.result_text, 160),
    evidence_links_json: c.evidence_links_json,
    notes: trim(c.notes, 400),
    nextDeadline: computeNextDeadline(c, now),
    progress_state: c.progress_state,
    progress_state_detail: trim(c.progress_state_detail, 120),
    progress_award: trim(c.progress_award, 80),
    progress_owner_member_id: c.progress_owner_member_id,
    progress_risk_level: c.progress_risk_level,
    progress_notes: trim(c.progress_notes, 400),
    progress_updated_at: c.progress_updated_at,
  }));

  const system = [
    "你是团队内部的『竞赛作战面板』AI 助手。",
    "只基于我提供的数据回答；不确定就明确说不确定，并给出你需要的补充信息。",
    "默认用中文回答，给出可执行的结论：最近/最急/按负责人/下一步动作建议。",
    "如果开启了联网搜索，请结合搜索结果回答，并在关键结论后给出来源链接。",
  ].join("\\n");

  const dataset = {
    nowISO: now.toISOString(),
    members,
    competitions: compactCompetitions,
  };

  let webSearchBlock = "";
  if (useWebSearch) {
    if (!bochaKey) {
      webSearchBlock = "\\n\\n联网搜索：未配置（缺少 BOCHA_API_KEY）。";
    } else {
      try {
        const r = await fetch("https://api.bochaai.com/v1/web-search", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${bochaKey}`,
          },
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
      content:
        "面板数据（JSON）：\\n" +
        JSON.stringify(dataset) +
        webSearchBlock +
        "\\n\\n用户问题：\\n" +
        message,
    },
  ];

  let resp;
  try {
    resp = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });
  } catch (e) {
    return errorJson(502, "AI request failed", { detail: String(e && e.message ? e.message : e) });
  }

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

  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? "";

  return json({ ok: true, reply: { content } });
}
