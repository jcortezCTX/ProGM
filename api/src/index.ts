import "dotenv/config";
import express from "express";
import { healthRouter } from "./routes/health.js";
import { inventoryRouter } from "./routes/inventory.js";

const app = express();
app.use(express.json());

app.use("/api", healthRouter);
app.use("/api/inventory", inventoryRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`api listening on port ${port}`);
});
