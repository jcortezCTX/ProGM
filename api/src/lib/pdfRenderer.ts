import puppeteer, { type Browser, type PaperFormat, type Page } from "puppeteer";

// Headless-Chromium PDF rendering. This is the single PDF pipeline for the
// app: every sheet is authored as HTML+CSS and printed here, so they share one
// set of brand tokens, one page-chrome module and one renderer. pdfkit was
// removed when the Concrete weekly report moved over — do not reintroduce a
// second pipeline for a "simple" report; the layout always grows, and a
// second one means brand styling drifts between them.
//
// One browser is launched lazily and reused for every render. Launching per
// request costs ~1s of process startup and a fresh ~100MB allocation each
// time, which turns a burst of exports into a memory spike.

let browserPromise: Promise<Browser> | null = null;

function launchArgs(): string[] {
  const args = ["--disable-dev-shm-usage"];
  // Containers commonly run as a user that cannot create the Chromium
  // sandbox. Opt-in rather than default: disabling the sandbox on the dev
  // machine would weaken it for no reason.
  if (process.env.PUPPETEER_NO_SANDBOX === "1") {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }
  return args;
}

async function getBrowser(): Promise<Browser> {
  const existing = browserPromise;
  if (existing) {
    const browser = await existing;
    if (browser.connected) return browser;
    // Chromium died (OOM kill, crash). Drop the handle and relaunch rather
    // than handing back a dead browser on every subsequent export.
    browserPromise = null;
  }

  const next = puppeteer.launch({
    headless: true,
    args: launchArgs(),
    // Lets a deployment point at a system Chromium instead of the ~340MB
    // binary puppeteer downloads (e.g. a slim container base image).
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
  });
  browserPromise = next;
  try {
    return await next;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

// Chromium holds a page's full render tree in memory, and the lookahead sheet
// is a large table. Cap concurrent renders so a handful of simultaneous
// exports queue instead of racing each other into an OOM.
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  activeRenders++;
}

function releaseSlot(): void {
  activeRenders--;
  waiting.shift()?.();
}

export interface RenderPdfOptions {
  format: PaperFormat;
  landscape: boolean;
  /**
   * Page margins as CSS lengths, e.g. "0.35in". Chromium draws the header and
   * footer templates inside the top/bottom margin boxes, so those two need
   * enough room for the template or it will be clipped.
   */
  margin: { top: string; right: string; bottom: string; left: string };
  /** Rendered at the top of every page; plain HTML, inherits no page styles. */
  headerTemplate?: string;
  /** Rendered at the bottom of every page; plain HTML, inherits no page styles. */
  footerTemplate?: string;
}

const RENDER_TIMEOUT_MS = 30_000;

export async function renderHtmlToPdf(html: string, options: RenderPdfOptions): Promise<Buffer> {
  await acquireSlot();
  let page: Page | undefined;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    const mainFrame = page.mainFrame();

    // The sheets are fully self-contained (inlined CSS, no images, no fonts).
    // Anything that still tries to leave the process is a bug or an injected
    // URL, so refuse it outright and never let a render hang on the network.
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === mainFrame) {
        void request.continue();
        return;
      }
      void request.abort();
    });

    await page.setContent(html, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({
      format: options.format,
      landscape: options.landscape,
      // Background fills carry the whole meaning of a Gantt bar; Chromium
      // drops them by default when printing.
      printBackground: true,
      margin: options.margin,
      displayHeaderFooter: Boolean(options.headerTemplate || options.footerTemplate),
      headerTemplate: options.headerTemplate ?? "<span></span>",
      footerTemplate: options.footerTemplate ?? "<span></span>",
      timeout: RENDER_TIMEOUT_MS,
    });
    return Buffer.from(pdf);
  } finally {
    // A leaked page keeps its renderer process alive for the life of the API.
    await page?.close().catch(() => {});
    releaseSlot();
  }
}

/** Closes the shared browser. Call on shutdown so Chromium does not outlive the API. */
export async function closePdfRenderer(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  await pending.then((browser) => browser.close()).catch(() => {});
}
