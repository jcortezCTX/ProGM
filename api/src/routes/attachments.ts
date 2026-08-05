import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { readFile } from "../lib/attachmentStorage.js";
import { requireAuth } from "../middleware/auth.js";
import {
  NotFoundError,
  ValidationError,
  createAttachment,
  deleteAttachment,
  getAttachment,
  listAttachments,
} from "../services/attachmentService.js";

export const attachmentsRouter = Router();

// Kept in sync with the `entity_type` examples documented on the
// attachments table in db/schema.sql - only inventory_item is wired up on
// the frontend so far.
const ENTITY_TYPES = ["inventory_item", "delivery", "drawing_revision", "log_entry"] as const;
const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      cb(new ValidationError("Only JPG, PNG, or HEIC photos are supported"));
      return;
    }
    cb(null, true);
  },
});

const listQuerySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
});

const uploadBodySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

attachmentsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listAttachments(parsed.data.entity_type, parsed.data.entity_id));
  } catch (err) {
    handleError(res, err);
  }
});

attachmentsRouter.post("/", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      handleError(res, err instanceof multer.MulterError ? new ValidationError(err.message) : err);
      return;
    }
    const parsed = uploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    try {
      const attachment = await createAttachment({
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        file: { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype },
      });
      res.status(201).json(attachment);
    } catch (err) {
      handleError(res, err);
    }
  });
});

// Deliberately not behind requireAuth — loaded via a plain <img src>, which
// can't carry a bearer token. Relies on the id being an unguessable UUID.
attachmentsRouter.get("/:id/file", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const attachment = await getAttachment(parsed.data.id);
    if (!attachment.storage_key) {
      res.status(404).json({ error: "file not available" });
      return;
    }
    const buffer = await readFile(attachment.storage_key);
    res.setHeader("Content-Type", attachment.content_type ?? "application/octet-stream");
    res.send(buffer);
  } catch (err) {
    handleError(res, err);
  }
});

attachmentsRouter.delete("/:id", requireAuth, async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteAttachment(parsed.data.id);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});
