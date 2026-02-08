import { isYMD, parseYMD } from "../lib/date";
import type { Competition, CompetitionPatch } from "../lib/types";

export function normalizeCompetitionPatch(patch: CompetitionPatch): CompetitionPatch {
  const out: CompetitionPatch = { ...patch };
  if (out.registration_deadline_at !== undefined) out.registration_deadline_at = String(out.registration_deadline_at || "").trim();
  if (out.submission_deadline_at !== undefined) out.submission_deadline_at = out.submission_deadline_at ? String(out.submission_deadline_at).trim() : null;
  if (out.result_deadline_at !== undefined) out.result_deadline_at = out.result_deadline_at ? String(out.result_deadline_at).trim() : null;
  if (out.status_text !== undefined) out.status_text = String(out.status_text || "");
  if (out.team_members !== undefined) {
    out.team_members = Array.isArray(out.team_members) ? out.team_members.map((x) => String(x).trim()).filter(Boolean) : [];
  }
  if (out.links !== undefined) {
    const raw = Array.isArray(out.links) ? out.links : [];
    out.links = raw
      .map((x: any) => ({ title: String(x?.title || ""), url: String(x?.url || "").trim() }))
      .filter((x) => x.url);
  }
  return out;
}

export function validateCompetitionDraft(draft: Competition): string | null {
  const reg = String(draft.registration_deadline_at || "").trim();
  if (!reg) return "报名截止为必填";
  if (!isYMD(reg)) return "报名截止日期格式应为 YYYY-MM-DD";
  const regDate = parseYMD(reg);
  if (!regDate) return "报名截止日期无效（请检查月份/日期是否存在）";
  const sub = draft.submission_deadline_at;
  if (sub && !isYMD(sub)) return "作品提交日期格式应为 YYYY-MM-DD";
  const subDate = sub ? parseYMD(sub) : null;
  if (sub && !subDate) return "作品提交日期无效（请检查月份/日期是否存在）";
  const res = draft.result_deadline_at;
  if (res && !isYMD(res)) return "结果公布日期格式应为 YYYY-MM-DD";
  const resDate = res ? parseYMD(res) : null;
  if (res && !resDate) return "结果公布日期无效（请检查月份/日期是否存在）";
  if (subDate && subDate.getTime() < regDate.getTime()) return "作品提交日期不能早于报名截止日期";
  if (resDate && resDate.getTime() < regDate.getTime()) return "结果公布日期不能早于报名截止日期";
  if (subDate && resDate && resDate.getTime() < subDate.getTime()) return "结果公布日期不能早于作品提交日期";
  return null;
}

export function parseHostname(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
