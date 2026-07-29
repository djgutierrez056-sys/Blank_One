# C2 Perform QA Export Bot

A small Python (PyCharm-friendly) automation that logs into
[app.c2perform.com](https://app.c2perform.com/qa_export.php) and performs the QA
export for you:

1. Opens the **QA Export** page.
2. Chooses a form in **Form Name** (default: **NEW GA**).
3. Sets **Evaluation Date** to a **Custom Range** — **January 1st → today** by default.
4. Clicks **Search**.
5. Ticks the **select-all** checkbox in the results header (behind *Form No.*).
6. Clicks **Export**, chooses **Attribute Information**, and **downloads** the file.

Your credentials live in a git-ignored `.env` file, so they never get committed.

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

   Open `.env` and set `C2_EMAIL` and `C2_PASSWORD`. That file is git-ignored.

5. **Run it** — right-click `export_bot.py` → **Run 'export_bot'**, or:

   ```bash
   python export_bot.py
   ```

The downloaded file lands in the `downloads/` folder (also git-ignored).

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
| `C2_EMAIL`        | —                           | Your login email. **Required.**                                         |
| `C2_PASSWORD`     | —                           | Your login password. **Required.**                                      |
| `C2_FORM_NAME`    | `NEW GA`                    | Form to select in the *Form Name* dropdown.                             |
| `C2_EXPORT_TYPE`  | `attribute_information`     | `basic_information`, `basic_information_expanded`, or `attribute_information`. |
| `C2_START_DATE`   | Jan 1 of current year       | Start of the evaluation-date range (`mm/dd/yyyy`).                       |
| `C2_END_DATE`     | today                       | End of the evaluation-date range (`mm/dd/yyyy`).                         |
| `C2_HEADLESS`     | `false`                     | `true` runs the browser invisibly.                                      |
| `C2_DOWNLOAD_DIR` | `downloads`                 | Folder for downloaded exports.                                          |

---

## How it maps to the site

- **Form Name** is the `#form_name` "chosen" multiselect (`NEW GA` = option `2034`).
- **Search** submits a `GET` to `qa_export.php` with `date_range=Custom Range`,
  `sdate`, `edate`, `agentoption=all`.
- **Select all** is the header checkbox `#select`, which selects every
  `form_id[]` row checkbox.
- **Export → Attribute Information** clicks the `#Authoriti2` radio
  (`value="attribute_information"`), which sets `#export_type` and submits the
  `#exportForm` POST that returns the download.

## Notes

- Only run this against an account you're authorized to use.
- This drives the real UI, so if C2 Perform changes their page markup, the
  selectors in `export_bot.py` may need a small update.
