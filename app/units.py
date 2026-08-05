"""Display-unit handling. All storage stays in millimeters; this module only
formats mm values for on-screen labels, toggled non-destructively from the UI.
"""
from __future__ import annotations


class DisplayUnits:
    """Process-wide current display unit ('metric' or 'imperial')."""
    current: str = "metric"


def format_length(mm: float, unit: str | None = None) -> str:
    unit = unit or DisplayUnits.current
    if unit == "imperial":
        total_inches = mm / 25.4
        feet = int(total_inches // 12)
        inches = total_inches - feet * 12
        if feet:
            return f"{feet}'{inches:.1f}\""
        return f"{inches:.1f}\""
    if abs(mm) >= 1000:
        return f"{mm / 1000:.2f} m"
    return f"{mm:.0f} mm"


def format_area(sq_mm: float, unit: str | None = None) -> str:
    unit = unit or DisplayUnits.current
    if unit == "imperial":
        sq_ft = sq_mm / 92903.04
        return f"{sq_ft:.1f} ft²"
    sq_m = sq_mm / 1_000_000
    return f"{sq_m:.2f} m²"
