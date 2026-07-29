"""Configuration loader for the C2 Perform export bot.

Reads settings from a git-ignored ``.env`` file (see ``.env.example``) so that
credentials never end up in version control.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date

from dotenv import load_dotenv

# Load variables from a local .env file if present. Real environment variables
# always take precedence over values in the file.
load_dotenv()

BASE_URL = "https://app.c2perform.com"
EXPORT_URL = f"{BASE_URL}/qa_export.php"

# Valid values for the export "layout" radio buttons on the export modal.
VALID_EXPORT_TYPES = {
    "basic_information",
    "basic_information_expanded",
    "attribute_information",
}


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _default_start_date() -> str:
    """January 1st of the current year, in mm/dd/yyyy."""
    return f"01/01/{date.today().year}"


def _default_end_date() -> str:
    """Today, in mm/dd/yyyy."""
    return date.today().strftime("%m/%d/%Y")


@dataclass
class Config:
    # Login uses a C2 Perform username (e.g. "Jonathan.Gutierrez").
    # C2_EMAIL is accepted too, for backwards compatibility.
    username: str = field(
        default_factory=lambda: _env("C2_USERNAME") or _env("C2_EMAIL")
    )
    password: str = field(default_factory=lambda: _env("C2_PASSWORD"))

    form_name: str = field(default_factory=lambda: _env("C2_FORM_NAME", "NEW GA"))
    export_type: str = field(
        default_factory=lambda: _env("C2_EXPORT_TYPE", "attribute_information")
    )

    start_date: str = field(
        default_factory=lambda: _env("C2_START_DATE") or _default_start_date()
    )
    end_date: str = field(
        default_factory=lambda: _env("C2_END_DATE") or _default_end_date()
    )

    # Coaching export detail level:
    #   "detailed" -> open each session's view and scrape every field (slower)
    #   "summary"  -> the site's quick Excel button (6 columns, fast)
    coaching_mode: str = field(
        default_factory=lambda: _env("C2_COACHING_MODE", "detailed").lower()
    )
    # Cap how many coaching sessions to scrape in detailed mode (0 = all).
    # Handy for a quick test run.
    coaching_limit: int = field(
        default_factory=lambda: int(_env("C2_COACHING_LIMIT", "0") or "0")
    )
    # Acceptance statuses to skip in detailed mode (comma-separated, case-
    # insensitive) -- e.g. "Draft" or "Draft,Notes Only". Empty = keep all.
    coaching_skip_status: frozenset = field(
        default_factory=lambda: frozenset(
            s.strip().lower()
            # os.getenv (not _env) so an explicit empty value clears the list;
            # only an absent variable falls back to the "Draft" default.
            for s in os.getenv("C2_COACHING_SKIP_STATUS", "Draft").split(",")
            if s.strip()
        )
    )

    headless: bool = field(
        default_factory=lambda: _env("C2_HEADLESS", "false").lower()
        in ("1", "true", "yes")
    )
    download_dir: str = field(
        default_factory=lambda: _env("C2_DOWNLOAD_DIR", "downloads")
    )

    def validate(self) -> None:
        if not self.username or not self.password:
            raise SystemExit(
                "Missing credentials. Copy .env.example to .env and set "
                "C2_USERNAME and C2_PASSWORD."
            )
        if self.export_type not in VALID_EXPORT_TYPES:
            raise SystemExit(
                f"C2_EXPORT_TYPE '{self.export_type}' is invalid. "
                f"Choose one of: {', '.join(sorted(VALID_EXPORT_TYPES))}."
            )
