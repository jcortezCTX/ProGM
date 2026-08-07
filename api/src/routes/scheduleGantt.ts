import { Router } from "express";
import { ganttQuerySchema } from "../validation/scheduleGantt.js";
import { getGantt } from "../services/scheduleGanttService.js";
import { getLookaheadPdf } from "../services/scheduleLookaheadPdfService.js";

export const scheduleGanttRouter = Router();

// Registered before "/" only for readability — Express matches exact paths, so
// the two never collide.
scheduleGanttRouter.get("/pdf", async (req, res) => {
  const parsed = ganttQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { pdf, filename } = await getLookaheadPdf(parsed.data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Buffered rather than streamed: Chromium only hands back the PDF once the
    // whole document is laid out, so there is nothing to stream, and setting
    // the length lets the browser show real download progress.
    res.setHeader("Content-Length", String(pdf.byteLength));
    res.end(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to render the lookahead PDF" });
  }
});

scheduleGanttRouter.get("/", async (req, res) => {
  const parsed = ganttQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getGantt(parsed.data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});
