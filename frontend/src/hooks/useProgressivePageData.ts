"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, pagePayload, streamRequest } from "@/lib/api";
import { FilterState } from "@/lib/types";
import { hasAnyFilter, makeCacheKey } from "@/lib/transforms";
import { PAGE_ENDPOINT_MAP, PAGE_DATA_CACHE_MAX } from "@/lib/constants";

// Pages that have a KPI block and support per-chart streaming
const STREAM_PATH_MAP: Record<string, string> = {
  home:                "/api/pages/home/stream",
  pipeline:            "/api/pages/pipeline/stream",
  "drug-detail":       "/api/pages/drug-detail/stream",
  "drug-pricing":      "/api/pages/drug-pricing/stream",
  "market-access":     "/api/pages/market-access/stream",
  "real-world-safety": "/api/pages/real-world-safety/stream",
  sponsors:            "/api/pages/sponsors/stream",
  "trial-design":      "/api/pages/trial-design/stream",
  endpoints:           "/api/pages/planned-endpoints/stream",
  outcomes:            "/api/pages/reported-outcomes/stream",
  scores:              "/api/pages/outcome-scores/stream",
  "pro-overview":      "/api/pages/pro-overview/stream",
  "trial-groups":      "/api/pages/trial-groups/stream",
  safety:              "/api/pages/safety/stream",
};

function writeCache(
  ref: React.MutableRefObject<Map<string, Record<string, unknown>>>,
  key: string,
  value: Record<string, unknown>,
): void {
  if (ref.current.size >= PAGE_DATA_CACHE_MAX) {
    const oldest = ref.current.keys().next().value;
    if (oldest !== undefined) ref.current.delete(oldest);
  }
  ref.current.set(key, value);
}

export function useProgressivePageData(params: {
  pageKey: string;
  filters: FilterState;
  authenticated: boolean;
  marketAccessYear: number;
}) {
  const { pageKey, filters, authenticated, marketAccessYear } = params;

  const [partialData, setPartialData] = useState<Record<string, unknown> | null>(null);
  const [kpisReady, setKpisReady] = useState(false);
  const [fullyLoaded, setFullyLoaded] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSummaries, setPageSummaries] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  const cacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  // Accumulates all stream chunks so the final full object can be cached
  const accumulatedRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    setPageSummaries({});
  }, [filters, marketAccessYear]);

  useEffect(() => {
    if (!authenticated) return;

    // Reset any stale loading state from a previous page's aborted fetch.
    // Without this, switching away from a loading non-streaming page leaves
    // pageLoading=true (the .finally guard skips the reset on abort).
    setPageLoading(false);

    const isMarketAccess = pageKey === "market-access";
    const extra = isMarketAccess ? { year: marketAccessYear } : undefined;
    const streamPath = STREAM_PATH_MAP[pageKey];
    const config = isMarketAccess
      ? { path: "/api/pages/market-access", extra }
      : PAGE_ENDPOINT_MAP[pageKey];

    if (!config) {
      setPartialData(null);
      setKpisReady(false);
      setFullyLoaded(false);
      return;
    }

    const cacheKey = makeCacheKey(pageKey, filters, config.extra ?? extra);
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPartialData(cached);
      setKpisReady(true);
      setFullyLoaded(true);
      setPageLoading(false);
      setPageError("");
      return;
    }

    let aborted = false;
    const controller = new AbortController();
    accumulatedRef.current = {};

    setKpisReady(false);
    setFullyLoaded(false);
    setPartialData(null);
    setPageError("");

    // Non-progressive pages: existing behaviour — single request, loading spinner
    if (!streamPath) {
      if (!hasAnyFilter(filters)) {
        // No filter set — skip the API call. The page component will render its
        // own "Filter Required" state immediately via its hasAnyFilter guard.
        setPartialData(null);
        setKpisReady(true);
        setFullyLoaded(true);
        return;
      }
      setPageLoading(true);
      apiRequest<Record<string, unknown>>(config.path, {
        method: "POST",
        body: pagePayload(filters, config.extra ?? extra),
        signal: controller.signal,
      })
        .then((result) => {
          if (aborted) return;
          writeCache(cacheRef, cacheKey, result);
          setPartialData(result);
          setKpisReady(true);
          setFullyLoaded(true);
        })
        .catch((error) => {
          if (aborted || error.name === "AbortError") return;
          setPageError(error instanceof Error ? error.message : "Failed to load page data");
          setPartialData(null);
        })
        .finally(() => {
          if (!aborted) setPageLoading(false);
        });
      return () => {
        aborted = true;
        controller.abort();
      };
    }

    // Progressive pages: open NDJSON stream, merge each chunk as it arrives
    const body = pagePayload(filters, config.extra ?? extra);

    streamRequest(streamPath, body, controller.signal, (chunk) => {
      if (aborted) return;
      accumulatedRef.current = { ...accumulatedRef.current, ...chunk };
      setPartialData((prev) => ({ ...(prev ?? {}), ...chunk }));
      if (chunk.kpis !== undefined) setKpisReady(true);
    })
      .then(() => {
        if (aborted) return;
        writeCache(cacheRef, cacheKey, accumulatedRef.current);
        setKpisReady(true);
        setFullyLoaded(true);
      })
      .catch((error) => {
        if (aborted || error.name === "AbortError") return;
        setPageError(error instanceof Error ? error.message : "Failed to load page data");
        setKpisReady(true);   // show whatever partial data arrived
        setFullyLoaded(true); // stop skeletons from sticking on error
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [authenticated, pageKey, filters, marketAccessYear]);

  async function requestSummary(summaryPageKey: string, year?: number) {
    setSummaryLoading(true);
    try {
      const result = await apiRequest<{ summary: string }>(
        `/api/ai/page-summary/${summaryPageKey}`,
        {
          method: "POST",
          body: pagePayload(
            filters,
            summaryPageKey === "market-access" ? { year: year ?? marketAccessYear } : undefined,
          ),
        },
      );
      setPageSummaries((prev) => ({ ...prev, [summaryPageKey]: result.summary }));
    } finally {
      setSummaryLoading(false);
    }
  }

  return {
    partialData,
    kpisReady,
    fullyLoaded,
    pageLoading,
    pageError,
    pageSummaries,
    summaryLoading,
    requestSummary,
  };
}
