import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";

export function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!loading && user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await login(email, password);
      const destination = typeof location.state?.from === "string" ? location.state.from : "/";
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <img
          src="/brand/logo-dark.png"
          alt="e-Criativo"
          className="mx-auto h-14 w-auto max-w-[220px] object-contain"
        />
        <div className="mt-8">
          <h1 className="text-2xl font-bold text-ink">Entrar</h1>
          <p className="mt-2 text-sm text-slate-500">Acesse o painel do e-Criativo.</p>
        </div>

        {error && <div className="mt-5"><ErrorBanner message={error} /></div>}

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input
              autoComplete="email"
              autoFocus
              className="field"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input
              autoComplete="current-password"
              className="field"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          <button
            className="w-full rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting || loading}
            type="submit"
          >
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
