#!/usr/bin/env python3
# Builds:
# - public/data/competitions.seed.json  (frontend offline fallback)
# - db/seed_competitions.sql           (D1 seed)
# - reports/competitions.import.report.json
#
# Input CSVs (repo root):
# - active_competitions_final.csv
# - archive_missed_competitions_final.csv
#
# Notes:
# - Normalizes dates to YYYY-MM-DD (day-level milestones).
# - Ensures registration_deadline_at is always present (falls back to submission/result when missing).
# - Dedupe by generated stable id (sha1(name|registration_deadline_at)).

from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


YMD_LEN = 10


def stable_id(name: str, registration_deadline_at: str) -> str:
    h = hashlib.sha1((name + "|" + registration_deadline_at).encode("utf-8")).hexdigest()
    return "comp_" + h[:12]


def sql_escape(s: Optional[str]) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def parse_bool(v: Any) -> bool:
    s = str(v or "").strip().lower()
    return s in {"1", "true", "t", "yes", "y"}


def normalize_date(v: Any) -> Optional[str]:
    """
    Accepts:
    - YYYY-MM-DD
    - ISO datetime (e.g. 2026-03-25T23:59:59+08:00)
    Returns YYYY-MM-DD or None.
    """
    s = str(v or "").strip()
    if not s:
        return None
    if len(s) >= YMD_LEN and s[4] == "-" and s[7] == "-":
        return s[:YMD_LEN]
    return None


def split_links(raw: Any) -> List[Dict[str, str]]:
    s = str(raw or "").strip()
    if not s:
        return []
    # Common formats:
    # - url1;url2;url3
    # - JSON array
    if s.startswith("[") and s.endswith("]"):
        try:
            v = json.loads(s)
            if isinstance(v, list):
                out = []
                for x in v:
                    if isinstance(x, str) and x.strip():
                        out.append({"title": "", "url": x.strip()})
                    elif isinstance(x, dict) and str(x.get("url", "")).strip():
                        out.append({"title": str(x.get("title", "") or ""), "url": str(x.get("url") or "").strip()})
                return out
        except Exception:
            pass
    parts = [p.strip() for p in s.replace("\n", ";").split(";") if p.strip()]
    out: List[Dict[str, str]] = []
    seen = set()
    for p in parts:
        if p in seen:
            continue
        seen.add(p)
        out.append({"title": "", "url": p})
    return out


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        header: Optional[List[str]] = None
        for row in r:
            if not row or not any(c.strip() for c in row):
                continue
            header = row
            break
        if not header:
            return []
        dr = csv.DictReader(f, fieldnames=header)
        out = []
        for row in dr:
            if not row:
                continue
            if not any((v or "").strip() for v in row.values()):
                continue
            out.append({k: (v or "") for k, v in row.items()})
        return out


@dataclass
class Fix:
    row_name: str
    field: str
    before: Any
    after: Any
    note: str


@dataclass
class Skip:
    row_name: str
    reason: str


@dataclass
class Conflict:
    id: str
    name: str
    note: str


def merge_competitions(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    # Prefer "truer"/more-informative values.
    out = dict(a)
    for k in ["submission_deadline_at", "result_deadline_at"]:
        if not out.get(k) and b.get(k):
            out[k] = b[k]
    for k in ["included_in_plan", "registered"]:
        out[k] = bool(out.get(k)) or bool(b.get(k))
    # status_text: prefer longer non-empty
    if len(str(b.get("status_text") or "").strip()) > len(str(out.get("status_text") or "").strip()):
        out["status_text"] = b.get("status_text") or ""
    # team_members: union
    tm = list(dict.fromkeys([*(out.get("team_members") or []), *(b.get("team_members") or [])]))
    out["team_members"] = tm
    # links: union by url
    links_a = out.get("links") or []
    links_b = b.get("links") or []
    seen = set()
    links_out: List[Dict[str, str]] = []
    for it in [*links_a, *links_b]:
        url = str(it.get("url", "")).strip()
        if not url or url in seen:
            continue
        seen.add(url)
        links_out.append({"title": str(it.get("title", "") or ""), "url": url})
    out["links"] = links_out
    return out


def build_rows(repo: Path) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    active_csv = repo / "active_competitions_final.csv"
    archive_csv = repo / "archive_missed_competitions_final.csv"

    fixes: List[Fix] = []
    skips: List[Skip] = []
    conflicts: List[Conflict] = []

    raw_rows: List[Tuple[str, Dict[str, str]]] = []
    if active_csv.exists():
        raw_rows += [("active", r) for r in read_csv_rows(active_csv)]
    if archive_csv.exists():
        raw_rows += [("archive", r) for r in read_csv_rows(archive_csv)]

    out_by_id: Dict[str, Dict[str, Any]] = {}

    for src, r in raw_rows:
        name = str(r.get("name", "")).strip()
        if not name:
            skips.append(Skip(row_name="(empty name)", reason=f"{src}: missing name"))
            continue

        reg_raw = r.get("registration_deadline_at", "")
        sub_raw = r.get("submission_deadline_at", "")
        res_raw = r.get("result_deadline_at", "")

        reg = normalize_date(reg_raw)
        sub = normalize_date(sub_raw)
        res = normalize_date(res_raw)

        if reg is None:
            # Ensure required registration_deadline_at.
            if sub is not None:
                fixes.append(Fix(row_name=name, field="registration_deadline_at", before=reg_raw, after=sub, note=f"{src}: fallback to submission_deadline_at"))
                reg = sub
            elif res is not None:
                fixes.append(Fix(row_name=name, field="registration_deadline_at", before=reg_raw, after=res, note=f"{src}: fallback to result_deadline_at"))
                reg = res
            else:
                skips.append(Skip(row_name=name, reason=f"{src}: missing all deadlines (registration/submission/result)"))
                continue

        included = parse_bool(r.get("included_in_plan", "False"))
        registered = parse_bool(r.get("registered", "False"))

        status_text = str(r.get("status_text", "") or "").rstrip()
        notes = str(r.get("notes", "") or "").rstrip()
        if not status_text and notes:
            fixes.append(Fix(row_name=name, field="status_text", before="", after="(from notes)", note=f"{src}: status_text empty, filled from notes"))
            status_text = notes

        links = split_links(r.get("links", ""))

        comp = {
            "id": stable_id(name, reg),
            "name": name,
            "registration_deadline_at": reg,
            "submission_deadline_at": sub,
            "result_deadline_at": res,
            "included_in_plan": included,
            "registered": registered,
            "status_text": status_text,
            "team_members": [],
            "links": links,
            "_source": src,
        }

        cid = comp["id"]
        if cid in out_by_id:
            conflicts.append(Conflict(id=cid, name=name, note=f"merged duplicate id from {src}"))
            out_by_id[cid] = merge_competitions(out_by_id[cid], comp)
        else:
            out_by_id[cid] = comp

    rows = list(out_by_id.values())
    rows.sort(key=lambda x: (x["registration_deadline_at"], x["name"]))

    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "inputs": {
            "active_csv": str(active_csv) if active_csv.exists() else None,
            "archive_csv": str(archive_csv) if archive_csv.exists() else None,
            "raw_rows": len(raw_rows),
        },
        "outputs": {"competitions": len(rows)},
        "fixes": [fix.__dict__ for fix in fixes],
        "skips": [skip.__dict__ for skip in skips],
        "conflicts": [c.__dict__ for c in conflicts],
    }

    # Remove internal _source before export
    for r in rows:
        r.pop("_source", None)
    return rows, report


def write_seed_json(rows: List[Dict[str, Any]], out_json: Path) -> None:
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def write_seed_sql(rows: List[Dict[str, Any]], out_sql: Path) -> None:
    lines: List[str] = []
    lines.append("-- Auto-generated. Do not hand-edit.\n")
    lines.append("INSERT OR IGNORE INTO competitions (\n")
    lines.append("  id,\n")
    lines.append("  name,\n")
    lines.append("  registration_deadline_at,\n")
    lines.append("  submission_deadline_at,\n")
    lines.append("  result_deadline_at,\n")
    lines.append("  included_in_plan,\n")
    lines.append("  registered,\n")
    lines.append("  status_text,\n")
    lines.append("  team_members,\n")
    lines.append("  links\n")
    lines.append(") VALUES\n")

    values: List[str] = []
    for r in rows:
        values.append(
            "("
            + ", ".join(
                [
                    sql_escape(r["id"]),
                    sql_escape(r["name"]),
                    sql_escape(r["registration_deadline_at"]),
                    sql_escape(r["submission_deadline_at"]),
                    sql_escape(r["result_deadline_at"]),
                    "1" if r["included_in_plan"] else "0",
                    "1" if r["registered"] else "0",
                    sql_escape(r.get("status_text") or ""),
                    sql_escape(json.dumps(r.get("team_members") or [], ensure_ascii=False)),
                    sql_escape(json.dumps(r.get("links") or [], ensure_ascii=False)),
                ]
            )
            + ")"
        )

    lines.append(",\n".join(values))
    lines.append(";\n")

    out_sql.parent.mkdir(parents=True, exist_ok=True)
    out_sql.write_text("".join(lines), encoding="utf-8")


def write_report(report: Dict[str, Any], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    rows, report = build_rows(repo)

    out_json = repo / "public" / "data" / "competitions.seed.json"
    out_sql = repo / "db" / "seed_competitions.sql"
    out_report = repo / "reports" / "competitions.import.report.json"

    write_seed_json(rows, out_json)
    write_seed_sql(rows, out_sql)
    write_report(report, out_report)

    print(f"rows={len(rows)}")
    print(f"wrote: {out_json}")
    print(f"wrote: {out_sql}")
    print(f"wrote: {out_report}")


if __name__ == "__main__":
    main()

