"""
Core C2 Perform automation shared by the CLI (export_bot.py) and the GUI
dashboard (dashboard.py).

Two exports are supported:

* Evaluations  -> qa_export.php  (form + custom date range -> Attribute
  Information layout -> download)
* Coachings    -> coaching/coach/coachings.php  (custom date range -> Excel
  export of the results DataTable)

Every long-running call takes a ``progress`` callback so the GUI can drive a
progress bar. The callback signature is ``progress(percent: int, message: str)``.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable, List, Sequence

from playwright.sync_api import (
    Page,
    TimeoutError as PWTimeoutError,
    sync_playwright,
)

from config import BASE_URL, EXPORT_URL, Config

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

COACHINGS_URL = f"{BASE_URL}/coaching/coach/coachings.php"

# Cached login session (git-ignored). Delete it to force a fresh login.
AUTH_STATE_FILE = Path("auth_state.json")

# Chromium override, if the environment ships its own build.
_ENV_CHROMIUM = os.getenv("C2_CHROMIUM_PATH", "").strip()

# A progress reporter: progress(percent 0-100, human message).
ProgressFn = Callable[[int, str], None]


def _noop(_pct: int, _msg: str) -> None:
    pass


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def _is_logged_in(page: Page) -> bool:
    """Session is valid if the export page shows its search form instead of
    bouncing us to the login screen."""
    try:
        page.goto(EXPORT_URL, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        return False
    return page.locator("#form_name").count() > 0


def _login(page: Page, cfg: Config) -> None:
    """Fill and submit the C2 Perform login form.

    The login uses a username (e.g. "Jonathan.Gutierrez"), not an email, so we
    target the first visible non-password input rather than guessing a name.
    """
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)

    password = page.locator("input[type='password']").first
    try:
        password.wait_for(state="visible", timeout=20_000)
    except PWTimeoutError:
        return  # already authenticated, or an unusual login page

    username = page.locator(
        "input[type='email'], input[name='email'], input[name='username'], "
        "input[id='email'], input[id='username'], input[name='user'], "
        "input[type='text']:visible, "
        "input:not([type='password']):not([type='hidden']):not([type='submit'])"
        ":not([type='button']):not([type='checkbox']):visible"
    ).first
    if username.count():
        username.fill(cfg.username)
    password.fill(cfg.password)

    button = page.locator(
        "button[type='submit'], input[type='submit'], button:has-text('Log in'), "
        "button:has-text('Login'), button:has-text('Sign in')"
    ).first
    if button.count():
        button.click()
    else:
        password.press("Enter")
    page.wait_for_load_state("networkidle", timeout=60_000)


def _ensure_logged_in(page: Page, cfg: Config, progress: ProgressFn) -> None:
    progress(10, "Checking session...")
    if _is_logged_in(page):
        return
    progress(15, "Logging in...")
    _login(page, cfg)
    if not _is_logged_in(page):
        raise RuntimeError(
            "Login failed. Check C2_USERNAME / C2_PASSWORD in .env "
            "(or delete auth_state.json and retry)."
        )


# ---------------------------------------------------------------------------
# Evaluations export (qa_export.php)
# ---------------------------------------------------------------------------

def _set_date(page: Page, selector: str, value: str) -> None:
    page.eval_on_selector(
        selector,
        """(el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        value,
    )


def export_evaluations(page: Page, cfg: Config, progress: ProgressFn = _noop) -> Path:
    progress(30, f"Opening QA Export, selecting form '{cfg.form_name}'...")
    page.goto(EXPORT_URL, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_selector("#form_name", timeout=30_000)

    # Form Name (chosen multiselect over the hidden <select>).
    page.select_option("#form_name", label=cfg.form_name)
    page.evaluate(
        "() => { if (window.jQuery) { jQuery('#form_name')"
        ".trigger('chosen:updated').trigger('change'); } }"
    )

    # Evaluation Date -> Custom Range + start/end.
    page.select_option("#daterage", label="Custom Range")
    page.evaluate("() => { if (window.jQuery) { jQuery('#daterage').trigger('change'); } }")
    _set_date(page, "#sdate", cfg.start_date)
    _set_date(page, "#edate", cfg.end_date)

    progress(50, f"Searching {cfg.start_date} to {cfg.end_date}...")
    page.click("input[name='search']")
    page.wait_for_load_state("domcontentloaded", timeout=60_000)
    page.wait_for_selector("#exportForm", timeout=60_000)

    rows = page.locator("input.case").count()
    if rows == 0:
        raise RuntimeError("No evaluations matched the search. Nothing to export.")
    progress(70, f"Selecting all {rows} evaluation(s)...")

    header = page.locator("#select")
    if header.count():
        header.check()
    page.eval_on_selector_all("input.case", "els => els.forEach(e => { e.checked = true; })")

    progress(85, f"Exporting as '{cfg.export_type}'...")
    page.click("#export-members")
    page.wait_for_selector(
        f"input.Authoriti[value='{cfg.export_type}']", state="attached", timeout=15_000
    )
    with page.expect_download(timeout=120_000) as dl_info:
        page.evaluate(
            """(t) => {
                document.getElementById('export_type').value = t;
                var f = document.getElementById('exportForm');
                if (f.requestSubmit) { f.requestSubmit(); } else { f.submit(); }
            }""",
            cfg.export_type,
        )
    dest = _save_download(dl_info.value, cfg, "evaluations")
    progress(100, f"Saved: {dest.name}")
    return dest


# ---------------------------------------------------------------------------
# Coachings export (coaching/coach/coachings.php)
# ---------------------------------------------------------------------------

def export_coachings(page: Page, cfg: Config, progress: ProgressFn = _noop) -> Path:
    progress(30, "Opening Coaching Sessions...")
    page.goto(COACHINGS_URL, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_selector("#coachingTbl", timeout=30_000)
    # Let the table's first (default) load settle so its DataTable exists.
    page.wait_for_selector(".buttons-excel", timeout=30_000)

    progress(50, f"Filtering {cfg.start_date} to {cfg.end_date}...")
    # Switch to a custom date range, set the litepicker inputs, and ask the
    # page's own loader to reload the client-side DataTable with those dates.
    with page.expect_response(
        lambda r: "coaching_sessions.php" in r.url and "daterange=custom" in r.url,
        timeout=90_000,
    ):
        page.evaluate(
            """([frm, to]) => {
                var custom = document.getElementById('dr10');
                if (custom) { custom.checked = true; }
                var f = document.getElementById('custom_daterange_from');
                var t = document.getElementById('custom_daterange_to');
                if (f) { f.value = frm; }
                if (t) { t.value = to; }
                if (typeof load_table === 'function') { load_table('Main'); }
            }""",
            [cfg.start_date, cfg.end_date],
        )

    # Wait for the DataTable to finish drawing the fetched rows.
    progress(70, "Loading coaching sessions...")
    try:
        page.wait_for_function(
            "() => document.querySelectorAll('#coachingTbl tbody tr').length > 0",
            timeout=60_000,
        )
    except PWTimeoutError:
        pass  # possibly zero results in range; export whatever is there

    total = page.locator("#coachingTbl tbody tr").count()
    progress(85, f"Exporting coaching sessions ({total} shown per page)...")

    with page.expect_download(timeout=120_000) as dl_info:
        page.click(".buttons-excel")
    dest = _save_download(dl_info.value, cfg, "coachings")
    progress(100, f"Saved: {dest.name}")
    return dest


# ---------------------------------------------------------------------------
# Shared helpers / orchestration
# ---------------------------------------------------------------------------

def _save_download(download, cfg: Config, prefix: str) -> Path:
    out_dir = Path(cfg.download_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    suggested = download.suggested_filename or f"c2perform_{prefix}"
    # Prefix so evaluations and coachings never overwrite each other.
    name = suggested if suggested.startswith(prefix) else f"{prefix}_{suggested}"
    dest = out_dir / name
    download.save_as(str(dest))
    return dest


TASKS = {
    "evaluations": export_evaluations,
    "coachings": export_coachings,
}


def run(
    cfg: Config,
    tasks: Sequence[str],
    progress: ProgressFn = _noop,
) -> List[Path]:
    """Launch a browser, log in once, and run the requested export tasks.

    ``tasks`` is any subset of TASKS keys, run in order. Returns the saved file
    paths. ``progress`` is called with an overall 0-100 percentage.
    """
    cfg.validate()
    unknown = [t for t in tasks if t not in TASKS]
    if unknown:
        raise ValueError(f"Unknown task(s): {', '.join(unknown)}")

    saved: List[Path] = []

    with sync_playwright() as p:
        progress(3, "Starting browser...")
        launch_kwargs = {"headless": cfg.headless}
        if _ENV_CHROMIUM:
            launch_kwargs["executable_path"] = _ENV_CHROMIUM
        browser = p.chromium.launch(**launch_kwargs)

        context_kwargs = {"accept_downloads": True}
        if AUTH_STATE_FILE.exists():
            context_kwargs["storage_state"] = str(AUTH_STATE_FILE)
        context = browser.new_context(**context_kwargs)
        page = context.new_page()

        try:
            _ensure_logged_in(page, cfg, progress)
            context.storage_state(path=str(AUTH_STATE_FILE))

            for task in tasks:
                # Report each task's own 0-100 progress, tagged with the task
                # name so the dashboard can drive that task's progress bar.
                def sub(pct: int, msg: str, _t=task) -> None:
                    progress(pct, f"[{_t}] {msg}")

                dest = TASKS[task](page, cfg, sub)
                saved.append(dest)

            progress(100, "Done.")
            return saved
        finally:
            context.close()
            browser.close()
