import { useEffect, useState } from 'react';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';

interface PageOf<T> { items: T[]; total: number; nextPage: number | null }

/**
 * Numbered pages (1 2 3 … >) on top of a list that is loaded page by page. It shows one page at a time; asking for a page that is not loaded yet
 * loads the pages before it. While that page arrives the previous one stays on screen, so the list does not flash empty.
 * Goes back to page 1 whenever the total changes (a new search or filter).
 */
export function usePagedView<T>(q: UseInfiniteQueryResult<InfiniteData<PageOf<T>>>) {
  const [page, setPage] = useState(1);
  const pages = q.data?.pages ?? [];
  const total = pages[0]?.total ?? 0;
  const pageSize = pages[0]?.items.length || 1;
  useEffect(() => { setPage(1); }, [total]);
  useEffect(() => {
    if (pages.length < page && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [page, pages.length, q.hasNextPage, q.isFetchingNextPage, q]);
  const shown = pages[Math.min(page, pages.length) - 1];
  return { items: shown?.items ?? [], page, setPage, total, pageSize, loadingPage: pages.length < page };
}
