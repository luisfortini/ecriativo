import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="studio-page-header">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}
