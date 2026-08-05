# Room Planner

A browser-based tool for mapping out rooms and arranging furniture: draw rooms, drag furniture from a catalog, move/resize/rotate, copy & paste, and save your plan.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser.

## Features

- **Rooms** — pick the "+ Room" tool and click-drag on the canvas to draw a rectangular room; it shows live dimensions and area.
- **Furniture catalog** — grouped by room type (Living Room, Bedroom, Kitchen, Bathroom, Office, Outdoor, Doors & Windows). Click an item to drop it on the canvas, or drag it directly onto the plan.
- **Move / resize / rotate** — select anything to get drag handles and a rotate handle (snaps to 15° increments).
- **Copy / paste / duplicate** — `Ctrl+C` / `Ctrl+V`, or `Ctrl+D` to duplicate in place.
- **Keyboard shortcuts** — arrow keys nudge the selection, `R` rotates 15°, `Delete` removes it, `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo, `Esc` deselects.
- **Properties panel** — precise numeric X/Y/width/height/rotation, label, and color editing.
- **Grid snapping** — configurable snap increment (off, 3", 6", 1').
- **Autosave** — your plan is saved to the browser's local storage as you work.
- **Export / Import** — save a plan as a `.json` file to share or back up, and load it back in later.

## Tech

Vite + React + TypeScript, [Konva](https://konvajs.org/) (via `react-konva`) for the canvas, [Zustand](https://github.com/pmndrs/zustand) for state, and Tailwind CSS for styling. Fully client-side — no backend required.

## Known v1 limitations

- Rooms are rectangular only (no L-shaped or angled rooms yet).
- Doors and windows are placed like furniture rather than physically cut into wall geometry.
- No multi-floor support yet.
