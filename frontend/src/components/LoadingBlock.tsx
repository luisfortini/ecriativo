export function LoadingBlock({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="panel flex min-h-64 items-center justify-center p-8">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        {label}
      </div>
    </div>
  );
}
