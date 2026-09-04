import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";

export interface DatabaseRequestContext {
  client: PoolClient;
  organizationId: number;
  userId?: number;
}

const storage = new AsyncLocalStorage<DatabaseRequestContext>();

export function getDatabaseRequestContext() {
  return storage.getStore();
}

export function runWithDatabaseRequestContext<T>(context: DatabaseRequestContext, callback: () => T) {
  return storage.run(context, callback);
}
