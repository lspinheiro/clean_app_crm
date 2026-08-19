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

/**
 * Every read and every RPC is held open until the test answers it by index.
 *
 * Interaction bugs on these screens are about *when* answers arrive relative to each
 * other — a second card re-enabling mid-flight, an older read landing after a newer one —
 * so a mock that resolves immediately cannot express them.
 */
export function createSupabaseHarness<Row>() {
  const reads: Array<ReturnType<typeof deferred<ReadResult<Row>>>> = [];
  const calls: Array<{
    fn: string;
    args: Record<string, unknown>;
    gate: ReturnType<typeof deferred<RpcResult>>;
  }> = [];

  const from = vi.fn(() => ({
    select: () => ({
      order: () => {
        const gate = deferred<ReadResult<Row>>();
        reads.push(gate);
        return gate.promise;
      },
    }),
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

  async function answerRpc(index: number, result: RpcResult) {
    await waitFor(() => expect(calls.length).toBeGreaterThan(index));
    await act(async () => {
      calls[index].gate.resolve(result);
    });
  }

  return { from, rpc, reads, calls, answerRead, answerRpc, signOut: vi.fn() };
}
