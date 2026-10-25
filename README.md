# Office Mayhem

A chaotic office game about catching coffee, caring for office plants, unjamming a printer, sorting urgent documents, and surviving a frankly unnecessary number of notifications.

## Play online

Play [Office Mayhem on GitHub Pages](https://danielbalaz94.github.io/office-mayhem/) in a modern browser. No account, install, or network connection during play is required.

## Run locally

The page uses JavaScript modules, so serve it over HTTP instead of opening `index.html` directly:

1. Install Node.js 20 or newer.
2. In the project folder, run `npm install`.
3. Run `npm start` and open <http://127.0.0.1:4173>.

## How to play

1. Choose a mission card from the **Missions** board. Completing a mission unlocks the next one.
2. Catch steaming hot coffee; avoid iced coffee. Office plants and flowers will ask for water; tap the requester before its timer expires to avoid a point, time, and incident penalty.
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
| **Office plants and flowers** | Potted fern, cactus, succulent, daisy, tulip, or sunflower | Tap the plant showing a **WATER ME!** bubble before its request expires; watering is optional, while missed requests cost points, time, and an incident. |
| **Jammed printer** | Three numbered, blinking lights | Tap the printer parts in the displayed order. |
| **Urgent documents** | Paper above three color-coded trays | Pick up the document and tap the tray with the matching color. |
| **Fern pests** | Wiggling bugs crawling toward the fern | Tap each pest before it reaches the plant. |

The finite nine-mission campaign introduces new activities gradually. Each mission start procedurally rerolls its office layout, plants, and day/night weather, including clear skies, clouds, rain, or snow. A completed mission unlocks the next; replaying a mission can improve its best score but does not unlock more missions. Legacy six-mission saves are migrated so existing scores and progress are retained.

Music and sound effects are generated locally in the browser with Web Audio; no audio files are downloaded. The original tune now plays more slowly in a warmer, lower register with soft chord backing. Hot and iced mugs have distinct generated cues, as do mission completion and plant requests. Select **Music: Off** to start the tune, use the volume slider for both music and effects, or select **Music: On** to mute the tune while keeping effects available. Browsers require a user action before audio can play.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

`npm test` runs Node game-rule/audio/contrast tests and Playwright browser checks for mission cards, legacy-save migration, plant watering requests and missed-request penalties, objective checkmarks, generated music and effects, target-spawn balance, and mobile portrait/landscape layouts and touch input.

## Project files

- `src/` — browser modules and stylesheet: mission rules, gameplay, generated audio, palette, and responsive layouts.
- `index.html` stays at the repository root as the GitHub Pages entry point.
- `scripts/` — local development server.
- `tests/` — unit and browser regression tests.
