import "dotenv/config";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { requireAuth } from "./middleware/auth.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { authRouter } from "./routes/auth.js";
import { deliveriesRouter } from "./routes/deliveries.js";
import { healthRouter } from "./routes/health.js";
import { inventoryRouter } from "./routes/inventory.js";
import { mechanicalLogRouter } from "./routes/mechanicalLog.js";
import { requisitionsRouter } from "./routes/requisitions.js";
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
app.use("/api/users", usersRouter); // admin-only, enforced inside the router
// requireAuth applied per-route inside attachmentsRouter, not here — the
// :id/file route is loaded via a plain <img src>, which can't carry a
// bearer token.
app.use("/api/attachments", attachmentsRouter);

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
