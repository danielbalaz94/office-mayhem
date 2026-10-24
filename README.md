# Office Mayhem

A tiny, no-install browser game about surviving a coffee-related office incident. Click the right targets, finish all three shifts, and try not to disappoint the office fern.

## Play

1. Open `index.html` in a modern web browser.
2. Optionally press **♫ Music: Off** to turn on the original, browser-generated office jazz and sound effects. Audio starts only after you click, to comply with browser autoplay rules.
3. Press **Start the shift**.
4. Click targets in the office scene with your mouse (or tap on a touchscreen). The game lasts for three levels; each level has a fresh 30-second timer.
5. Complete all three levels to become Chief Beverage Officer. If time runs out, choose **Retry the shift** to start over.

## Know your targets

| Target | How to recognize it | What happens when clicked |
| --- | --- | --- |
| **Hot coffee** | Steaming mug | +1 point and advances the level objective by one. Catch golden hot coffee for **+3 points**; it also counts toward the objective. |
| **Iced coffee** | Mug marked with a snowflake | Avoid it: clicking costs **2 seconds** and adds an HR incident. |
| **Expense report** | Paperwork mug marked with `!` | **+2 points** and **1.5 seconds**. The clock cannot go above 30 seconds. |

Hot coffee that escapes after about seven seconds adds an HR incident. Missing it does not directly reduce the timer.

## Levels and bonus task

The on-screen progress bar tracks hot coffee caught in the current level:

| Level | Hot coffee goal | What changes |
| --- | ---: | --- |
| 1 · Easy | 5 | A slower start and fewer targets at once. |
| 2 · Medium | 8 | Targets appear faster and move quicker. |
| 3 · Hard | 12 | The quickest, busiest shift. |

Each level has a bonus task: catch **two expense reports**. Completing it awards an additional **4 points and 3 seconds**. Reports also give their usual points and time individually. The clock is capped at 30 seconds.

## Tips

- Prioritize steaming mugs; only hot coffee advances the level objective.
- Watch for the snowflake before clicking—iced coffee costs precious time.
- Expense reports are a useful side objective when you can catch them safely.
- Golden hot coffee is worth triple points.
- Targets move, so aim where they are now, not where they started.

## About

The game is self-contained in `index.html`: it uses hand-drawn canvas graphics and creates its optional music and sound effects with the browser's Web Audio API. It needs no installation, external assets, or network connection.
