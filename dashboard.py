"""
C2 Perform Export Dashboard.

A small desktop dashboard (Tkinter, no extra dependencies) to run the two
exports with live progress bars:

    * QA Evaluations  (qa_export.php -> Attribute Information)
    * Coaching Sessions (coachings.php -> Excel)

Run it with:  python dashboard.py
Credentials & options come from the git-ignored .env file (see .env.example).
"""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from tkinter import ttk
from typing import List

from config import Config
import c2perform

# ---- palette (matches C2 Perform's dark-slate / green look) ----------------
BG = "#eef1f6"
CARD = "#ffffff"
SLATE = "#33475b"
GREEN = "#2ec98b"
GREEN_DK = "#25a874"
TEXT = "#33475b"
MUTED = "#7a8aa0"


class ExportPanel(ttk.Frame):
    """One export: a title, a Run button, a progress bar and a status line."""

    def __init__(self, master, title: str, subtitle: str, task_key: str, app: "Dashboard"):
        super().__init__(master, style="Card.TFrame", padding=18)
        self.task_key = task_key
        self.app = app

        ttk.Label(self, text=title, style="CardTitle.TLabel").pack(anchor="w")
        ttk.Label(self, text=subtitle, style="Muted.TLabel").pack(anchor="w", pady=(2, 12))

        self.bar = ttk.Progressbar(
            self, mode="determinate", maximum=100, length=320,
            style="Green.Horizontal.TProgressbar",
        )
        self.bar.pack(fill="x")

        self.status = ttk.Label(self, text="Ready.", style="Status.TLabel")
        self.status.pack(anchor="w", pady=(8, 12))

        self.button = tk.Button(
            self,
            text=f"Run {title}",
            command=self.run,
            bg=GREEN, fg="white", activebackground=GREEN_DK, activeforeground="white",
            relief="flat", bd=0, padx=16, pady=10, cursor="hand2",
            font=("Segoe UI", 10, "bold"),
        )
        self.button.pack(anchor="w")

    def run(self) -> None:
        self.app.start([self.task_key])

    # ---- state updates (always called on the UI thread) ----
    def set_progress(self, pct: int, msg: str) -> None:
        self.bar["value"] = pct
        self.status.config(text=msg)

    def set_running(self, running: bool) -> None:
        self.button.config(state="disabled" if running else "normal")

    def reset(self) -> None:
        self.bar["value"] = 0
        self.status.config(text="Ready.")


class Dashboard(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("C2 Perform Export Dashboard")
        self.configure(bg=BG)
        self.geometry("760x520")
        self.minsize(720, 480)

        self._events: "queue.Queue[tuple]" = queue.Queue()
        self._worker: threading.Thread | None = None

        self._build_styles()
        self._build_ui()
        self.after(80, self._drain_events)

    # ------------------------------------------------------------------ UI
    def _build_styles(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TFrame", background=BG)
        style.configure("Card.TFrame", background=CARD, relief="flat")
        style.configure("Header.TLabel", background=BG, foreground=SLATE,
                        font=("Segoe UI", 20, "bold"))
        style.configure("Sub.TLabel", background=BG, foreground=MUTED,
                        font=("Segoe UI", 10))
        style.configure("CardTitle.TLabel", background=CARD, foreground=TEXT,
                        font=("Segoe UI", 13, "bold"))
        style.configure("Muted.TLabel", background=CARD, foreground=MUTED,
                        font=("Segoe UI", 9))
        style.configure("Status.TLabel", background=CARD, foreground=SLATE,
                        font=("Segoe UI", 9))
        style.configure("Green.Horizontal.TProgressbar",
                        troughcolor="#e4e9f0", background=GREEN,
                        thickness=14, borderwidth=0)
        style.configure("TProgressbar", troughcolor="#e4e9f0", background=GREEN,
                        thickness=14, borderwidth=0)

    def _build_ui(self) -> None:
        header = ttk.Frame(self, style="TFrame", padding=(24, 20, 24, 6))
        header.pack(fill="x")
        ttk.Label(header, text="C2 Perform Export Dashboard",
                  style="Header.TLabel").pack(anchor="w")

        cfg = Config()
        window = f"{cfg.start_date}  →  {cfg.end_date}"
        mode = "hidden browser" if cfg.headless else "visible browser"
        ttk.Label(header, text=f"Date range: {window}     ·     Running in {mode}",
                  style="Sub.TLabel").pack(anchor="w", pady=(4, 0))

        body = ttk.Frame(self, style="TFrame", padding=(24, 12, 24, 12))
        body.pack(fill="both", expand=True)
        body.columnconfigure(0, weight=1, uniform="col")
        body.columnconfigure(1, weight=1, uniform="col")

        self.eval_panel = ExportPanel(
            body, "Evaluations", "QA forms → Attribute Information",
            "evaluations", self,
        )
        self.eval_panel.grid(row=0, column=0, sticky="nsew", padx=(0, 8))

        self.coach_panel = ExportPanel(
            body, "Coachings", "Coaching Sessions → Excel",
            "coachings", self,
        )
        self.coach_panel.grid(row=0, column=1, sticky="nsew", padx=(8, 0))

        self.panels = {"evaluations": self.eval_panel, "coachings": self.coach_panel}

        footer = ttk.Frame(self, style="TFrame", padding=(24, 0, 24, 20))
        footer.pack(fill="x")
        self.both_btn = tk.Button(
            footer, text="Run Both Exports", command=lambda: self.start(
                ["evaluations", "coachings"]),
            bg=SLATE, fg="white", activebackground="#2a3b4d", activeforeground="white",
            relief="flat", bd=0, padx=18, pady=11, cursor="hand2",
            font=("Segoe UI", 10, "bold"),
        )
        self.both_btn.pack(anchor="w")

        self.log = tk.Text(footer, height=6, bg="#f4f6fa", fg=SLATE, relief="flat",
                           font=("Consolas", 9), wrap="word", state="disabled")
        self.log.pack(fill="x", pady=(14, 0))

    # -------------------------------------------------------------- running
    def start(self, tasks: List[str]) -> None:
        if self._worker and self._worker.is_alive():
            return  # already running
        for key in tasks:
            self.panels[key].reset()
        self._set_all_running(True)
        self._log(f"Starting: {', '.join(tasks)}")

        def progress(pct: int, msg: str) -> None:
            # Called from the worker thread; route to UI via the queue.
            self._events.put(("progress", tasks, pct, msg))

        def work() -> None:
            try:
                cfg = Config()
                saved = c2perform.run(cfg, tasks, progress)
                self._events.put(("done", tasks, [str(p) for p in saved]))
            except Exception as exc:  # surface any failure in the UI
                self._events.put(("error", tasks, str(exc)))

        self._worker = threading.Thread(target=work, daemon=True)
        self._worker.start()

    def _set_all_running(self, running: bool) -> None:
        for panel in self.panels.values():
            panel.set_running(running)
        self.both_btn.config(state="disabled" if running else "normal")

    def _drain_events(self) -> None:
        try:
            while True:
                event = self._events.get_nowait()
                self._handle(event)
        except queue.Empty:
            pass
        self.after(80, self._drain_events)

    def _handle(self, event: tuple) -> None:
        kind, tasks = event[0], event[1]
        if kind == "progress":
            _, _, pct, msg = event
            # Drive the active panel's bar; if a task tag is present, target it.
            target = tasks
            for tag in ("evaluations", "coachings"):
                if msg.startswith(f"[{tag}]"):
                    target = [tag]
                    break
            for key in target:
                self.panels[key].set_progress(pct, msg)
            self._log(msg)
        elif kind == "done":
            _, _, saved = event
            self._set_all_running(False)
            for key in tasks:
                self.panels[key].set_progress(100, "Complete.")
            self._log("Saved files:")
            for path in saved:
                self._log(f"   {path}")
        elif kind == "error":
            _, _, err = event
            self._set_all_running(False)
            for key in tasks:
                self.panels[key].status.config(text="Failed — see log.")
            self._log(f"ERROR: {err}")

    def _log(self, text: str) -> None:
        self.log.config(state="normal")
        self.log.insert("end", text + "\n")
        self.log.see("end")
        self.log.config(state="disabled")


def main() -> None:
    app = Dashboard()
    app.mainloop()


if __name__ == "__main__":
    main()
