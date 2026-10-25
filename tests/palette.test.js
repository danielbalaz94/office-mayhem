import test from "node:test";
import assert from "node:assert/strict";
import { REPORT_PALETTE } from "../src/palette.js";

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

test("report mug paper and symbol meet strong contrast", () => {
  const dark = luminance(REPORT_PALETTE.ink);
  for (const light of [REPORT_PALETTE.paper, REPORT_PALETTE.label]) {
    assert.ok((luminance(light) + .05) / (dark + .05) >= 7);
  }
});
