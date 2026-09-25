/**
 * Minimal chainable stand-in for the supabase-js query builder, for admin
 * component tests. Every awaited query is recorded in `state.ops` and resolved
 * by `state.respond(op)`.
 */
export type FakeOp = {
  table: string;
  action: "select" | "update" | "delete" | "insert";
  payload?: unknown;
  columns?: string;
  head?: boolean;
  filters: Array<[string, ...unknown[]]>;
};

export type FakeResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

export interface FakeState {
  ops: FakeOp[];
  respond: (op: FakeOp) => FakeResult | Promise<FakeResult>;
  rpc?: (name: string) => FakeResult;
}

const FILTERS = [
  "eq",
  "is",
  "in",
  "or",
  "order",
  "limit",
  "abortSignal",
] as const;

export function createFakeSupabase(state: FakeState) {
  const from = (table: string) => {
    const op: FakeOp = { table, action: "select", filters: [] };
    const chain: Record<string, unknown> = {
      select: (columns?: string, opts?: { head?: boolean }) => {
        if (op.action === "select") {
          op.columns = columns;
          op.head = !!opts?.head;
        } else {
          // `.update(...).select("id")` — the returning clause
          op.filters.push(["select", columns]);
        }
        return chain;
      },
      update: (payload: unknown) => {
        op.action = "update";
        op.payload = payload;
        return chain;
      },
      insert: (payload: unknown) => {
        op.action = "insert";
        op.payload = payload;
        return chain;
      },
      delete: () => {
        op.action = "delete";
        return chain;
      },
      maybeSingle: () => {
        op.filters.push(["maybeSingle"]);
        return chain;
      },
      then: (
        resolve: (r: FakeResult) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        state.ops.push(op);
        return Promise.resolve()
          .then(() => state.respond(op))
          .then(resolve, reject);
      },
    };
    for (const name of FILTERS) {
      chain[name] = (...args: unknown[]) => {
        op.filters.push([name, ...args]);
        return chain;
      };
    }
    return chain;
  };
  return {
    from,
    rpc: async (name: string) =>
      state.rpc ? state.rpc(name) : { data: null, error: null },
  };
}

export const lastOp = (state: FakeState, pred: (op: FakeOp) => boolean) =>
  [...state.ops].reverse().find(pred);
