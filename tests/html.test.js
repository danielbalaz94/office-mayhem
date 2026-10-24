import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const htmlUrl = new URL("../index.html", import.meta.url);

test("HTML stays clean and loads its separated stylesheet and JavaScript module", async () => {
  const html = await readFile(htmlUrl, "utf8");
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css">/);
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\sstyle=/i);
  await access(new URL("./styles.css", htmlUrl));
  await access(new URL("./src/main.js", htmlUrl));
});
