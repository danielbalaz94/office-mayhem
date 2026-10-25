import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const htmlUrl = new URL("../index.html", import.meta.url);

test("HTML stays clean and loads its separated stylesheet and JavaScript module", async () => {
  const html = await readFile(htmlUrl, "utf8");
  assert.match(html, /<link rel="stylesheet" href="\.\/src\/styles\.css">/);
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.match(html, /<dialog id="missionBrowser"/);
  assert.match(html, /id="coffeeObjective"/);
  assert.match(html, /id="waterObjective"/);
  assert.match(html, /id="activityObjective"/);
  assert.match(html, /type="range"[^>]*aria-label="Sound volume"/);
  assert.doesNotMatch(html, /missionSelect/);
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\sstyle=/i);
  await access(new URL("./src/styles.css", htmlUrl));
  await access(new URL("./src/main.js", htmlUrl));
});
