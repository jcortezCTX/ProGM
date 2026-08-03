-- Ops Hub — reference schema for local dev.
--
-- This file only auto-applies to a FRESH Docker volume (see
-- docker-compose.yml). After the initial `prisma db pull` baseline, all
-- schema changes go through Prisma migrations committed to git — do not
-- hand-edit this file to change the live schema, it will silently diverge.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ============================================================
-- Users — mirrors Azure AD. Never stores passwords.
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'member');

CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    azure_ad_oid TEXT UNIQUE,            -- null until first Azure AD sign-in (Phase 3)
    email        TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role         user_role NOT NULL DEFAULT 'member',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Inventory — stock is derived from transactions, never stored.
-- ============================================================

CREATE TYPE inventory_transaction_type AS ENUM (
    'received', 'issued', 'adjustment', 'delivered_out'
);

CREATE TABLE inventory_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku               TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    description       TEXT,
    unit              TEXT NOT NULL DEFAULT 'each',
    reorder_threshold NUMERIC NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_transactions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id    UUID NOT NULL REFERENCES inventory_items(id),
    type       inventory_transaction_type NOT NULL,
    quantity   NUMERIC NOT NULL, -- signed: positive in, negative out; adjustment either way
    location   TEXT NOT NULL DEFAULT 'main',
    note       TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX idx_inventory_transactions_item_location ON inventory_transactions(item_id, location);

-- Never add a quantity_on_hand column to inventory_items — it drifts.
-- All stock changes are new transaction rows; current stock is always this sum.
CREATE VIEW inventory_current_stock AS
SELECT
    item_id,
    location,
    SUM(quantity) AS quantity_on_hand
FROM inventory_transactions
GROUP BY item_id, location;

-- ============================================================
-- Deliveries — a completed delivery posts delivered_out transactions,
-- never a separate stock mechanism (see Phase 4).
-- ============================================================

CREATE TYPE delivery_status AS ENUM (
    'scheduled', 'in_transit', 'delivered', 'failed'
);

CREATE TABLE deliveries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number TEXT NOT NULL UNIQUE,
    status           delivery_status NOT NULL DEFAULT 'scheduled',
    destination      TEXT,
    scheduled_at     TIMESTAMPTZ,
    delivered_at     TIMESTAMPTZ,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE delivery_line_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id       UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity          NUMERIC NOT NULL,
    note              TEXT
);

CREATE INDEX idx_delivery_line_items_delivery ON delivery_line_items(delivery_id);

-- ============================================================
-- Drawings — revisions are append-only, never overwritten or deleted.
-- drawings.current_revision_id is a convenience pointer only.
-- ============================================================

CREATE TYPE drawing_status AS ENUM (
    'draft', 'in_review', 'approved', 'superseded'
);

CREATE TABLE drawings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_number      TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    status              drawing_status NOT NULL DEFAULT 'draft',
    current_revision_id UUID, -- FK added below, after drawing_revisions exists
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE drawing_revisions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id    UUID NOT NULL REFERENCES drawings(id),
    revision_code TEXT NOT NULL, -- e.g. 'A', 'B', 'R1'
    notes         TEXT,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (drawing_id, revision_code)
);

ALTER TABLE drawings
    ADD CONSTRAINT fk_drawings_current_revision
    FOREIGN KEY (current_revision_id) REFERENCES drawing_revisions(id);

CREATE INDEX idx_drawing_revisions_drawing ON drawing_revisions(drawing_id);

-- ============================================================
-- Tasks
-- ============================================================

CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'blocked', 'done');

CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT,
    status      task_status NOT NULL DEFAULT 'open',
    assignee_id UUID REFERENCES users(id),
    due_date    TIMESTAMPTZ,
    delivery_id UUID REFERENCES deliveries(id), -- optional link
    drawing_id  UUID REFERENCES drawings(id),   -- optional link
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id  UUID REFERENCES users(id),
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);

-- ============================================================
-- Scheduling
-- ============================================================

CREATE TYPE attendee_response AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE schedule_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT,
    location    TEXT,
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at >= starts_at)
);

CREATE TABLE schedule_event_attendees (
    event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES users(id),
    response attendee_response NOT NULL DEFAULT 'pending',
    PRIMARY KEY (event_id, user_id)
);

-- ============================================================
-- Custom log engine — schema-less by design. Adding a new log type is a
-- runtime UI action, never a migration.
-- ============================================================

CREATE TABLE log_types (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL UNIQUE,
    slug         TEXT NOT NULL UNIQUE,
    field_schema JSONB NOT NULL, -- defines the form
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE log_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_type_id UUID NOT NULL REFERENCES log_types(id),
    data        JSONB NOT NULL, -- validated server-side against log_types.field_schema
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_log_entries_log_type ON log_entries(log_type_id);

-- ============================================================
-- Attachments — one polymorphic table for every entity type, all
-- SharePoint Graph API wiring stays in one backend module.
-- ============================================================

CREATE TABLE attachments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type    TEXT NOT NULL, -- e.g. 'inventory_item', 'delivery', 'drawing_revision', 'log_entry'
    entity_id      UUID NOT NULL,
    file_name      TEXT NOT NULL,
    graph_drive_id TEXT, -- SharePoint document library pointer
    graph_item_id  TEXT,
    uploaded_by    UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
