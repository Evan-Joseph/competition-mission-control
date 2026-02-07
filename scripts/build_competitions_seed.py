#!/usr/bin/env python3
# Builds db/seed_competitions.sql from the source CSV.
#
# Goal: Normalize each competition into one or more \"variants\" (e.g. 品牌策划/会计)
# so the dashboard can track/visualize and store progress per variant.

from __future__ import annotations

import csv
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

BASE_YEAR = 2026

PAREN_RE = re.compile(r"[（(]([^（）()]*)[）)]")
FULL_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
MD_RE = re.compile(r"(\d{2})-(\d{2})")

# Note: some labels include slashes (e.g. 双创/创业计划). We must not split on '/' when it's inside parentheses.
TOP_LEVEL_SEPS = {",", "，", ";", "；", "|", "/"}


def stable_id(name: str, variant: str) -> str:
    h = hashlib.sha1((name + "|" + variant).encode("utf-8")).hexdigest()
    return "comp_" + h[:12]


def sql_escape(s: Optional[str]) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def clean_label(label: Optional[str]) -> str:
    if not label:
        return ""
    x = re.sub(r"\s+", "", label)
    for t in ["推测", "正式报名", "正式", "已结束", "推定", "预计"]:
        x = x.replace(t, "")
    x = x.strip("：:")
    return x


def label_keys(label: str) -> Set[str]:
    c = clean_label(label)
    if not c:
        return set()

    keys = {c}
    for sep in ["/", "／", "与", "和", "及", "、"]:
        if sep in c:
            keys.update([p for p in c.split(sep) if p])

    # Drop common suffixes.
    more = set()
    for k in list(keys):
        for suf in ["赛道", "赛区", "赛项", "组别", "组"]:
            if k.endswith(suf) and len(k) > len(suf):
                more.add(k[: -len(suf)])
    keys.update(more)

    keys = {k for k in keys if k and k not in {"推测", "官方"}}
    return keys


@dataclass
class DateRange:
    start: Optional[date]
    end: Optional[date]


def infer_year_for_mmdd(mm: int, dd: int, *, start_mm: Optional[int], start_year: Optional[int], context: str) -> int:
    # With explicit start year, detect cross-year ranges.
    if start_year is not None and start_mm is not None:
        return start_year + 1 if mm < start_mm else start_year

    # Without explicit year but range crosses year boundary (e.g., 08-30至01-06),
    # treat result ranges as potentially next year.
    if start_mm is not None and mm < start_mm:
        if context == "res":
            return BASE_YEAR + 1
        return BASE_YEAR

    return BASE_YEAR


def parse_range(seg: str, *, context: str) -> DateRange:
    if not seg:
        return DateRange(None, None)
    s = seg.strip()
    if not s or "未公布" in s:
        return DateRange(None, None)

    s_no_paren = re.sub(r"[（(][^（）()]*[）)]", "", s)
    s_no_paren = re.sub(r"\s+", "", s_no_paren)

    # Handle \"xx-xx止\" / \"xx-xx截止\" (single end date)
    if "止" in s_no_paren and "至" not in s_no_paren:
        s_no_paren = s_no_paren.split("止", 1)[0]
    if "截止" in s_no_paren and "至" not in s_no_paren:
        s_no_paren = s_no_paren.split("截止", 1)[0]

    if "至" in s_no_paren:
        left, right = s_no_paren.split("至", 1)

        # Parse end first if it includes an explicit year.
        end_full = FULL_DATE_RE.search(right)
        if end_full:
            end_y, end_mm, end_dd = map(int, end_full.groups())
            end_date = date(end_y, end_mm, end_dd)

            # Start may be explicit or mm-dd (infer year around end).
            start_full = FULL_DATE_RE.search(left)
            if start_full:
                y, mm, dd = map(int, start_full.groups())
                return DateRange(date(y, mm, dd), end_date)

            start_md = MD_RE.search(left)
            if start_md:
                s_mm, s_dd = map(int, start_md.groups())
                # If start month is after end month, it likely started in the previous year.
                s_y = end_y - 1 if s_mm > end_mm else end_y
                return DateRange(date(s_y, s_mm, s_dd), end_date)

            return DateRange(None, end_date)

        # End has no explicit year.
        end_md = MD_RE.search(right)
        if not end_md:
            return DateRange(None, None)
        end_mm, end_dd = map(int, end_md.groups())

        start_full = FULL_DATE_RE.search(left)
        if start_full:
            s_y, s_mm, s_dd = map(int, start_full.groups())
            start_date = date(s_y, s_mm, s_dd)
            end_y = infer_year_for_mmdd(end_mm, end_dd, start_mm=s_mm, start_year=s_y, context=context)
            return DateRange(start_date, date(end_y, end_mm, end_dd))

        start_md = MD_RE.search(left)
        if not start_md:
            # No start, only end.
            return DateRange(None, date(BASE_YEAR, end_mm, end_dd))
        s_mm, s_dd = map(int, start_md.groups())

        # Cross-year inference for mm-dd ranges with no explicit years.
        if s_mm > end_mm:
            if context == "res":
                start_y = BASE_YEAR
                end_y = BASE_YEAR + 1
            else:
                start_y = BASE_YEAR - 1
                end_y = BASE_YEAR
        else:
            start_y = BASE_YEAR
            end_y = BASE_YEAR

        return DateRange(date(start_y, s_mm, s_dd), date(end_y, end_mm, end_dd))

    # Single full date
    m = FULL_DATE_RE.search(s_no_paren)
    if m:
        y, mm, dd = map(int, m.groups())
        d = date(y, mm, dd)
        return DateRange(d, d)

    # Single mm-dd
    m = MD_RE.search(s_no_paren)
    if m:
        mm, dd = map(int, m.groups())
        d = date(BASE_YEAR, mm, dd)
        return DateRange(d, d)

    return DateRange(None, None)


def split_cell(cell: str) -> List[str]:
    if not cell:
        return []
    c = cell.strip()
    if not c:
        return []

    out: List[str] = []
    buf: List[str] = []
    depth = 0

    for ch in c:
        if ch in ("（", "("):
            depth += 1
        elif ch in ("）", ")"):
            depth = max(0, depth - 1)

        if depth == 0 and ch in TOP_LEVEL_SEPS:
            part = "".join(buf).strip()
            if part:
                out.append(part)
            buf = []
            continue

        buf.append(ch)

    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def extract_label(part: str) -> str:
    labels = PAREN_RE.findall(part or "")
    return labels[-1].strip() if labels else ""


def option_keyset(part: str) -> Set[str]:
    return label_keys(extract_label(part))


def best_match(parts: List[str], vkeys: Set[str], *, want_unlabeled: bool = False) -> Optional[str]:
    if not parts:
        return None

    if not vkeys:
        if want_unlabeled:
            unlabeled = [p for p in parts if not clean_label(extract_label(p))]
            if len(unlabeled) == 1:
                return unlabeled[0]
        return parts[0] if len(parts) == 1 else (unlabeled[0] if want_unlabeled and unlabeled else None)

    best = None
    best_score = 0
    for p in parts:
        score = len(option_keyset(p) & vkeys)
        if score > best_score:
            best = p
            best_score = score
    if best_score > 0:
        return best

    return parts[0] if len(parts) == 1 else None


def parse_type_tags(s: str) -> List[str]:
    if not s:
        return []
    # Normalize separators.
    x = s.replace("，", ",")
    parts = [p.strip() for p in x.split(",") if p.strip()]
    # de-dup preserving order
    seen = set()
    out = []
    for p in parts:
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def parse_links(s: str) -> List[str]:
    if not s:
        return []
    parts = [p.strip() for p in re.split(r"\s+", s) if p.strip()]
    links = [p for p in parts if p.startswith("http://") or p.startswith("https://")]
    # de-dup preserving order
    seen = set()
    out = []
    for u in links:
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def build_seed_rows(src_csv: Path) -> List[Dict[str, Any]]:
    rows = list(csv.DictReader(src_csv.open(encoding="utf-8")))
    out: List[Dict[str, Any]] = []

    for r in rows:
        name = r["竞赛名称"].strip()

        reg_parts = split_cell(r.get("报名时间_2026", ""))
        sub_parts = split_cell(r.get("作品提交时间_2026", ""))
        res_parts = split_cell(r.get("结果公布时间_2026", ""))

        labels = {clean_label(extract_label(p)) for p in reg_parts + sub_parts + res_parts}
        labels = {l for l in labels if l}

        has_unlabeled = any(not clean_label(extract_label(p)) for p in reg_parts + sub_parts + res_parts)
        variants = sorted(labels)
        if not variants:
            variants = [""]
        elif has_unlabeled:
            variants = [""] + variants

        for variant in variants:
            vkeys = label_keys(variant) if variant else set()
            reg_pick = best_match(reg_parts, vkeys, want_unlabeled=(variant == ""))
            sub_pick = best_match(sub_parts, vkeys, want_unlabeled=(variant == ""))
            res_pick = best_match(res_parts, vkeys, want_unlabeled=(variant == ""))

            reg_text = reg_pick or r.get("报名时间_2026", "").strip()
            sub_text = sub_pick or r.get("作品提交时间_2026", "").strip()
            res_text = res_pick or r.get("结果公布时间_2026", "").strip()

            reg_range = parse_range(reg_text, context="reg")
            sub_range = parse_range(sub_text, context="sub")
            res_range = parse_range(res_text, context="res")

            display_name = name if not variant else f"{name}（{variant}）"
            cid = stable_id(name, variant)

            out.append(
                {
                    "id": cid,
                    "name": name,
                    "variant": variant,
                    "display_name": display_name,
                    "source_tag": (r.get("竞赛来源标签") or "").strip() or None,
                    "type_tags_json": json.dumps(parse_type_tags(r.get("参赛形态标签", "")), ensure_ascii=False),
                    "offline_defense": (r.get("是否线下答辩") or "").strip() or None,
                    "schedule_basis_year": (r.get("赛程依据年份") or "").strip() or None,
                    "evidence_links_json": json.dumps(parse_links(r.get("证据链接", "")), ensure_ascii=False),
                    "notes": (r.get("备注") or "").strip() or None,
                    "registration_start": iso(reg_range.start),
                    "registration_end": iso(reg_range.end),
                    "submission_start": iso(sub_range.start),
                    "submission_end": iso(sub_range.end),
                    "result_start": iso(res_range.start),
                    "result_end": iso(res_range.end),
                    "registration_text": reg_text or None,
                    "submission_text": sub_text or None,
                    "result_text": res_text or None,
                }
            )

    # Dedup by id (stable hashing should prevent, but keep safe)
    seen = set()
    dedup = []
    for o in out:
        if o["id"] in seen:
            continue
        seen.add(o["id"])
        dedup.append(o)
    return dedup


def write_seed_sql(rows: List[Dict[str, Any]], out_sql: Path) -> None:
    lines = []
    lines.append("-- Auto-generated. Do not hand-edit.\n")
    lines.append("INSERT OR IGNORE INTO competitions (\n")
    lines.append("  id, name, variant, display_name,\n")
    lines.append("  source_tag, type_tags_json, offline_defense, schedule_basis_year,\n")
    lines.append("  evidence_links_json, notes,\n")
    lines.append("  registration_start, registration_end,\n")
    lines.append("  submission_start, submission_end,\n")
    lines.append("  result_start, result_end,\n")
    lines.append("  registration_text, submission_text, result_text\n")
    lines.append(") VALUES\n")

    values = []
    for r in rows:
        values.append(
            "("
            + ", ".join(
                [
                    sql_escape(r["id"]),
                    sql_escape(r["name"]),
                    sql_escape(r["variant"]),
                    sql_escape(r["display_name"]),
                    sql_escape(r["source_tag"]),
                    sql_escape(r["type_tags_json"]),
                    sql_escape(r["offline_defense"]),
                    sql_escape(r["schedule_basis_year"]),
                    sql_escape(r["evidence_links_json"]),
                    sql_escape(r["notes"]),
                    sql_escape(r["registration_start"]),
                    sql_escape(r["registration_end"]),
                    sql_escape(r["submission_start"]),
                    sql_escape(r["submission_end"]),
                    sql_escape(r["result_start"]),
                    sql_escape(r["result_end"]),
                    sql_escape(r["registration_text"]),
                    sql_escape(r["submission_text"]),
                    sql_escape(r["result_text"]),
                ]
            )
            + ")"
        )

    lines.append(",\n".join(values))
    lines.append(";\n")

    out_sql.parent.mkdir(parents=True, exist_ok=True)
    out_sql.write_text("".join(lines), encoding="utf-8")


def write_preview_json(rows: List[Dict[str, Any]], out_json: Path) -> None:
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    src_csv = repo / "竞赛候选清单_满足条件.csv"
    out_sql = repo / "db" / "seed_competitions.sql"
    out_json = repo / "public" / "data" / "competitions.seed.preview.json"

    rows = build_seed_rows(src_csv)
    write_seed_sql(rows, out_sql)
    write_preview_json(rows, out_json)
    print(f"rows={len(rows)}")
    print(f"wrote: {out_sql}")
    print(f"wrote: {out_json}")


if __name__ == "__main__":
    main()
