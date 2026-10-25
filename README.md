# Office Mayhem

A chaotic office game about catching coffee, rescuing a fern, unjamming a printer, sorting urgent documents, and surviving a frankly unnecessary number of notifications.

## Play online

Open the published GitHub Pages site in a modern browser. No account, install, or network connection during play is required.

## Run locally

The page uses JavaScript modules, so serve it over HTTP instead of opening `index.html` directly:

1. Install Node.js 20 or newer.
2. In the project folder, run `npm install`.
3. Run `npm start` and open <http://127.0.0.1:4173>.

## How to play

1. Choose a mission card from the **Missions** board. Completing a mission unlocks the next one.
2. Catch steaming hot coffee; avoid iced coffee. Click or tap the fern itself when it needs water.
3. Complete the mission activity: silence phones, catch yellow report mugs, clear printer parts in order, sort documents by tray color, or tap pests before they reach the fern.
4. Finish every objective before the shift timer runs out. Early missions have slower targets; later missions become faster.
5. Finish without incidents to earn a commendation. High scores and personal bests are optional performance goals, not the only progression.
6. After a shift, use the nearby retry, previous/next mission, or mission-board controls. Your progress, commendations, and best scores are saved in this browser.

## Targets and tasks

| Target or task | How to recognize it | Result |
| --- | --- | --- |
| **Hot coffee** | Steaming mug | +1 point and advances the coffee objective. |
| **Golden coffee** | Bright gold mug with a star | +3 points; it moves faster and advances the coffee objective. |
| **Iced coffee** | Mug marked with a snowflake | Avoid it; clicking costs 2 seconds and adds an incident. |
| **Report mug** | Bright yellow mug with a report label and dark `!` | +2 points, 1.5 seconds, and progress on report missions. |
| **Ringing phone** | Blue phone with a countdown ring | Tap it for +3 points and a second; letting it expire distracts the office and costs time. |
| **Office fern** | Plant on the desk | Tap it to water it and complete the mission chore. |
| **Jammed printer** | Three numbered, blinking lights | Tap the printer parts in the displayed order. |
| **Urgent documents** | Paper above three color-coded trays | Pick up the document and tap the tray with the matching color. |
| **Fern pests** | Wiggling bugs crawling toward the fern | Tap each pest before it reaches the plant. |

The finite nine-mission campaign introduces new activities gradually. A completed mission unlocks the next; replaying a mission can improve its best score but does not unlock more missions. Legacy six-mission saves are migrated so existing scores and progress are retained.

Ambient audio is optional and generated in the browser with Web Audio. Select **Ambient: Off** to start it; select it again to stop. Browsers require a user action before audio can play.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

`npm test` runs Node game-rule/audio/contrast tests and Playwright browser checks for mission cards, legacy-save migration, direct plant watering, the new activities, bundled music, and mobile portrait/landscape layouts and touch input.

## Project files

- `index.html` — accessible page structure and game entry point.
- `styles.css` — desktop and responsive mobile layouts.
- `src/game-rules.js` — deterministic mission generation, scoring, and campaign progression.
- `src/main.js` — canvas graphics, input, and gameplay.
- `src/audio.js` — generated ambient music and sound effects.
- `tests/` — unit and browser regression tests.
