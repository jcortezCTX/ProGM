import { describe, expect, it } from "vitest";
import { baseSheetCss, buildFooterTemplate, esc } from "./pdfLayout.js";

describe("esc", () => {
  it("escapes every character that could break out of markup", () => {
    expect(esc(`<script>"x" & 'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });

  it("renders null and undefined as empty rather than the literal words", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("passes numbers through", () => {
    expect(esc(0)).toBe("0");
    expect(esc(42)).toBe("42");
  });
});

describe("baseSheetCss", () => {
  it("includes the brand tokens so sheets can use var() instead of literals", () => {
    const css = baseSheetCss();
    expect(css).toContain("--primary:");
    expect(css).toContain("--title:");
  });

  it("forces background printing, without which fills and badges vanish", () => {
    expect(baseSheetCss()).toContain("print-color-adjust: exact");
  });

  it("repeats table headers across pages", () => {
    expect(baseSheetCss()).toContain("thead { display: table-header-group; }");
  });
});

describe("buildFooterTemplate", () => {
  it("includes the generation timestamp and Chromium's page-number spans", () => {
    const footer = buildFooterTemplate({ generatedAt: new Date("2026-08-07T15:04:00Z") });
    expect(footer).toContain("Generated");
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
  });
});
