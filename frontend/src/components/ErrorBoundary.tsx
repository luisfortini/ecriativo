import React from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Erro fatal no frontend", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
          <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase text-red-600">Erro ao carregar a interface</p>
            <h1 className="mt-2 text-2xl font-bold">O frontend iniciou, mas encontrou um erro.</h1>
            <p className="mt-3 text-sm text-slate-600">{this.state.error.message}</p>
            <p className="mt-4 text-xs text-slate-500">Verifique a variável VITE_API_URL e o console do navegador.</p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
