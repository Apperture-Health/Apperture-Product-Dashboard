"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { AuthSession, FilterOptions, FilterState } from "@/lib/types";
import { defaultFilters, emptyOptions } from "@/lib/constants";

export function useFilters(session: AuthSession | null) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(emptyOptions);
  const [filtersLoading, setFiltersLoading] = useState(false);

  useEffect(() => {
    if (!session?.authenticated) return;
    setFiltersLoading(true);
    const params = new URLSearchParams();
    if (filters.indication_name) params.set("indication_name", filters.indication_name);
    if (filters.atc_class_name) params.set("atc_class_name", filters.atc_class_name);
    apiRequest<FilterOptions>(`/api/filters/options?${params.toString()}`)
      .then(setFilterOptions)
      .finally(() => setFiltersLoading(false));
  }, [session?.authenticated, filters.indication_name, filters.atc_class_name]);

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((previous) => {
      const next = { ...previous, [key]: value };
      // Only cascade-clear downstream filters when a global filter actually changes value.
      // Without this guard, selecting a drug class after AI-applied filters would wipe
      // phase/status/etc even though the indication hasn't changed.
      const globalChanged =
        (key === "indication_name" && value !== previous.indication_name) ||
        (key === "atc_class_name" && value !== previous.atc_class_name);
      if (globalChanged) {
        return {
          ...next,
          sponsor: [],
          sponsor_agency_class: [],
          brand_name: [],
          drug_indication: null,
          study_type: [],
          phase: [],
          overall_status: [],
          country: [],
          endpoint_category: [],
          outcome_type: [],
          pro_instrument: [],
          pro_domain: [],
          ae_organ_system: [],
          ae_term: [],
          has_results: null,
          enrollment_min: null,
          enrollment_max: null,
        };
      }
      return next;
    });
  }

  function resetFilters(allowedIndications?: string[] | null, allowedAtcClasses?: string[] | null) {
    setFilters({
      ...defaultFilters,
      allowed_indications: allowedIndications ?? null,
      allowed_atc_classes: allowedAtcClasses ?? null,
    });
  }

  function applyExtracted(extracted: Record<string, unknown>) {
    setFilters((previous) => {
      const rawIndication = typeof extracted.indication === "string" ? extracted.indication : null;
      // Only apply if the value exists in the dropdown's option list. An unrecognised value
      // leaves the <select> in an invalid state and can fire a spurious onChange on the next
      // re-render, which cascades through updateFilter and wipes phase/status/etc.
      const indication =
        rawIndication && filterOptions.indications.includes(rawIndication)
          ? rawIndication
          : previous.indication_name;

      const rawAtcClass = typeof extracted.atc_class === "string" ? extracted.atc_class : null;
      const atcClass =
        rawAtcClass && filterOptions.atc_classes.includes(rawAtcClass)
          ? rawAtcClass
          : previous.atc_class_name;

      return {
        ...previous,
        indication_name: indication,
        atc_class_name: atcClass,
        sponsor: Array.isArray(extracted.sponsors) ? (extracted.sponsors as string[]) : [],
        phase: Array.isArray(extracted.phases) ? (extracted.phases as string[]) : [],
        overall_status: Array.isArray(extracted.statuses) ? (extracted.statuses as string[]) : [],
        country: Array.isArray(extracted.countries) ? (extracted.countries as string[]) : [],
        sponsor_agency_class: Array.isArray(extracted.agency_class) ? (extracted.agency_class as string[]) : [],
        has_results: typeof extracted.has_results === "boolean" ? extracted.has_results : null,
      };
    });
  }

  return { filters, filterOptions, filtersLoading, updateFilter, resetFilters, applyExtracted };
}
