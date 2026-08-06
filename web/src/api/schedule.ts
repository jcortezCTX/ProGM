import { apiFetch, buildQueryString } from "./client";
import type {
  ScheduleActivity,
  ScheduleActivityDetail,
  ScheduleActivityFilters,
  ScheduleActivityInput,
  ScheduleDayOverrideOp,
  ScheduleGanttResponse,
  ScheduleHoliday,
  ScheduleHolidayInput,
  ScheduleSection,
  ScheduleSectionInput,
} from "./types";

// ---- Sections ----

export function listSections(): Promise<{ data: ScheduleSection[] }> {
  return apiFetch("/schedule/sections");
}

export function createSection(input: ScheduleSectionInput): Promise<ScheduleSection> {
  return apiFetch("/schedule/sections", { method: "POST", body: JSON.stringify(input) });
}

export function updateSection(id: string, input: Partial<ScheduleSectionInput>): Promise<ScheduleSection> {
  return apiFetch(`/schedule/sections/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteSection(id: string): Promise<void> {
  return apiFetch(`/schedule/sections/${id}`, { method: "DELETE" });
}

export function reorderSections(ids: string[]): Promise<{ data: ScheduleSection[] }> {
  return apiFetch("/schedule/sections/order", { method: "PUT", body: JSON.stringify(ids) });
}

// ---- Activities ----

export function listActivities(filters: ScheduleActivityFilters = {}): Promise<{ data: ScheduleActivity[] }> {
  return apiFetch(`/schedule/activities${buildQueryString(filters)}`);
}

export function getActivity(id: string): Promise<ScheduleActivityDetail> {
  return apiFetch(`/schedule/activities/${id}`);
}

export function createActivity(input: ScheduleActivityInput): Promise<ScheduleActivity> {
  return apiFetch("/schedule/activities", { method: "POST", body: JSON.stringify(input) });
}

export function updateActivity(id: string, input: ScheduleActivityInput): Promise<ScheduleActivity> {
  return apiFetch(`/schedule/activities/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteActivity(id: string): Promise<void> {
  return apiFetch(`/schedule/activities/${id}`, { method: "DELETE" });
}

export function updateActivityDays(id: string, ops: ScheduleDayOverrideOp[]): Promise<ScheduleActivityDetail> {
  return apiFetch(`/schedule/activities/${id}/days`, { method: "PUT", body: JSON.stringify(ops) });
}

// ---- Holidays ----

export function listHolidays(): Promise<{ data: ScheduleHoliday[] }> {
  return apiFetch("/schedule/holidays");
}

export function createHoliday(input: ScheduleHolidayInput): Promise<ScheduleHoliday> {
  return apiFetch("/schedule/holidays", { method: "POST", body: JSON.stringify(input) });
}

export function deleteHoliday(id: string): Promise<void> {
  return apiFetch(`/schedule/holidays/${id}`, { method: "DELETE" });
}

// ---- Gantt ----

export function getGantt(params: { start?: string; weeks?: number } = {}): Promise<ScheduleGanttResponse> {
  return apiFetch(`/schedule/gantt${buildQueryString(params)}`);
}
