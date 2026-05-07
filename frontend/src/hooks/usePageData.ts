"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, pagePayload } from "@/lib/api";
import { FilterState } from "@/lib/types";
import { makeCacheKey } from "@/lib/transforms";
import { PAGE_ENDPOINT_MAP, PAGE_DATA_CACHE_MAX } from "@/lib/constants";

export function usePageData(params: {
  pageKey: string;
  filters: FilterState;
  authenticated: boolean;
  marketAccessYear: number;
}) {
  const { pageKey, filters, authenticated, marketAccessYear } = params;

  const [pageData, setPageData] = useState<Record<string, unknown> | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSummaries, setPageSummaries] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const cacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  useEffect(() => {
    setPageSummaries({});
  }, [filters, marketAccessYear]);

  useEffect(() => {
    if (!authenticated) return;

    const isMarketAccess = pageKey === "market-access";
    const extra = isMarketAccess ? { year: marketAccessYear } : undefined;
    const config = isMarketAccess
      ? { path: "/api/pages/market-access", extra }
      : PAGE_ENDPOINT_MAP[pageKey];

    if (!config) {
      setPageData(null);
      return;
    }

    const cacheKey = makeCacheKey(pageKey, filters, config.extra ?? extra);
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPageData(cached);
      setPageError("");
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    setPageLoading(true);
    setPageError("");

    apiRequest<Record<string, unknown>>(config.path, {
      method: "POST",
      body: pagePayload(filters, config.extra ?? extra),
      signal: controller.signal,
    })
      .then((result) => {
        if (aborted) return;
        if (cacheRef.current.size >= PAGE_DATA_CACHE_MAX) {
          const oldest = cacheRef.current.keys().next().value;
          if (oldest !== undefined) cacheRef.current.delete(oldest);
        }
        cacheRef.current.set(cacheKey, result);
        setPageData(result);
      })
      .catch((error) => {
        if (aborted || error.name === "AbortError") return;
        setPageError(error instanceof Error ? error.message : "Failed to load page data");
        setPageData(null);
      })
      .finally(() => {
        if (!aborted) setPageLoading(false);
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
          body: pagePayload(filters, summaryPageKey === "market-access" ? { year: year ?? marketAccessYear } : undefined),
        }
      );
      setPageSummaries((previous) => ({ ...previous, [summaryPageKey]: result.summary }));
    } finally {
      setSummaryLoading(false);
    }
  }

  return { pageData, pageLoading, pageError, pageSummaries, summaryLoading, requestSummary };
}
