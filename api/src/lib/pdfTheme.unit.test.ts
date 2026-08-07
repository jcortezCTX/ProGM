import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDF_THEME_TOKENS } from "./pdfTheme.js";

// Guards the one duplication in the PDF pipeline: `pdfTheme.ts` mirrors the
// brand tokens from `web/src/tokens.css` because the API cannot import the web
// workspace's CSS at runtime. If a token's value changes on the web side, the
// PDF must not keep printing the old brand color — this test fails instead.
const TOKENS_CSS_PATH = new URL("../../../web/src/tokens.css", import.meta.url);

function parseCustomProperties(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(match[1], match[2].trim());
  }
  return out;
}

describe("PDF_THEME_TOKENS", () => {
  const canonical = parseCustomProperties(readFileSync(TOKENS_CSS_PATH, "utf8"));
  const mirrored = parseCustomProperties(PDF_THEME_TOKENS);

  it("mirrors a non-empty subset of the canonical tokens", () => {
    expect(canonical.size).toBeGreaterThan(0);
    expect(mirrored.size).toBeGreaterThan(0);
  });

  it("defines no token that web/src/tokens.css does not", () => {
    const unknown = [...mirrored.keys()].filter((name) => !canonical.has(name));
    expect(unknown).toEqual([]);
  });

  it("matches web/src/tokens.css for every mirrored token", () => {
    const drifted = [...mirrored.entries()]
      .filter(([name, value]) => canonical.get(name) !== value)
      .map(([name, value]) => `${name}: PDF has "${value}", tokens.css has "${canonical.get(name)}"`);
    expect(drifted).toEqual([]);
  });
});
