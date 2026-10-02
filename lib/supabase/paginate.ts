/**
 * Reads every row of a query in stable pages (audit H1). PostgREST caps a single response at
 * the project's max-rows setting, so an unpaginated global scan silently drops rows above it.
 * `buildPage` must apply a deterministic order (e.g. by primary key) before the range.
 * The offset advances by the rows actually returned and stops only on an empty page, so a
 * server cap smaller than `pageSize` cannot end the scan early.
 */
export const DEFAULT_PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PageResult<T>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    if (page.length === 0) return { data: rows, error: null };
    rows.push(...page);
    from += page.length;
  }
}
