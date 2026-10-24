# Office Mayhem

A chaotic little office game about catching coffee, keeping a fern alive, and silencing phones before the whole team stops working to watch a notification.

## Play online

Open the published GitHub Pages site in a modern browser. No account, install, or network connection during play is required.

## Run locally

The page uses JavaScript modules, so serve it over HTTP instead of opening `index.html` directly:

1. Install Node.js 20 or newer.
2. In the project folder, run `npm install`.
3. Run `npm start` and open <http://127.0.0.1:4173>.

## How to play

1. Choose any unlocked mission from the mission menu and select **Start mission**.
2. Catch steaming hot coffee; avoid iced coffee. Tap the fern or use **Water fern** when the plant task is active.
3. The generated side objective asks you to silence ringing phones or catch yellow report mugs. Bonus targets move faster, so aim carefully.
4. Complete the coffee, watering, and side-task objectives before the shift timer runs out.
5. Earn career points to unlock harder missions. Your score, unlocked missions, and best scores are saved in this browser.
6. Select and replay unlocked missions at any time. The six-mission campaign has a real finale; it does not loop endlessly.

## Targets and tasks

| Target or task | How to recognize it | Result |
| --- | --- | --- |
| **Hot coffee** | Steaming mug | +1 point and advances the coffee objective. |
| **Golden coffee** | Bright gold mug with a star | +3 points; it moves faster and advances the coffee objective. |
| **Iced coffee** | Mug marked with a snowflake | Avoid it; clicking costs 2 seconds and adds an incident. |
| **Report mug** | Bright yellow mug with a report label and dark `!` | +2 points, 1.5 seconds, and progress on report missions. |
| **Ringing phone** | Blue phone with a countdown ring | Tap it for +3 points and a second; letting it expire distracts the office and costs time. |
| **Office fern** | Plant on the desk or the **Water fern** button | Water it to complete the mission chore and earn 2 points. |

Missions last about 65–94 seconds. Their coffee goals, side task, time, target speed, and spawn rate are generated from the selected mission and career results. A stronger performance can make later missions faster and busier. New mission variations use no external assets.

Music is optional and generated in the browser with Web Audio. Select **Ambient: Off** to start the slow, relaxing ambient soundtrack; select it again to stop. Browsers require a user action before audio can play.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

`npm test` runs the Node built-in game-rule and color-contrast tests plus Playwright browser checks for mission selection, watering, audio controls, and mobile portrait/landscape layouts and touch input.

## Project files

- `index.html` — accessible page structure and game entry point.
- `styles.css` — desktop and responsive mobile layouts.
- `src/game-rules.js` — deterministic mission generation, scoring, and campaign progression.
- `src/main.js` — canvas graphics, input, and gameplay.
- `src/audio.js` — generated ambient music and sound effects.
- `tests/` — unit and browser regression tests.
