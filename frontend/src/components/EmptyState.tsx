import type { ReactNode } from "react";

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="panel flex min-h-64 items-center justify-center p-8 text-center text-sm text-slate-600">{children}</div>;
}
