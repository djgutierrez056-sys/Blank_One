"""
C2 Perform export — command-line runner.

Usage:
    python export_bot.py                 # both (default)
    python export_bot.py evaluations     # QA evaluations only
    python export_bot.py coachings       # coaching sessions only
    python export_bot.py both            # both, one after the other

Prefer the GUI?  Run:  python dashboard.py

Configuration lives in a git-ignored .env file (see .env.example).
"""

from __future__ import annotations

import sys

import c2perform
from config import Config


def _bar(pct: int, msg: str) -> None:
    filled = int(pct / 5)
    bar = "#" * filled + "-" * (20 - filled)
    print(f"\r[c2export] [{bar}] {pct:3d}%  {msg[:60]:<60}", end="", flush=True)
    if pct >= 100:
        print()


def main(argv: list[str]) -> int:
    arg = (argv[1].lower() if len(argv) > 1 else "both")
    tasks = {
        "evaluations": ["evaluations"],
        "coachings": ["coachings"],
        "both": ["evaluations", "coachings"],
    }.get(arg)
    if tasks is None:
        print("Usage: python export_bot.py [evaluations|coachings|both]")
        return 2

    cfg = Config()
    try:
        saved = c2perform.run(cfg, tasks, _bar)
    except Exception as exc:
        print(f"\n[c2export] ERROR: {exc}")
        return 1

    print("[c2export] Done. Saved:")
    for path in saved:
        print(f"   {path.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
