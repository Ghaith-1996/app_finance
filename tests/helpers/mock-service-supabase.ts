type Row = Record<string, unknown>;

export type MockDatabase = {
  user_notification_preferences?: Row[];
  notification_digests?: Row[];
  notification_deliveries?: Row[];
  portfolios?: Row[];
  analysis_runs?: Row[];
  feed_items?: Row[];
  watchlist_items?: Row[];
  news_items?: Row[];
};

type MockUserRecord = {
  email?: string | null;
};

function getValue(row: Row, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, row);
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

function matchesFilter(row: Row, type: "eq" | "in" | "gte" | "lte", key: string, value: unknown): boolean {
  const actual = getValue(row, key);

  if (type === "eq") return actual === value;
  if (type === "in") return Array.isArray(value) && value.includes(actual);
  if (type === "gte") {
    if (typeof actual === "string" && typeof value === "string") {
      return new Date(actual).getTime() >= new Date(value).getTime();
    }
    return compareValues(actual, value) >= 0;
  }
  if (typeof actual === "string" && typeof value === "string") {
    return new Date(actual).getTime() <= new Date(value).getTime();
  }
  return compareValues(actual, value) <= 0;
}

function ensureDefaults(table: string, row: Row, index: number): Row {
  const clone = { ...row };
  const now = new Date(2026, 0, 1, 12, 0, index).toISOString();

  if (!clone.id) {
    clone.id = `${table}-${index + 1}`;
  }
  if (table === "notification_digests" && !clone.created_at) {
    clone.created_at = now;
  }
  if (table === "notification_deliveries" || table === "user_notification_preferences") {
    if (!clone.created_at) clone.created_at = now;
    if (!clone.updated_at) clone.updated_at = now;
  }

  return clone;
}

export function createMockServiceSupabase(input: {
  db?: MockDatabase;
  users?: Record<string, MockUserRecord>;
}) {
  const db: Record<string, Row[]> = {
    user_notification_preferences: [],
    notification_digests: [],
    notification_deliveries: [],
    portfolios: [],
    analysis_runs: [],
    feed_items: [],
    watchlist_items: [],
    news_items: [],
    ...Object.fromEntries(
      Object.entries(input.db ?? {}).map(([table, rows]) => [
        table,
        (rows ?? []).map((row, index) => ensureDefaults(table, row, index)),
      ]),
    ),
  };
  const users = input.users ?? {};

  function tableRows(table: string): Row[] {
    if (!db[table]) {
      db[table] = [];
    }
    return db[table];
  }

  function selectBuilder(table: string) {
    const state = {
      filters: [] as Array<{ type: "eq" | "in" | "gte" | "lte"; key: string; value: unknown }>,
      order: null as null | { key: string; ascending: boolean },
      limit: null as number | null,
      range: null as null | [number, number],
      anyOf: [] as Array<Array<{ key: string; value: unknown }>>,
    };

    const apply = () => {
      let rows = [...tableRows(table)];

      for (const filter of state.filters) {
        rows = rows.filter((row) =>
          matchesFilter(row, filter.type, filter.key, filter.value),
        );
      }

      if (state.order) {
        rows.sort((left, right) => {
          const result = compareValues(
            getValue(left, state.order!.key),
            getValue(right, state.order!.key),
          );
          return state.order!.ascending ? result : -result;
        });
      }

      for (const group of state.anyOf) {
        rows = rows.filter((row) => group.some(({ key, value }) => getValue(row, key) === value));
      }

      if (state.limit != null) {
        rows = rows.slice(0, state.limit);
      }

      if (state.range) {
        rows = rows.slice(state.range[0], state.range[1] + 1);
      }

      return rows;
    };

    const builder = {
      eq(key: string, value: unknown) {
        state.filters.push({ type: "eq", key, value });
        return builder;
      },
      in(key: string, value: unknown[]) {
        state.filters.push({ type: "in", key, value });
        return builder;
      },
      gte(key: string, value: unknown) {
        state.filters.push({ type: "gte", key, value });
        return builder;
      },
      lte(key: string, value: unknown) {
        state.filters.push({ type: "lte", key, value });
        return builder;
      },
      order(key: string, options?: { ascending?: boolean }) {
        state.order = { key, ascending: options?.ascending ?? true };
        return builder;
      },
      limit(value: number) {
        state.limit = value;
        return builder;
      },
      range(from: number, to: number) {
        state.range = [from, to];
        return builder;
      },
      // Supports the "col.eq.true,col2.eq.false" form used by the services.
      or(expression: string) {
        state.anyOf.push(
          expression.split(",").map((part) => {
            const [key, , raw] = part.split(".");
            const value = raw === "true" ? true : raw === "false" ? false : raw;
            return { key, value };
          }),
        );
        return builder;
      },
      maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
      single: async () => {
        const row = apply()[0] ?? null;
        return {
          data: row,
          error: row ? null : { message: "Not found" },
        };
      },
      then(
        onFulfilled: (value: { data: Row[]; error: null }) => unknown,
      ) {
        return Promise.resolve({ data: apply(), error: null }).then(onFulfilled);
      },
    };

    return builder;
  }

  // Emulates claim_notification_delivery / complete_notification_delivery (037). Each call runs to
  // completion synchronously, which mirrors the row lock the SQL functions take.
  function rpc(name: string, params: Row) {
    const deliveries = tableRows("notification_deliveries");
    const find = () =>
      deliveries.find((row) => row.digest_id === params.p_digest_id && row.channel === params.p_channel);
    const nowIso = new Date().toISOString();

    if (name === "claim_notification_delivery") {
      const maxAttempts = Number(params.p_max_attempts ?? 3);
      const staleMs = Number(String(params.p_stale_after ?? "600 seconds").split(" ")[0]) * 1000;
      const token = `claim-${Math.random().toString(36).slice(2)}`;
      const row = find();
      if (!row) {
        deliveries.push(
          ensureDefaults("notification_deliveries", {
            digest_id: params.p_digest_id,
            channel: params.p_channel,
            status: "pending",
            attempt_count: 1,
            claim_token: token,
            claimed_at: nowIso,
          }, deliveries.length),
        );
        return Promise.resolve({ data: [{ action: "send", claim_token: token, status: "pending", attempt_count: 1 }], error: null });
      }
      const attempts = Number(row.attempt_count ?? 1);
      const skip = (status: unknown) =>
        Promise.resolve({ data: [{ action: "skip", claim_token: null, status, attempt_count: attempts }], error: null });
      if (["sent", "skipped", "uncertain"].includes(String(row.status))) return skip(row.status);
      if (row.status === "pending") {
        const claimedAt = Date.parse(String(row.claimed_at ?? row.updated_at));
        if (Date.now() - claimedAt <= staleMs) return skip("pending");
        if (params.p_channel === "sms") {
          Object.assign(row, {
            status: "uncertain",
            claim_token: null,
            error_text:
              row.error_text ??
              "SMS delivery state became stale before confirmation; automatic resend was blocked to avoid duplicates.",
            updated_at: nowIso,
          });
          return skip("uncertain");
        }
      }
      if (attempts >= maxAttempts) return skip(row.status);
      Object.assign(row, { status: "pending", claim_token: token, claimed_at: nowIso, attempt_count: attempts + 1, updated_at: nowIso });
      return Promise.resolve({ data: [{ action: "send", claim_token: token, status: "pending", attempt_count: attempts + 1 }], error: null });
    }

    if (name === "complete_notification_delivery") {
      const row = find();
      if (!row || row.status !== "pending" || row.claim_token !== params.p_claim_token) {
        return Promise.resolve({ data: false, error: null });
      }
      Object.assign(row, {
        status: params.p_status,
        provider_message_id: params.p_provider_message_id,
        error_text: params.p_error_text,
        sent_at: params.p_status === "sent" ? nowIso : row.sent_at ?? null,
        claim_token: null,
        updated_at: nowIso,
      });
      return Promise.resolve({ data: true, error: null });
    }

    return Promise.resolve({ data: null, error: { message: `Unexpected rpc ${name}` } });
  }

  return {
    __db: db,
    rpc,
    auth: {
      admin: {
        getUserById: async (userId: string) => ({
          data: { user: { id: userId, email: users[userId]?.email ?? null } },
          error: null,
        }),
      },
    },
    from(table: string) {
      return {
        select: (_columns?: string) => selectBuilder(table),
        insert(payload: Row | Row[]) {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((row, index) =>
            ensureDefaults(table, row, tableRows(table).length + index),
          );

          if (table === "notification_digests") {
            const duplicate = rows.find((row) =>
              tableRows(table).some(
                (existing) =>
                  existing.user_id === row.user_id &&
                  existing.digest_date === row.digest_date,
              ),
            );
            if (duplicate) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: { message: "duplicate key", code: "23505" },
                  }),
                }),
              };
            }
          }

          tableRows(table).push(...rows);

          return {
            select: () => ({
              single: async () => ({ data: rows[0] ?? null, error: null }),
            }),
          };
        },
        upsert(payload: Row | Row[], options?: { onConflict?: string }) {
          const rows = Array.isArray(payload) ? payload : [payload];
          const keys = (options?.onConflict ?? "")
            .split(",")
            .map((key) => key.trim())
            .filter(Boolean);

          for (const row of rows) {
            const existing = tableRows(table).find((candidate) =>
              keys.every((key) => candidate[key] === row[key]),
            );

            if (existing) {
              Object.assign(existing, row, { updated_at: new Date().toISOString() });
            } else {
              tableRows(table).push(
                ensureDefaults(table, row, tableRows(table).length),
              );
            }
          }

          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}
