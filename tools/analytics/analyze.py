#!/usr/bin/env python3
"""Ministry Hub data pipeline: clean a Firestore export, then analyze it.

Loads the per-user key/value lists exported from Firestore
(/users/{uid}/kv/<key> -> array of records), normalizes the messy bits
(legacy 0/1 integer booleans, the legacy single-verse fields vs. the newer
`verses` array, ISO-8601 date strings), and writes a Markdown report plus
PNG charts.

Usage:
    python analyze.py --input export.json --out report
    python analyze.py --sample            # generate demo data, then run
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # headless: render straight to PNG
import matplotlib.pyplot as plt
import pandas as pd


# ── loading ──────────────────────────────────────────────────────────────
# A Ministry Hub export is a dict of { "<kv-key>": [ {record}, ... ] }.
# Real Firestore console exports wrap this under users/{uid}/kv — load_export
# digs the kv map out of whichever shape it finds so the same tool works on
# both an app dump and a console export.
KV_KEYS = ("journal-entries", "prayer-requests", "songs", "setlists", "friends")


def load_export(path: Path) -> dict[str, list[dict]]:
    raw = json.loads(path.read_text())
    # Console export: {"users": {"<uid>": {"kv": {<key>: [...]}}}}
    if "users" in raw:
        uid = next(iter(raw["users"]))
        kv = raw["users"][uid].get("kv", {})
    elif "kv" in raw:
        kv = raw["kv"]
    else:
        kv = raw  # already a flat {key: [...]} dump
    return {k: list(kv.get(k, [])) for k in KV_KEYS}


# ── cleaning ─────────────────────────────────────────────────────────────
def as_bool(v) -> bool:
    """Legacy fields store booleans as the ints 0/1; new ones use real bools."""
    return bool(int(v)) if isinstance(v, (int, float, str)) and str(v).isdigit() else bool(v)


def parse_dt(s):
    if not s:
        return pd.NaT
    try:
        return pd.to_datetime(s, utc=True)
    except (ValueError, TypeError):
        return pd.NaT


def verse_count(p: dict) -> int:
    """Reconcile the legacy single-verse fields with the newer verses[] list."""
    if isinstance(p.get("verses"), list) and p["verses"]:
        return len(p["verses"])
    return 1 if (p.get("scripture") or p.get("verse_text")) else 0


def clean(data: dict[str, list[dict]]) -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}

    journal = pd.DataFrame(data["journal-entries"])
    if not journal.empty:
        journal["created_at"] = journal["created_at"].apply(parse_dt)
        journal["mood"] = journal["mood"].fillna("unspecified").str.strip().str.lower()
        journal = journal.dropna(subset=["created_at"]).drop_duplicates("id")
    frames["journal"] = journal

    prayers = pd.DataFrame(data["prayer-requests"])
    if not prayers.empty:
        prayers["created_at"] = prayers["created_at"].apply(parse_dt)
        prayers["is_urgent"] = prayers["is_urgent"].apply(as_bool)
        prayers["is_daily"] = prayers.get("is_daily", 0)
        prayers["is_daily"] = prayers["is_daily"].apply(as_bool)
        prayers["status"] = prayers["status"].fillna("praying").str.strip().str.lower()
        prayers["n_verses"] = prayers.apply(verse_count, axis=1)
        prayers["n_updates"] = prayers["updates"].apply(
            lambda u: len(u) if isinstance(u, list) else 0
        )
        prayers = prayers.drop_duplicates("id")
    frames["prayers"] = prayers

    songs = pd.DataFrame(data["songs"])
    if not songs.empty:
        songs["created_at"] = songs["created_at"].apply(parse_dt)
        songs["status"] = songs["status"].fillna("idea").str.strip().str.lower()
        songs["song_key"] = songs["song_key"].replace("", "—").fillna("—")
        songs["tempo"] = pd.to_numeric(songs["tempo"], errors="coerce")
        songs["n_recordings"] = songs["recordings"].apply(
            lambda r: len(r) if isinstance(r, list) else 0
        )
        songs = songs.drop_duplicates("id")
    frames["songs"] = songs

    friends = pd.DataFrame(data["friends"])
    if not friends.empty:
        friends["last_contacted"] = friends["last_contacted"].apply(parse_dt)
        friends["communication_frequency"] = (
            friends["communication_frequency"].fillna("weekly").str.lower()
        )
    frames["friends"] = friends

    return frames


# ── analysis + report ────────────────────────────────────────────────────
FREQ_DAYS = {"daily": 1, "weekly": 7, "biweekly": 14, "monthly": 30}


def build_report(frames: dict[str, pd.DataFrame], out: Path) -> str:
    out.mkdir(parents=True, exist_ok=True)
    lines: list[str] = ["# Ministry Hub — Data Report", ""]
    now = pd.Timestamp.now(tz="UTC")

    j = frames["journal"]
    lines.append("## Journal")
    if j.empty:
        lines.append("_No entries._")
    else:
        span = (j["created_at"].max() - j["created_at"].min()).days or 1
        lines += [
            f"- **{len(j)}** entries over **{span}** days "
            f"(~{len(j)/max(span/7,1):.1f}/week)",
            f"- Top moods: "
            + ", ".join(f"{m} ({n})" for m, n in j["mood"].value_counts().head(3).items()),
        ]
        # entries per month
        per_month = j.set_index("created_at").resample("ME").size()
        ax = per_month.plot(kind="line", marker="o", title="Journal entries per month")
        ax.set_ylabel("entries"); ax.set_xlabel("")
        plt.tight_layout(); plt.savefig(out / "journal_per_month.png", dpi=120); plt.close()
        # mood distribution
        ax = j["mood"].value_counts().plot(kind="bar", title="Journal mood distribution")
        ax.set_ylabel("entries"); ax.set_xlabel("")
        plt.tight_layout(); plt.savefig(out / "journal_moods.png", dpi=120); plt.close()
        lines.append("- Charts: `journal_per_month.png`, `journal_moods.png`")
    lines.append("")

    p = frames["prayers"]
    lines.append("## Prayers")
    if p.empty:
        lines.append("_No prayers._")
    else:
        answered = (p["status"] == "answered").sum()
        lines += [
            f"- **{len(p)}** requests — **{answered}** answered "
            f"({answered/len(p)*100:.0f}%), **{p['is_urgent'].sum()}** urgent",
            f"- Avg **{p['n_updates'].mean():.1f}** updates and "
            f"**{p['n_verses'].mean():.1f}** scripture refs per request",
        ]
        ax = p["status"].value_counts().plot(kind="bar", title="Prayer status")
        ax.set_ylabel("requests"); ax.set_xlabel("")
        plt.tight_layout(); plt.savefig(out / "prayer_status.png", dpi=120); plt.close()
        lines.append("- Chart: `prayer_status.png`")
    lines.append("")

    s = frames["songs"]
    lines.append("## Songs")
    if s.empty:
        lines.append("_No songs._")
    else:
        tempos = s["tempo"].dropna()
        lines += [
            f"- **{len(s)}** songs — {(s['status']=='idea').sum()} ideas, "
            f"{s['n_recordings'].sum()} recordings total",
            f"- Median tempo **{tempos.median():.0f} BPM**"
            if not tempos.empty else "- No tempos recorded",
            f"- Keys in use: "
            + ", ".join(f"{k} ({n})" for k, n in s["song_key"].value_counts().head(5).items()),
        ]
        ax = s["status"].value_counts().plot(kind="bar", title="Songs by status")
        ax.set_ylabel("songs"); ax.set_xlabel("")
        plt.tight_layout(); plt.savefig(out / "song_status.png", dpi=120); plt.close()
        lines.append("- Chart: `song_status.png`")
    lines.append("")

    f = frames["friends"]
    lines.append("## Friends — reach-out cadence")
    if f.empty:
        lines.append("_No friends._")
    else:
        f = f.copy()
        f["due_days"] = f["communication_frequency"].map(FREQ_DAYS).fillna(7)
        f["days_since"] = (now - f["last_contacted"]).dt.days
        overdue = f[(f["days_since"].notna()) & (f["days_since"] > f["due_days"])]
        lines.append(f"- **{len(f)}** friends — **{len(overdue)}** overdue for a check-in")
        for _, r in overdue.sort_values("days_since", ascending=False).head(5).iterrows():
            lines.append(
                f"  - {r['name']}: {int(r['days_since'])}d since contact "
                f"(target every {int(r['due_days'])}d)"
            )
    lines.append("")

    report = "\n".join(lines)
    (out / "report.md").write_text(report)
    return report


# ── sample data (real schemas) ───────────────────────────────────────────
def sample_export() -> dict[str, list[dict]]:
    random.seed(7)
    base = datetime(2026, 1, 1)
    moods = ["peaceful", "Grateful", "anxious", "joyful", "  Reflective "]

    journal = [
        {
            "id": f"j{i}",
            "title": f"Entry {i}",
            "content": "…",
            "mood": random.choice(moods),
            "created_at": (base + timedelta(days=i * 3)).isoformat() + "Z",
        }
        for i in range(40)
    ]
    journal.append(dict(journal[0]))  # duplicate id -> exercises dedupe
    journal.append({"id": "jbad", "title": "x", "mood": "", "created_at": ""})  # bad row

    prayers = []
    for i in range(18):
        legacy = i % 3 == 0
        prayers.append({
            "id": f"pr{i}",
            "title": f"Prayer {i}",
            "category": random.choice(["General", "Family", "Healing"]),
            "status": random.choice(["praying", "praying", "answered"]),
            "is_urgent": random.choice([0, 1]),          # legacy int bool
            "is_daily": random.choice([0, 1]),
            "scripture": "Phil 4:6" if legacy else None,  # legacy single verse
            "verse_text": "Do not be anxious…" if legacy else "",
            "verses": [] if legacy else [{"ref": "Ps 23", "text": "…"}],
            "updates": [{"text": "u"}] * random.randint(0, 4),
            "created_at": (base + timedelta(days=i * 5)).isoformat() + "Z",
        })

    songs = [
        {
            "id": f"s{i}",
            "title": f"Song {i}",
            "song_key": random.choice(["C", "G", "D", "", "A"]),
            "tempo": random.choice([72, 88, 120, None, 140]),
            "status": random.choice(["idea", "demo", "finished"]),
            "recordings": [{"id": "r"}] * random.randint(0, 3),
            "created_at": (base + timedelta(days=i * 7)).isoformat() + "Z",
        }
        for i in range(15)
    ]

    friends = [
        {
            "id": f"f{i}",
            "name": n,
            "communication_frequency": freq,
            "last_contacted": (datetime(2026, 6, 1) - timedelta(days=d)).isoformat() + "Z",
        }
        for i, (n, freq, d) in enumerate([
            ("Sarah", "weekly", 3), ("Tom", "weekly", 21), ("Mom", "daily", 5),
            ("Pastor Lee", "monthly", 40), ("Maya", "biweekly", 30),
        ])
    ]

    return {
        "journal-entries": journal,
        "prayer-requests": prayers,
        "songs": songs,
        "setlists": [],
        "friends": friends,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Clean + analyze a Ministry Hub export.")
    ap.add_argument("--input", type=Path, help="Path to exported JSON")
    ap.add_argument("--sample", action="store_true", help="Use generated demo data")
    ap.add_argument("--out", type=Path, default=Path("report"), help="Output dir")
    args = ap.parse_args()

    if args.sample or not args.input:
        data = sample_export()
        print("Using generated sample data (real schemas).")
    else:
        data = load_export(args.input)
        print(f"Loaded export: {args.input}")

    frames = clean(data)
    report = build_report(frames, args.out)
    print(report)
    print(f"\nWrote report + charts to {args.out.resolve()}/")


if __name__ == "__main__":
    main()
