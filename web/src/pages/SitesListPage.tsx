import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { createSite, listSites, type SiteSortField } from "../api/sites";
import type { CreateSiteInput, Site } from "../api/types";
import { DataTable } from "../components/DataTable";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import type { ColumnDef } from "../hooks/useTableColumns";

const COLUMNS: ColumnDef<Site>[] = [
  {
    key: "name",
    label: "Site",
    sortField: "name",
    render: (s) => <Link to={`/sites/${s.id}`}>{s.name}</Link>,
  },
  { key: "code", label: "Code", sortField: "code", render: (s) => s.code ?? "—" },
  { key: "description", label: "Description", render: (s) => s.description ?? "—" },
  { key: "timezone", label: "Timezone", render: (s) => s.timezone ?? "—" },
];

export function SitesListPage() {
  const [showForm, setShowForm] = useState(false);
  const { rows, hasMore, isLoading, isFetchingNextPage, error, fetchNextPage, refetch, sort, order, setSort, q, setQ } =
    useListQuery<Site, SiteSortField>({ queryKeyBase: "sites", fetchPage: listSites, defaultSort: "name" });

  async function handleCreate(input: CreateSiteInput) {
    await createSite(input);
    setShowForm(false);
    await refetch();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Sites</h1>
        <div className="page-header-actions">
          <Link to="/asset-types">Manage asset types</Link>
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add site"}
          </button>
        </div>
      </div>

      {showForm && <AddSiteForm onSubmit={handleCreate} />}

      {error && <p className="error">{error instanceof ApiError ? error.message : "Failed to load sites"}</p>}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="table-toolbar">
            <div className="table-toolbar-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search site name, code…" />
            </div>
          </div>
          <DataTable
            visibleColumns={COLUMNS}
            rows={rows}
            rowKey={(s) => s.id}
            sort={sort}
            order={order}
            onSortChange={(field) => setSort(field as SiteSortField)}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            emptyMessage={q ? "No sites match your search." : "No sites yet — add one to start placing assets."}
          />
        </>
      )}
    </div>
  );
}

function AddSiteForm({ onSubmit }: { onSubmit: (input: CreateSiteInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        code: code || undefined,
        description: description || undefined,
        timezone: timezone || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create site");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Code
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AWWTF-01" />
      </label>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Timezone
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. America/Chicago" />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save site"}
      </button>
    </form>
  );
}
