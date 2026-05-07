import { FilterState, KeyValueRecord } from "@/lib/types";

export type PageProps = {
  filters: FilterState;
  pageData: Record<string, unknown> | null;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  pageSummaries: Record<string, string>;
  summaryLoading: boolean;
  requestSummary: (pageKey: string, year?: number) => Promise<void>;
};

export function toRecs(input: unknown): KeyValueRecord[] {
  if (!Array.isArray(input)) return [];
  return input as KeyValueRecord[];
}
