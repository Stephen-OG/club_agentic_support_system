import type { CommandRequestPriority } from "./auth/types";
import { sortOperationsQueue } from "./operations-workflow";
import { getPriorityLabel, getVisibleRequestPriority, type VisibleRequestPriority } from "./priority-display";

export type OperationsVisiblePriority = VisibleRequestPriority;
export type OperationsDateRange = "all" | "today" | "yesterday" | "last_7_days" | "last_30_days" | "custom";
export type OperationsSortBy = "queue" | "newest" | "oldest" | "priority" | "rating" | "table" | "wait";
export type OperationsSortDirection = "asc" | "desc";

export type OperationsFilters = {
  categories: string[];
  customEnd: string;
  customStart: string;
  dateRange: OperationsDateRange;
  priorities: OperationsVisiblePriority[];
  rating: number | "all";
  sortBy: OperationsSortBy;
  sortDirection: OperationsSortDirection;
  tableQuery: string;
};

type FilterableRequest = {
  category: string;
  createdAt: string;
  priority: CommandRequestPriority | string;
  satisfactionRating?: number | null;
  servicePoint?: { label?: string | null } | null;
};

export const defaultOperationsFilters: OperationsFilters = {
  categories: [],
  customEnd: "",
  customStart: "",
  dateRange: "all",
  priorities: [],
  rating: "all",
  sortBy: "queue",
  sortDirection: "asc",
  tableQuery: ""
};

export function getOperationsPriorityLabel(priority: string) {
  return getPriorityLabel(priority);
}

export function normalizeOperationsPriority(priority: string): OperationsVisiblePriority {
  return getVisibleRequestPriority(priority);
}

export function runOperationsFilterPipeline<T extends FilterableRequest>(
  requests: readonly T[],
  filters: OperationsFilters,
  now = new Date()
) {
  return sortFilteredRequests(
    requests.filter((request) => matchesOperationsFilters(request, filters, now)),
    filters
  );
}

export function getOperationsFilterOptions(requests: readonly FilterableRequest[]) {
  return {
    categories: uniqueSorted(requests.map((request) => request.category).filter(Boolean)),
    tables: uniqueSorted(requests.map((request) => request.servicePoint?.label || "").filter(Boolean))
  };
}

export function getOperationsFilterChips(filters: OperationsFilters) {
  const chips: string[] = [];

  if (filters.dateRange !== "all") {
    chips.push(`Date: ${dateRangeLabel(filters.dateRange)}`);
  }

  if (filters.rating !== "all") {
    chips.push(`Rating: ${filters.rating} ${filters.rating === 1 ? "star" : "stars"}`);
  }

  if (filters.priorities.length === 1) {
    chips.push(`Priority: ${getOperationsPriorityLabel(filters.priorities[0])}`);
  } else if (filters.priorities.length > 1) {
    chips.push(`Priority: ${filters.priorities.length} selected`);
  }

  if (filters.categories.length === 1) {
    chips.push(`Type: ${titleCase(filters.categories[0])}`);
  } else if (filters.categories.length > 1) {
    chips.push(`Types: ${filters.categories.length} selected`);
  }

  if (filters.tableQuery.trim()) {
    chips.push(`Table: ${filters.tableQuery.trim()}`);
  }

  if (filters.sortBy !== "queue") {
    chips.push(`Sort: ${sortLabel(filters.sortBy, filters.sortDirection)}`);
  }

  return chips;
}

export function hasActiveOperationsFilters(filters: OperationsFilters) {
  return getOperationsFilterChips(filters).length > 0;
}

function matchesOperationsFilters(request: FilterableRequest, filters: OperationsFilters, now: Date) {
  if (!matchesDateRange(request.createdAt, filters, now)) {
    return false;
  }

  if (filters.rating !== "all" && request.satisfactionRating !== filters.rating) {
    return false;
  }

  if (filters.priorities.length > 0 && !filters.priorities.includes(normalizeOperationsPriority(request.priority))) {
    return false;
  }

  if (filters.categories.length > 0 && !filters.categories.includes(request.category)) {
    return false;
  }

  const tableQuery = filters.tableQuery.trim().toLowerCase();
  if (tableQuery && !(request.servicePoint?.label || "").toLowerCase().includes(tableQuery)) {
    return false;
  }

  return true;
}

function matchesDateRange(createdAt: string, filters: OperationsFilters, now: Date) {
  if (filters.dateRange === "all") {
    return true;
  }

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }

  if (filters.dateRange === "custom") {
    const start = filters.customStart ? startOfDay(new Date(filters.customStart)) : null;
    const end = filters.customEnd ? endOfDay(new Date(filters.customEnd)) : null;
    return (!start || created >= start) && (!end || created <= end);
  }

  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  if (filters.dateRange === "today") {
    return created >= today && created < tomorrow;
  }

  if (filters.dateRange === "yesterday") {
    const yesterday = addDays(today, -1);
    return created >= yesterday && created < today;
  }

  const days = filters.dateRange === "last_7_days" ? 6 : 29;
  return created >= addDays(today, -days) && created < tomorrow;
}

function sortFilteredRequests<T extends FilterableRequest>(requests: T[], filters: OperationsFilters) {
  if (filters.sortBy === "queue") {
    return sortOperationsQueue(requests);
  }

  const direction = filters.sortDirection === "asc" ? 1 : -1;
  return [...requests].sort((left, right) => compareRequests(left, right, filters.sortBy) * direction);
}

function compareRequests(left: FilterableRequest, right: FilterableRequest, sortBy: OperationsSortBy) {
  if (sortBy === "newest") {
    return timestamp(right.createdAt) - timestamp(left.createdAt);
  }

  if (sortBy === "oldest") {
    return timestamp(left.createdAt) - timestamp(right.createdAt);
  }

  if (sortBy === "wait") {
    return timestamp(right.createdAt) - timestamp(left.createdAt);
  }

  if (sortBy === "priority") {
    return priorityRank(right.priority) - priorityRank(left.priority);
  }

  if (sortBy === "rating") {
    return (right.satisfactionRating ?? 0) - (left.satisfactionRating ?? 0);
  }

  if (sortBy === "table") {
    return (left.servicePoint?.label || "").localeCompare(right.servicePoint?.label || "", undefined, { numeric: false });
  }

  return 0;
}

function priorityRank(priority: string) {
  return { NORMAL: 0, HIGH: 1, URGENT: 2 }[normalizeOperationsPriority(priority)];
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateRangeLabel(value: OperationsDateRange) {
  return {
    all: "All dates",
    custom: "Custom",
    last_30_days: "Last 30 days",
    last_7_days: "Last 7 days",
    today: "Today",
    yesterday: "Yesterday"
  }[value];
}

function sortLabel(sortBy: OperationsSortBy, direction: OperationsSortDirection) {
  if (sortBy === "rating") {
    return direction === "desc" ? "Rating high to low" : "Rating low to high";
  }

  if (sortBy === "priority") {
    return direction === "desc" ? "Priority high to low" : "Priority low to high";
  }

  if (sortBy === "table") {
    return direction === "desc" ? "Table Z to A" : "Table A to Z";
  }

  if (sortBy === "wait") {
    return direction === "desc" ? "Longest wait" : "Shortest wait";
  }

  return sortBy === "newest" ? "Newest first" : sortBy === "oldest" ? "Oldest first" : "Queue order";
}
