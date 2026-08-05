import { Router } from "express";
import {
  createPourSchema,
  idParamSchema,
  poursListQuerySchema,
  sampleSchema,
  updatePourSchema,
  weeklyReportQuerySchema,
} from "../validation/concretePours.js";
import { renderWeeklyReportPdf } from "../lib/weeklyReportPdf.js";
import {
  NotFoundError,
  addSample,
  createPour,
  deletePour,
  deleteSample,
  getConcreteSummary,
  getPour,
  getWeeklyReport,
  listPourSamples,
  listPours,
  updatePour,
  updateSample,
} from "../services/concretePourService.js";
import { getConcreteSettings } from "../services/concreteSettingsService.js";

export const concretePoursRouter = Router();
export const concreteSamplesRouter = Router();
export const concreteDashboardRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

concretePoursRouter.get("/", async (req, res) => {
  const parsed = poursListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listPours(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

concretePoursRouter.post("/", async (req, res) => {
  const parsed = createPourSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const pour = await createPour(parsed.data);
    res.status(201).json(pour);
  } catch (err) {
    handleError(res, err);
  }
});

concretePoursRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getPour(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

concretePoursRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updatePourSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updatePour(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

concretePoursRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deletePour(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

concretePoursRouter.get("/:id/samples", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listPourSamples(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

concretePoursRouter.post("/:id/samples", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = sampleSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const sample = await addSample(parsedId.data.id, parsedBody.data);
    res.status(201).json(sample);
  } catch (err) {
    handleError(res, err);
  }
});

concreteSamplesRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = sampleSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateSample(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteSamplesRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteSample(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

concreteDashboardRouter.get("/summary", async (_req, res) => {
  try {
    res.json(await getConcreteSummary());
  } catch (err) {
    handleError(res, err);
  }
});

concreteDashboardRouter.get("/weekly-report", async (req, res) => {
  const parsed = weeklyReportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getWeeklyReport(parsed.data.weekEnding));
  } catch (err) {
    handleError(res, err);
  }
});

concreteDashboardRouter.get("/weekly-report/pdf", async (req, res) => {
  const parsed = weeklyReportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [report, settings] = await Promise.all([
      getWeeklyReport(parsed.data.weekEnding),
      getConcreteSettings(),
    ]);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="concrete-weekly-report-${report.week_ending}.pdf"`);
    const doc = renderWeeklyReportPdf(report, settings);
    doc.pipe(res);
  } catch (err) {
    handleError(res, err);
  }
});
