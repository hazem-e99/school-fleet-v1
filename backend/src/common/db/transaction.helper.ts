import { Logger } from '@nestjs/common';
import { ClientSession, Connection } from 'mongoose';

/**
 * Runs a unit of work atomically when the MongoDB deployment supports
 * multi-document transactions, and sequentially (non-atomically) when it does
 * not.
 *
 * This matters because the two deployments differ: the Render/Atlas
 * deployment is a replica set and supports transactions, while the production
 * VPS runs a standalone `mongod` (no `replication:` section in its config),
 * where `session.withTransaction()` throws. Code that assumes either one
 * breaks on the other.
 *
 * The logic here was proven first in AdminSystemService.runPurge (the purge
 * feature) and is extracted so the multi-write flows added later — payment
 * accept, route-change approval, installment generation — can reuse it
 * instead of each re-inventing the fallback.
 *
 * IMPORTANT: `work` may run WITHOUT a session (the fallback path), so it must
 * be written to be correct non-atomically too:
 *   - order writes so a mid-way failure leaves a retryable state (write the
 *     financially safe record first — see StudentSubscriptionService
 *     .reviewCancellation for the established example);
 *   - make the operation idempotent (unique keys) so a retry cannot double-write;
 *   - use conditional updates (`findOneAndUpdate({ _id, status: 'Pending' })`)
 *     rather than read-then-write for concurrency guards.
 */
export interface TransactionResult<T> {
  result: T;
  /** False when the work ran on the sequential fallback path. */
  atomic: boolean;
}

/** True when the error means "this deployment has no transaction support". */
export function isTransactionsUnsupported(error: any): boolean {
  const message = String(error?.message || '');
  return (
    error?.code === 20 ||
    /Transaction numbers are only allowed/i.test(message) ||
    /Transactions are not supported/i.test(message) ||
    /replica set/i.test(message)
  );
}

export async function runInTransaction<T>(
  connection: Connection,
  work: (session?: ClientSession) => Promise<T>,
  options?: { logger?: Logger; label?: string },
): Promise<TransactionResult<T>> {
  const logger = options?.logger;
  const label = options?.label ?? 'operation';

  const session = await connection.startSession();
  try {
    let result: T | undefined;
    let didRun = false;
    await session.withTransaction(async () => {
      result = await work(session);
      didRun = true;
    });
    if (!didRun) {
      // withTransaction resolved without the body completing — treat as failure
      // rather than returning an undefined result to the caller.
      throw new Error(`Transaction for ${label} completed without running its body.`);
    }
    return { result: result as T, atomic: true };
  } catch (error: any) {
    if (isTransactionsUnsupported(error)) {
      logger?.warn(
        `MongoDB deployment does not support multi-document transactions (likely a standalone instance) — running ${label} sequentially without atomicity.`,
      );
      const result = await work(undefined);
      return { result, atomic: false };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
