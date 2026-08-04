import "dotenv/config";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { deliveriesRouter } from "./routes/deliveries.js";
import { healthRouter } from "./routes/health.js";
import { inventoryRouter } from "./routes/inventory.js";
import { requisitionsRouter } from "./routes/requisitions.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", healthRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/deliveries", deliveriesRouter);
app.use("/api/requisitions", requisitionsRouter);

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
