import "dotenv/config";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { requireAuth } from "./middleware/auth.js";
import { assetTypesRouter } from "./routes/assetTypes.js";
import { assetsRouter, siteAssetsRouter } from "./routes/assets.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { authRouter } from "./routes/auth.js";
import { concreteCreditsRouter } from "./routes/concreteCredits.js";
import { concreteMixDesignsRouter } from "./routes/concreteMixDesigns.js";
import { concreteDashboardRouter, concretePoursRouter, concreteSamplesRouter } from "./routes/concretePours.js";
import { concreteSettingsRouter } from "./routes/concreteSettings.js";
import { concreteStructuresRouter } from "./routes/concreteStructures.js";
import { deliveriesRouter } from "./routes/deliveries.js";
import { drawingsRouter } from "./routes/drawings.js";
import { healthRouter } from "./routes/health.js";
import { inventoryRouter } from "./routes/inventory.js";
import { mechanicalLogRouter } from "./routes/mechanicalLog.js";
import { pumpTruckRentalsRouter } from "./routes/pumpTruckRentals.js";
import { requisitionsRouter } from "./routes/requisitions.js";
import { scheduleActivitiesRouter } from "./routes/scheduleActivities.js";
import { scheduleGanttRouter } from "./routes/scheduleGantt.js";
import { scheduleHolidaysRouter } from "./routes/scheduleHolidays.js";
import { scheduleSectionsRouter } from "./routes/scheduleSections.js";
import { sitesRouter } from "./routes/sites.js";
import { taskListsRouter } from "./routes/taskLists.js";
import { tasksRouter } from "./routes/tasks.js";
import { usersRouter } from "./routes/users.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);

// Everything below requires a signed-in user (temporary local login —
// see BUILD_PLAN.md; replaced by Azure AD/MSAL in Phase 3).
app.use("/api/inventory", requireAuth, inventoryRouter);
app.use("/api/deliveries", requireAuth, deliveriesRouter);
app.use("/api/requisitions", requireAuth, requisitionsRouter);
app.use("/api/mechanical-log", requireAuth, mechanicalLogRouter);
app.use("/api/concrete/pours", requireAuth, concretePoursRouter);
app.use("/api/concrete/samples", requireAuth, concreteSamplesRouter);
app.use("/api/concrete/mix-designs", requireAuth, concreteMixDesignsRouter);
app.use("/api/concrete/structures", requireAuth, concreteStructuresRouter);
app.use("/api/concrete/pump-rentals", requireAuth, pumpTruckRentalsRouter);
app.use("/api/concrete/credits", requireAuth, concreteCreditsRouter);
app.use("/api/concrete/settings", requireAuth, concreteSettingsRouter);
app.use("/api/concrete", requireAuth, concreteDashboardRouter);
app.use("/api/users", usersRouter); // admin-only, enforced inside the router
// requireAuth applied per-route inside attachmentsRouter, not here — the
// :id/file route is loaded via a plain <img src>, which can't carry a
// bearer token.
app.use("/api/attachments", attachmentsRouter);
app.use("/api/drawings", drawingsRouter);
app.use("/api/task-lists", requireAuth, taskListsRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/sites", requireAuth, sitesRouter);
app.use("/api/sites", requireAuth, siteAssetsRouter);
app.use("/api/assets", requireAuth, assetsRouter);
app.use("/api/asset-types", requireAuth, assetTypesRouter);
app.use("/api/schedule/sections", requireAuth, scheduleSectionsRouter);
app.use("/api/schedule/activities", requireAuth, scheduleActivitiesRouter);
app.use("/api/schedule/holidays", requireAuth, scheduleHolidaysRouter);
app.use("/api/schedule/gantt", requireAuth, scheduleGanttRouter);

// Catches malformed JSON bodies from express.json() before they hit Express's
// default HTML error page, which leaks a stack trace and breaks the API's
// { error: string } contract.
const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "invalid JSON body" });
    return;
  }
  next(err);
};
app.use(jsonErrorHandler);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`api listening on port ${port}`);
});
