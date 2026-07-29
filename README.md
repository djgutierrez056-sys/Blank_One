# C2 Perform Export Dashboard

A small Python (PyCharm-friendly) automation that logs into
[app.c2perform.com](https://app.c2perform.com) and runs two exports for you,
with **live progress bars** in a desktop dashboard:

**QA Evaluations** (`qa_export.php`)
1. Opens the **QA Export** page.
2. Chooses a form in **Form Name** (default: **NEW GA**).
3. Sets **Evaluation Date** to a **Custom Range** — **January 1st → today** by default.
4. Clicks **Search**, ticks the **select-all** checkbox (behind *Form No.*).
5. Clicks **Export → Attribute Information** and **downloads** the file.

**Coaching Sessions** (`coaching/coach/coachings.php` — the **SESSIONS** tab)
1. Opens the **Coaching Sessions** page.
2. Sets the **Date Range** to a **Custom Date Range** (same Jan 1 → today default).
3. For each session it opens the **view** (the eye icon) and scrapes **every
   detail field** — Company, Coach, Supervisor, Employees, Account Name,
   Coaching Type, Comments, Result, etc. — into a single **CSV**.
   (Set `C2_COACHING_MODE=summary` for the site's quick 6-column Excel export instead.)

Your credentials live in a git-ignored `.env` file, so they never get committed.

## Two ways to run it

| Command                | What it does                                                   |
|------------------------|---------------------------------------------------------------|
| `python dashboard.py`  | **Desktop dashboard** with a progress bar for each export.    |
| `python export_bot.py evaluations` | Evaluations only, terminal progress bar.          |
| `python export_bot.py coachings`   | Coaching sessions only.                           |
| `python export_bot.py both`        | Both, one after the other.                        |

> The dashboard uses **Tkinter**, which ships with the standard Python
> installer on Windows and macOS (no `pip install` needed). On Linux install it
> with your package manager (e.g. `sudo apt install python3-tk`).

---

## Setup in PyCharm

1. **Open the folder** in PyCharm (`File → Open…`).
2. **Create a virtual environment** when prompted (or `File → Settings → Project → Python Interpreter → Add → Virtualenv`).
3. **Install dependencies** — open the PyCharm terminal and run:

   ```bash
   pip install -r requirements.txt
   python -m playwright install chromium
   ```

4. **Add your credentials** — copy the example env file and edit it:

   ```bash
   cp .env.example .env
   ```

   Open `.env` and set `C2_USERNAME` (your login name, e.g. `Jonathan.Gutierrez`)
   and `C2_PASSWORD`. That file is git-ignored.

5. **Run it** — right-click `dashboard.py` → **Run 'dashboard'**, or:

   ```bash
   python dashboard.py
   ```

Downloaded files land in the `downloads/` folder (also git-ignored). Evaluation
exports are prefixed `evaluations_` and coaching exports `coachings_` so they
never overwrite each other.

---

## First run / login

The first run opens a visible browser window (`C2_HEADLESS=false`). If C2 Perform
shows any extra login challenge, complete it in that window — the session is then
saved to `auth_state.json` (git-ignored) and reused, so later runs don't ask
again. Once it works, you can set `C2_HEADLESS=true` in `.env` to run it silently.

If login stops working (e.g. password changed), delete `auth_state.json` and run
again.

---

## Configuration (`.env`)

| Variable          | Default                     | Meaning                                                                 |
|-------------------|-----------------------------|-------------------------------------------------------------------------|
| `C2_USERNAME`     | —                           | Your login username (e.g. `Jonathan.Gutierrez`). **Required.**          |
| `C2_PASSWORD`     | —                           | Your login password. **Required.**                                      |
| `C2_FORM_NAME`    | `NEW GA`                    | Form to select in the *Form Name* dropdown.                             |
| `C2_EXPORT_TYPE`  | `attribute_information`     | `basic_information`, `basic_information_expanded`, or `attribute_information`. |
| `C2_COACHING_MODE`| `detailed`                  | `detailed` (scrape every field → CSV) or `summary` (site Excel button). |
| `C2_COACHING_LIMIT`| `0`                        | In detailed mode, cap sessions scraped (`0` = all). Good for a test run. |
| `C2_START_DATE`   | Jan 1 of current year       | Start of the date range for **both** exports (`mm/dd/yyyy`).            |
| `C2_END_DATE`     | today                       | End of the date range for **both** exports (`mm/dd/yyyy`).             |
| `C2_HEADLESS`     | `false`                     | `true` runs the browser invisibly.                                      |
| `C2_DOWNLOAD_DIR` | `downloads`                 | Folder for downloaded exports.                                          |

---

## Project layout

| File            | Purpose                                                          |
|-----------------|------------------------------------------------------------------|
| `dashboard.py`  | Tkinter desktop dashboard with progress bars (main entry point). |
| `export_bot.py` | Command-line runner (`evaluations` / `coachings` / `both`).      |
| `c2perform.py`  | Core automation: login + both export flows.                      |
| `config.py`     | Reads `.env`, sets sensible defaults.                            |

## How it maps to the site

**Evaluations**
- **Form Name** is the `#form_name` "chosen" multiselect (`NEW GA` = option `2034`).
- **Search** submits a `GET` to `qa_export.php` with `date_range=Custom Range`,
  `sdate`, `edate`, `agentoption=all`.
- **Select all** is the header checkbox `#select` (selects every `form_id[]` row).
- **Export → Attribute Information** = the `#Authoriti2` radio, which sets
  `#export_type` and submits the `#exportForm` POST that returns the download.

**Coachings**
- The **SESSIONS** tab is `coaching/coach/coachings.php`.
- Selecting **Custom Date Range** (`#dr10`) and setting `#custom_daterange_from` /
  `#custom_daterange_to`, then triggering the page's `load_table('Main')`, reloads
  the client-side DataTable for that range.
- **Detailed mode** (default): for each row, the eye icon calls
  `agentViewFunction(formid, "view", agent_id)`, which POSTs to
  `coaching/coach/ajax/agent-ajax.php` (`action=getCoachingFormDetails`) and
  returns the detail HTML. The tool fetches these in batches, parses each
  session's fields, and writes them all to one CSV.
- **Summary mode**: the DataTables `.buttons-excel` button, which builds a
  6-column `.xlsx` in the browser and downloads it.

## Notes

- Only run this against an account you're authorized to use.
- This drives the real UI, so if C2 Perform changes their page markup, the
  selectors in `c2perform.py` may need a small update.
