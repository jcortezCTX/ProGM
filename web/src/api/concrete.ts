import { apiDownload, apiFetch, buildQueryString, saveBlob } from "./client";
import type {
  ConcreteCredit,
  ConcreteCreditInput,
  ConcreteMixDesign,
  ConcreteMixDesignInput,
  ConcretePour,
  ConcreteSample,
  ConcreteSampleInput,
  ConcreteSettings,
  ConcreteSettingsInput,
  ConcreteStructure,
  ConcreteStructureInput,
  ConcreteSummary,
  CreatePourInput,
  ListParams,
  ListResponse,
  PumpTruckRental,
  PumpTruckRentalInput,
  UpdatePourInput,
  WeeklyReport,
} from "./types";

// ---- Pours + samples ----

export type PourSortField = "pour_date" | "created_at";

export interface PourFilters {
  month?: string;
  structure_id?: string;
  is_subcontractor?: string;
  poured_by?: string;
  pending_results?: string;
}

export function listPours(params: ListParams<PourSortField> & Partial<PourFilters> = {}): Promise<ListResponse<ConcretePour>> {
  return apiFetch(`/concrete/pours${buildQueryString(params)}`);
}

export function getPour(id: string): Promise<ConcretePour> {
  return apiFetch(`/concrete/pours/${id}`);
}

export function createPour(input: CreatePourInput): Promise<ConcretePour> {
  return apiFetch("/concrete/pours", { method: "POST", body: JSON.stringify(input) });
}

export function updatePour(id: string, input: UpdatePourInput): Promise<ConcretePour> {
  return apiFetch(`/concrete/pours/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deletePour(id: string): Promise<void> {
  return apiFetch(`/concrete/pours/${id}`, { method: "DELETE" });
}

export function addSample(pourId: string, input: ConcreteSampleInput): Promise<ConcreteSample> {
  return apiFetch(`/concrete/pours/${pourId}/samples`, { method: "POST", body: JSON.stringify(input) });
}

export function updateSample(id: string, input: ConcreteSampleInput): Promise<ConcreteSample> {
  return apiFetch(`/concrete/samples/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteSample(id: string): Promise<void> {
  return apiFetch(`/concrete/samples/${id}`, { method: "DELETE" });
}

// ---- Dashboard / weekly report ----

export function getConcreteSummary(): Promise<ConcreteSummary> {
  return apiFetch("/concrete/summary");
}

export function getWeeklyReport(weekEnding?: string): Promise<WeeklyReport> {
  return apiFetch(`/concrete/weekly-report${buildQueryString(weekEnding ? { weekEnding } : {})}`);
}

/**
 * Downloads the weekly report as a letter-portrait PDF, rendered on the API so
 * it matches for everyone regardless of browser print settings.
 */
export async function downloadWeeklyReportPdf(weekEnding?: string): Promise<void> {
  const qs = buildQueryString(weekEnding ? { weekEnding } : {});
  const { blob, filename } = await apiDownload(`/concrete/weekly-report/pdf${qs}`);
  saveBlob(blob, filename ?? "concrete-weekly-report.pdf");
}

// ---- Mix designs ----

export type MixDesignSortField = "supplier" | "mix_number" | "design_strength_psi" | "created_at";

export function listMixDesigns(
  params: ListParams<MixDesignSortField> & { active?: string } = {},
): Promise<ListResponse<ConcreteMixDesign>> {
  return apiFetch(`/concrete/mix-designs${buildQueryString(params)}`);
}

export function createMixDesign(input: ConcreteMixDesignInput): Promise<ConcreteMixDesign> {
  return apiFetch("/concrete/mix-designs", { method: "POST", body: JSON.stringify(input) });
}

export function updateMixDesign(id: string, input: ConcreteMixDesignInput): Promise<ConcreteMixDesign> {
  return apiFetch(`/concrete/mix-designs/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteMixDesign(id: string): Promise<void> {
  return apiFetch(`/concrete/mix-designs/${id}`, { method: "DELETE" });
}

// ---- Structures ----

export type StructureSortField = "name" | "created_at";

export function listStructures(params: ListParams<StructureSortField> = {}): Promise<ListResponse<ConcreteStructure>> {
  return apiFetch(`/concrete/structures${buildQueryString(params)}`);
}

export function createStructure(input: ConcreteStructureInput): Promise<ConcreteStructure> {
  return apiFetch("/concrete/structures", { method: "POST", body: JSON.stringify(input) });
}

export function updateStructure(id: string, input: ConcreteStructureInput): Promise<ConcreteStructure> {
  return apiFetch(`/concrete/structures/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteStructure(id: string): Promise<void> {
  return apiFetch(`/concrete/structures/${id}`, { method: "DELETE" });
}

// ---- Pump truck rentals ----

export type PumpTruckRentalSortField = "rental_date" | "location" | "created_at";

export function listPumpTruckRentals(
  params: ListParams<PumpTruckRentalSortField> = {},
): Promise<ListResponse<PumpTruckRental>> {
  return apiFetch(`/concrete/pump-rentals${buildQueryString(params)}`);
}

export function createPumpTruckRental(input: PumpTruckRentalInput): Promise<PumpTruckRental> {
  return apiFetch("/concrete/pump-rentals", { method: "POST", body: JSON.stringify(input) });
}

export function updatePumpTruckRental(id: string, input: PumpTruckRentalInput): Promise<PumpTruckRental> {
  return apiFetch(`/concrete/pump-rentals/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deletePumpTruckRental(id: string): Promise<void> {
  return apiFetch(`/concrete/pump-rentals/${id}`, { method: "DELETE" });
}

// ---- Credits ----

export type ConcreteCreditSortField = "date_received" | "date_approved" | "created_at";

export function listConcreteCredits(
  params: ListParams<ConcreteCreditSortField> = {},
): Promise<ListResponse<ConcreteCredit>> {
  return apiFetch(`/concrete/credits${buildQueryString(params)}`);
}

export function createConcreteCredit(input: ConcreteCreditInput): Promise<ConcreteCredit> {
  return apiFetch("/concrete/credits", { method: "POST", body: JSON.stringify(input) });
}

export function updateConcreteCredit(id: string, input: ConcreteCreditInput): Promise<ConcreteCredit> {
  return apiFetch(`/concrete/credits/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteConcreteCredit(id: string): Promise<void> {
  return apiFetch(`/concrete/credits/${id}`, { method: "DELETE" });
}

// ---- Settings ----

export function getConcreteSettings(): Promise<ConcreteSettings | null> {
  return apiFetch("/concrete/settings");
}

export function saveConcreteSettings(input: ConcreteSettingsInput): Promise<ConcreteSettings> {
  return apiFetch("/concrete/settings", { method: "PUT", body: JSON.stringify(input) });
}
