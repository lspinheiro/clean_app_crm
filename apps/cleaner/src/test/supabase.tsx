import { act, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export type ReadResult<Row> = { data: Row[] | null; error: { message: string } | null };
export type RpcResult<Row = unknown> = {
  data?: Row[] | null;
  error: { message: string } | null;
};
export type WriteResult = { error: { message: string } | null };

/** One `select` chain: what it asked the database for, and the gate that answers it. */
export type ReadCall<Row> = ReturnType<typeof deferred<ReadResult<Row>>> & {
  table: string;
  columns: string;
  order: { column: string; options: Record<string, unknown> | undefined } | null;
  limit: number | null;
  is: { column: string; value: unknown } | null;
};

/** One `update` chain: what it wrote, and which rows it narrowed to. */
export type UpdateCall = {
  table: string;
  values: Record<string, unknown>;
  in: { column: string; values: unknown[] } | null;
  is: { column: string; value: unknown } | null;
  gate: ReturnType<typeof deferred<WriteResult>>;
};

// A postgrest-js builder is thenable *and* chainable: the caller awaits wherever it stops
// adding clauses. The doubles below keep that shape, so a screen may add or drop a clause
// — `.limit()` on a notification bell, none on a job list — without the harness caring.
type ReadBuilder<Row> = Promise<ReadResult<Row>> & {
  order: (column: string, options?: Record<string, unknown>) => ReadBuilder<Row>;
  limit: (count: number) => ReadBuilder<Row>;
  is: (column: string, value: unknown) => ReadBuilder<Row>;
};

type UpdateBuilder = Promise<WriteResult> & {
  in: (column: string, values: readonly unknown[]) => UpdateBuilder;
  is: (column: string, value: unknown) => UpdateBuilder;
};

/**
 * Every read, every write, and every RPC is held open until the test answers it by index.
 *
 * Interaction bugs on these screens are about *when* answers arrive relative to each
 * other — a second card re-enabling mid-flight, an older read landing after a newer one,
 * a badge clearing before the write that clears it lands — so a mock that resolves
 * immediately cannot express them.
 *
 * Each call also records the query it stood for, so a suite can hold the boundary itself
 * to account: which view was read, which columns were asked for, which rows a write
 * narrowed to.
 */
export function createSupabaseHarness<Row>() {
  const reads: Array<ReadCall<Row>> = [];
  const updates: UpdateCall[] = [];
  const calls: Array<{
    fn: string;
    args: Record<string, unknown>;
    gate: ReturnType<typeof deferred<RpcResult>>;
  }> = [];

  function readBuilder(table: string, columns: string): ReadBuilder<Row> {
    const call: ReadCall<Row> = Object.assign(deferred<ReadResult<Row>>(), {
      table,
      columns,
      order: null as ReadCall<Row>["order"],
      limit: null as number | null,
      is: null as ReadCall<Row>["is"],
    });
    reads.push(call);

    const builder: ReadBuilder<Row> = Object.assign(call.promise, {
      order(column: string, options?: Record<string, unknown>) {
        call.order = { column, options };
        return builder;
      },
      limit(count: number) {
        call.limit = count;
        return builder;
      },
      is(column: string, value: unknown) {
        call.is = { column, value };
        return builder;
      },
    });

    return builder;
  }

  function updateBuilder(table: string, changes: Record<string, unknown>): UpdateBuilder {
    const call: UpdateCall = {
      table,
      values: changes,
      in: null,
      is: null,
      gate: deferred<WriteResult>(),
    };
    updates.push(call);

    const builder: UpdateBuilder = Object.assign(call.gate.promise, {
      in(column: string, values: readonly unknown[]) {
        call.in = { column, values: [...values] };
        return builder;
      },
      is(column: string, value: unknown) {
        call.is = { column, value };
        return builder;
      },
    });

    return builder;
  }

  const from = vi.fn((table: string) => ({
    select: (columns = "*") => readBuilder(table, columns),
    update: (changes: Record<string, unknown>) => updateBuilder(table, changes),
  }));

  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    const gate = deferred<RpcResult>();
    calls.push({ fn, args, gate });
    return gate.promise;
  });

  async function answerRead(
    index: number,
    rows: Row[] | null,
    error: ReadResult<Row>["error"] = null,
  ) {
    await waitFor(() => expect(reads.length).toBeGreaterThan(index));
    await act(async () => {
      reads[index].resolve({ data: rows, error });
    });
  }

  async function answerUpdate(index: number, result: WriteResult) {
    await waitFor(() => expect(updates.length).toBeGreaterThan(index));
    await act(async () => {
      updates[index].gate.resolve(result);
    });
  }

  async function answerRpc(index: number, result: RpcResult) {
    await waitFor(() => expect(calls.length).toBeGreaterThan(index));
    await act(async () => {
      calls[index].gate.resolve(result);
    });
  }

  return {
    from,
    rpc,
    reads,
    updates,
    calls,
    answerRead,
    answerUpdate,
    answerRpc,
    signOut: vi.fn(),
  };
}
