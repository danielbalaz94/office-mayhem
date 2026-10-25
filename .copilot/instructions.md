# Office Mayhem project instructions

Follow these requirements in future sessions, including when implementing a feature without a separate detailed request.

## Product requirements

- Keep the game playable as a static website on GitHub Pages. Keep `index.html` at the repository root; browser modules and styles belong in `src/`.
- Preserve the no-account, no-install, offline-during-play experience. Do not add runtime network requests, third-party services, remote assets, analytics, or telemetry. Do not fetch or upload player/browser data. Keep game progress in browser storage. Generate music and sound effects locally with Web Audio; do not download audio.
- Keep audio controls clear: call the tune **Music**, provide a master volume for music and effects, and give important events distinct generated cues (including hot vs. iced mugs and mission completion). Respect browsers' user-gesture requirements for starting audio.
- Make the active mission's objectives easy to see and read on mobile in portrait and landscape without making the playable area harder to use. Show objective progress and a clear completed state.
- The fern must visibly and audibly ask for water. Watering advances the objective only while a request is active; keep the request apparent until answered and do not add an unrequested miss penalty.
- Keep target balance challenging but fair: hot coffee must remain available, iced mugs must appear often enough to demand attention, and no more than one report mug should be active. Preserve mission-specific activities.
- Selecting another mission must start it with fresh run state, including score, objectives/checkmarks, watering request, activity progress, targets, and temporary selections. Preserve saved campaign progress and best scores.
- Explain the goal and basic interactions to first-time players. Keep retry and previous/next mission navigation discoverable and grouped with the start/retry action.
- Keep the README's play link current: `https://danielbalaz94.github.io/office-mayhem/`.
- Do not add videos or other media that the browser game cannot use. Prefer no video; only add one if it is browser-compatible, used by the game, and verified in supported browsers.

## Implementation and verification

- Keep changes focused and follow existing module, accessibility, responsive-layout, and test conventions. Avoid unrelated refactors and preserve user changes already in the worktree.
- Add or update regression tests for each feature as it is implemented; do not defer all test coverage until the end. Cover behavior in unit tests and browser tests when the feature affects gameplay or UI.
- Run the smallest relevant test after each feature, then run `npm test` for the complete unit and Playwright suites before considering the work done. Address failures and inspect `git diff --check`.
- Keep the GitHub Actions test workflow pull-request-only: updates to a PR must run tests, without redundant push-to-branch and merge-to-main runs.
- For each implementation plan, include **commit and push** as the final step, after implementation and verification. At completion, commit and push the requested changes when repository access permits; never force-push or include unrelated user changes. If committing or pushing is blocked, state that clearly.
