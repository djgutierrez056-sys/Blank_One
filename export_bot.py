"""
C2 Perform QA Export automation.

Automates the exact flow a human does on https://app.c2perform.com/qa_export.php:

    1. Log in (session is cached so you only log in once).
    2. Open the QA Export page.
    3. Choose a form in "Form Name" (default: NEW GA).
    4. Set the Evaluation Date range to Custom Range (default: Jan 1 -> today).
    5. Click Search.
    6. Tick the "select all" checkbox in the results header (behind "Form No.").
    7. Click Export, choose a layout (default: Attribute Information), and
       download the resulting file.

Run it with:   python export_bot.py
Configure it in a git-ignored .env file (see .env.example).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from playwright.sync_api import (
    Page,
    TimeoutError as PWTimeoutError,
    sync_playwright,
)

from config import BASE_URL, EXPORT_URL, Config

# Cached login session. Git-ignored. Delete it to force a fresh login.
AUTH_STATE_FILE = Path("auth_state.json")

# Chromium shipped with the environment; fall back to Playwright's own copy.
_ENV_CHROMIUM = os.getenv("C2_CHROMIUM_PATH", "").strip()


def log(msg: str) -> None:
    print(f"[c2export] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def is_logged_in(page: Page) -> bool:
    """We consider the session valid if the export page shows its search form
    rather than bouncing us to a login screen."""
    try:
        page.goto(EXPORT_URL, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        return False
    return page.locator("#form_name").count() > 0


def login(page: Page, cfg: Config) -> None:
    """Fill in and submit the C2 Perform login form.

    Selectors are kept deliberately broad because the login markup is not part
    of the captured flow; this covers the usual email/password layouts.
    """
    log("Logging in...")
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)

    password = page.locator("input[type='password']").first
    try:
        password.wait_for(state="visible", timeout=20_000)
    except PWTimeoutError:
        # Already authenticated (redirected straight into the app), or the
        # login page looks unusual and needs a manual hand.
        if page.locator("#form_name, input[type='password']").count() == 0:
            log(
                "Could not find a login form automatically. If a browser window "
                "is open, log in manually now; the session will be saved."
            )
        return

    email = page.locator(
        "input[type='email'], input[name='email'], input[name='username'], "
        "input[id='email'], input[id='username']"
    ).first
    if email.count():
        email.fill(cfg.email)
    password.fill(cfg.password)

    # Submit via the login button if we can find one, else press Enter.
    button = page.locator(
        "button[type='submit'], input[type='submit'], button:has-text('Log in'), "
        "button:has-text('Login'), button:has-text('Sign in')"
    ).first
    if button.count():
        button.click()
    else:
        password.press("Enter")

    page.wait_for_load_state("networkidle", timeout=60_000)
    log("Login submitted.")


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def run_search(page: Page, cfg: Config) -> None:
    log(f"Opening QA Export page and selecting form '{cfg.form_name}'...")
    page.goto(EXPORT_URL, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_selector("#form_name", timeout=30_000)

    # 1) Form Name (a "chosen" multiselect over the hidden <select id=form_name>).
    #    Selecting on the underlying <select> and refreshing chosen is the most
    #    reliable way to drive this widget.
    page.select_option("#form_name", label=cfg.form_name)
    page.evaluate(
        "() => { if (window.jQuery) { jQuery('#form_name')"
        ".trigger('chosen:updated').trigger('change'); } }"
    )

    # 2) Evaluation Date -> Custom Range, then fill start/end dates.
    page.select_option("#daterage", label="Custom Range")
    page.evaluate(
        "() => { if (window.jQuery) { jQuery('#daterage').trigger('change'); } }"
    )
    _set_date(page, "#sdate", cfg.start_date)
    _set_date(page, "#edate", cfg.end_date)

    log(f"Searching evaluations from {cfg.start_date} to {cfg.end_date}...")

    # 3) Click Search and wait for the results table to render.
    page.click("input[name='search']")
    page.wait_for_load_state("domcontentloaded", timeout=60_000)
    page.wait_for_selector("#exportForm", timeout=60_000)


def _set_date(page: Page, selector: str, value: str) -> None:
    """Set a datepicker-backed text input, bypassing the calendar widget."""
    page.eval_on_selector(
        selector,
        """(el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        value,
    )


# ---------------------------------------------------------------------------
# Select all + export
# ---------------------------------------------------------------------------

def select_all_rows(page: Page) -> int:
    """Tick the header 'select all' checkbox (the one behind 'Form No.') and
    make sure every row checkbox is actually checked for submission."""
    count = page.locator("input.case").count()
    if count == 0:
        return 0

    # Click the header checkbox the way a user would...
    header = page.locator("#select")
    if header.count():
        header.check()

    # ...then guarantee each row checkbox is checked (the page's legacy jQuery
    # handler uses .attr('checked', ...), which doesn't always set the property
    # that decides what gets submitted).
    page.eval_on_selector_all(
        "input.case",
        "els => els.forEach(e => { e.checked = true; })",
    )
    return count


def export_download(page: Page, cfg: Config) -> Path:
    log(f"Exporting as '{cfg.export_type}'...")

    # Open the export modal.
    page.click("#export-members")

    # The layout radios have ids Authoriti (basic), Authoriti1 (expanded),
    # Authoriti2 (attribute). Map export_type -> the radio value and click the
    # matching input, which sets #export_type and submits #exportForm.
    radio = page.locator(f"input.Authoriti[value='{cfg.export_type}']").first
    radio.wait_for(state="attached", timeout=15_000)

    with page.expect_download(timeout=120_000) as dl_info:
        # Prefer clicking the visible radio; fall back to submitting directly.
        try:
            radio.click()
        except Exception:
            page.evaluate(
                """(t) => {
                    document.getElementById('export_type').value = t;
                    document.getElementById('exportForm').submit();
                }""",
                cfg.export_type,
            )
    download = dl_info.value

    out_dir = Path(cfg.download_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    suggested = download.suggested_filename or "c2perform_export"
    dest = out_dir / suggested
    download.save_as(str(dest))
    return dest


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    cfg = Config()
    cfg.validate()

    with sync_playwright() as p:
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
            if not is_logged_in(page):
                login(page, cfg)
                if not is_logged_in(page):
                    log("Login did not succeed. Check your credentials in .env.")
                    return 1
            # Persist the session so future runs skip the login step.
            context.storage_state(path=str(AUTH_STATE_FILE))

            run_search(page, cfg)
            rows = select_all_rows(page)
            if rows == 0:
                log("No evaluations matched the search. Nothing to export.")
                return 1
            log(f"Selected {rows} evaluation(s).")

            dest = export_download(page, cfg)
            log(f"Done. Saved export to: {dest.resolve()}")
            return 0
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    sys.exit(main())
