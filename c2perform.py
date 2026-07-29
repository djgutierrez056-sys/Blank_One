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

import csv
import html as html_module
import os
import re
from datetime import datetime
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

AGENT_AJAX_URL = f"{BASE_URL}/coaching/coach/ajax/agent-ajax.php"

# Preferred leading column order for the detailed coaching CSV. Any extra
# fields discovered in a form are appended after these, in first-seen order.
_COACHING_COLUMNS = [
    "Coaching ID", "Form", "Company", "Coach", "Supervisor", "Session ID",
    "Acceptance Status", "Follow Up Date", "Employees", "Date of Session",
    "Type", "Account Name", "Coaching Type", "Comments", "Result",
]


def export_coachings(page: Page, cfg: Config, progress: ProgressFn = _noop) -> Path:
    """Dispatch to the detailed or summary coaching export based on config."""
    if cfg.coaching_mode == "summary":
        return _export_coachings_summary(page, cfg, progress)
    return _export_coachings_detailed(page, cfg, progress)


def _open_and_filter_coachings(page: Page, cfg: Config, progress: ProgressFn) -> int:
    """Open the Coaching Sessions page, apply the custom date range, wait for
    the client-side DataTable to finish loading, and return the row count."""
    progress(20, "Opening Coaching Sessions...")
    page.goto(COACHINGS_URL, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_selector("#coachingTbl", timeout=30_000)
    page.wait_for_selector(".buttons-excel", timeout=30_000)

    progress(35, f"Filtering {cfg.start_date} to {cfg.end_date}...")
    # Switch to a Custom Date Range and set the litepicker inputs, then reload
    # the client-side DataTable for those dates.
    #
    # Two important details learned from the page's own JS:
    #  * The ".daterange" change handler only reveals the date box for custom;
    #    it does NOT reload the table (the page waits for a litepicker pick).
    #  * load_table('Main') is what actually re-fetches with the DOM values. We
    #    trigger it through the "#coach_id" change handler, which is bound in the
    #    page's scope and calls load_table for us -- this works even if
    #    load_table isn't reachable from injected script scope. We still call
    #    load_table directly when it is reachable, as a belt-and-suspenders path.
    with page.expect_response(
        lambda r: "coaching_sessions.php" in r.url and "daterange=custom" in r.url,
        timeout=90_000,
    ):
        page.evaluate(
            """([frm, to]) => {
                var $ = window.jQuery;
                if ($) {
                    $('#dr10').prop('checked', true);
                    $('#custom_date_container').show();
                    $('#custom_daterange_from').val(frm);
                    $('#custom_daterange_to').val(to);
                    if (typeof load_table === 'function') {
                        load_table('Main');
                    } else {
                        // Fire a page-bound handler that calls load_table('Main').
                        $('#coach_id').trigger('change');
                    }
                } else {
                    var c = document.getElementById('dr10');
                    if (c) { c.checked = true; }
                    var f = document.getElementById('custom_daterange_from');
                    var t = document.getElementById('custom_daterange_to');
                    if (f) { f.value = frm; }
                    if (t) { t.value = to; }
                    if (typeof load_table === 'function') { load_table('Main'); }
                }
            }""",
            [cfg.start_date, cfg.end_date],
        )

    # Wait for the table to ACTUALLY load its data. This is a client-side
    # DataTable (sAjaxSource, no serverSide): the server returns every row in
    # one response and DataTables paginates in the browser, so the full dataset
    # lives in the DataTable's internal store -- NOT in the DOM (only ~20 rows
    # are rendered at a time). Checking the DOM would pass instantly and export
    # before the big AJAX load finished, producing a headers-only file.
    #
    # Instead poll the DataTables API until it reports loaded rows and is no
    # longer in its "processing" state.
    progress(70, "Loading coaching sessions (this can take a moment)...")
    try:
        page.wait_for_function(
            """() => {
                try {
                    var $ = window.jQuery;
                    if (!$ || !$.fn || !$.fn.dataTable) { return false; }
                    if (!$.fn.dataTable.isDataTable('#coachingTbl')) { return false; }
                    var dt = $('#coachingTbl').DataTable();
                    var processing = $('#coachingTbl_processing').is(':visible');
                    return dt.rows().count() > 0 && !processing;
                } catch (e) { return false; }
            }""",
            timeout=180_000,
        )
    except PWTimeoutError:
        pass  # possibly zero results in range; export whatever is there

    total = page.evaluate(
        """() => {
            try { return window.jQuery('#coachingTbl').DataTable().rows().count(); }
            catch (e) { return 0; }
        }"""
    )
    return int(total or 0)


def _export_coachings_summary(page: Page, cfg: Config, progress: ProgressFn) -> Path:
    """Fast path: the site's own DataTables Excel button (6 summary columns)."""
    total = _open_and_filter_coachings(page, cfg, progress)
    progress(85, f"Exporting {total} coaching session(s)...")
    # load_table() re-creates the DataTable (destroy:true) and appends a fresh
    # set of export buttons to #buttons without clearing the old ones. Only the
    # most recently added Excel button is bound to the current (custom-date)
    # DataTable, so click the last one.
    with page.expect_download(timeout=120_000) as dl_info:
        page.locator(".buttons-excel").last.click()
    dest = _save_download(dl_info.value, cfg, "coachings")
    progress(100, f"Saved: {dest.name}")
    return dest


def _export_coachings_detailed(page: Page, cfg: Config, progress: ProgressFn) -> Path:
    """Detailed path: open each session's "view" (the eye icon) and scrape every
    field into one CSV. Uses the same AJAX the page uses (agent-ajax.php,
    action=getCoachingFormDetails) fetched in batches from inside the page."""
    total_rows = _open_and_filter_coachings(page, cfg, progress)

    # Pull each row's coaching id + agent id + status. The agent id is embedded
    # in the row's Action HTML: agentViewFunction(<formid>, "view", <agent_id>).
    # The plain status text is the row's hidden field (falls back to the title
    # on the status icon).
    rows_raw = page.evaluate(
        """() => {
            try {
                var dt = window.jQuery('#coachingTbl').DataTable();
                return dt.rows().data().toArray().map(function (r) {
                    var status = r.hiddenfield || '';
                    if (!status) {
                        var m = /title=["']([^"']+)["']/i.exec(r.AcceptanceStatus || '');
                        if (m) { status = m[1]; }
                    }
                    return { coachID: r.coachID, action: r.Action || '', status: status };
                });
            } catch (e) { return []; }
        }"""
    )

    pairs = []
    skipped = 0
    for r in rows_raw:
        status = (r.get("status") or "").strip()
        if status.lower() in cfg.coaching_skip_status:
            skipped += 1
            continue
        m = re.search(
            r"agentViewFunction\(\s*(\d+)\s*,\s*[\"']view[\"']\s*,\s*(\d+)\s*\)",
            r.get("action", ""),
        )
        coach_id = r.get("coachID") or (m.group(1) if m else None)
        agent_id = m.group(2) if m else ""
        if coach_id:
            pairs.append((str(coach_id), str(agent_id)))

    if skipped:
        progress(53, f"Skipped {skipped} ({', '.join(sorted(cfg.coaching_skip_status))}).")
    if cfg.coaching_limit and cfg.coaching_limit > 0:
        pairs = pairs[: cfg.coaching_limit]
    if not pairs:
        raise RuntimeError("No coaching sessions found for the selected range.")

    total = len(pairs)
    parsed: List[dict] = []
    batch_size = 12
    for start in range(0, total, batch_size):
        batch = pairs[start : start + batch_size]
        htmls = page.evaluate(
            """async ([items, url]) => {
                return await Promise.all(items.map(async function (it) {
                    try {
                        var body = new URLSearchParams({
                            actiontype: 'view',
                            formid: String(it[0]),
                            agent_id: String(it[1]),
                            action: 'getCoachingFormDetails'
                        });
                        var resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'X-Requested-With': 'XMLHttpRequest'
                            },
                            body: body.toString(),
                            credentials: 'same-origin'
                        });
                        return await resp.text();
                    } catch (e) { return ''; }
                }));
            }""",
            [batch, AGENT_AJAX_URL],
        )
        for (coach_id, _agent_id), html in zip(batch, htmls):
            parsed.append(_parse_coaching_detail(html or "", coach_id))

        done = min(start + batch_size, total)
        progress(55 + int(done / total * 40), f"Fetched {done} of {total} details...")

    progress(96, "Writing spreadsheet...")
    dest = _save_rows_csv(parsed, cfg, "coachings_detailed")
    progress(100, f"Saved: {dest.name}")
    return dest


# ---------------------------------------------------------------------------
# Coaching detail parsing + CSV output
# ---------------------------------------------------------------------------

def _strip_tags(s: str) -> str:
    s = re.sub(r"(?is)<br\s*/?>", " ", s)
    s = re.sub(r"(?is)</p>\s*<p>", " | ", s)
    s = re.sub(r"(?is)<[^>]+>", "", s)
    s = html_module.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def _parse_coaching_detail(html: str, coach_id: str) -> dict:
    """Parse the detail HTML fragment returned by getCoachingFormDetails into a
    flat {field: value} dict. Handles the fixed 'Form Details' table, the
    employee list, and the variable 'sm-title' sections that differ per form."""
    row: dict = {"Coaching ID": str(coach_id)}

    m = re.search(r"(?is)action-plan-header-lg[^>]*>(.*?)</div>", html)
    if m:
        row["Form"] = _strip_tags(m.group(1))

    mt = re.search(
        r'(?is)<table[^>]*class="[^"]*form-details[^"]*"[^>]*>(.*?)</table>', html
    )
    if mt:
        for th, td in re.findall(r"(?is)<th>(.*?)</th>\s*<td>(.*?)</td>", mt.group(1)):
            key = _strip_tags(th)
            if key:
                row[key] = _strip_tags(td)

    me = re.search(
        r'(?is)<ul[^>]*class="[^"]*assigned-users[^"]*"[^>]*>(.*?)</ul>', html
    )
    if me:
        names = [_strip_tags(x) for x in re.findall(r"(?is)<h6>(.*?)</h6>", me.group(1))]
        row["Employees"] = "; ".join(n for n in names if n)

    # Variable sections: each <h6 class="sm-title">Heading</h6> then its value.
    parts = re.split(r'(?is)<h6[^>]*class="[^"]*sm-title[^"]*"[^>]*>(.*?)</h6>', html)
    for i in range(1, len(parts), 2):
        title = _strip_tags(parts[i])
        body = parts[i + 1] if i + 1 < len(parts) else ""
        body = re.split(r"(?is)Back to Dashboard|customTableLoader", body)[0]
        ps = re.findall(r"(?is)<p>(.*?)</p>", body)
        if ps:
            val = " | ".join(v for v in (_strip_tags(p) for p in ps) if v)
        else:
            val = _strip_tags(body)
        if title and val.startswith(title + " "):
            val = val[len(title) + 1 :]
        if title and title not in ("Form Details", "Employees"):
            row[title] = val
    return row


def _save_rows_csv(rows: List[dict], cfg: Config, prefix: str) -> Path:
    out_dir = Path(cfg.download_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Column order: the preferred leading columns first, then any extra fields
    # discovered (in first-seen order).
    columns = list(_COACHING_COLUMNS)
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = out_dir / f"{prefix}_{stamp}.csv"
    # utf-8-sig so Excel opens accented characters correctly.
    with open(dest, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
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
