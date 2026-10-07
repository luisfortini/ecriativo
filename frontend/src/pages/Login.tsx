import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, CalendarDays, Check, ChevronDown, Eye, EyeOff, HelpCircle, LoaderCircle, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const requestedDestination = location.state?.from;
  const destination = typeof requestedDestination === "string" && requestedDestination.startsWith("/") && !requestedDestination.startsWith("//") && requestedDestination.split(/[?#]/)[0] !== "/login"
    ? requestedDestination : "/";

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  if (!loading && user) return <Navigate to={destination} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting || loading) return;
    setSubmitting(true);
    setError("");

    try {
      await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof Error
        ? (err.message === "Failed to fetch" ? "Não conseguimos conectar ao servidor. Verifique sua conexão e tente novamente." : err.message)
        : "Não foi possível entrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-story-title">
        <div className="login-wordmark">e<span>·</span>Criativo<span className="login-wordmark-dot">.</span></div>
        <div className="login-story-content">
          <p className="login-eyebrow"><Sparkles size={15} aria-hidden="true" /> Seu estúdio de criação com IA</p>
          <h2 id="login-story-title">Sua marca.<br />{" "}Boas ideias.<br />{" "}<span>Um próximo passo.</span></h2>
          <p className="login-story-description">Transforme ideias em conteúdo e anúncios, com a identidade da sua marca e orientação em cada etapa.</p>
          <div className="login-workflow" aria-hidden="true">
            <div className="login-workflow-heading"><span>DA IDEIA À PUBLICAÇÃO</span><Sparkles size={17} /></div>
            <div className="login-workflow-step"><span className="login-step-icon"><Check size={18} /></span><div><strong>Prepare sua marca</strong><small>A sua identidade é o ponto de partida.</small></div><span className="login-step-number">01</span></div>
            <div className="login-workflow-step login-workflow-featured"><span className="login-step-icon"><Sparkles size={18} /></span><div><strong>Crie com direção</strong><small>Conteúdo e anúncios que fazem sentido.</small></div><span className="login-step-number">02</span></div>
            <div className="login-workflow-step"><span className="login-step-icon"><CalendarDays size={18} /></span><div><strong>Revise e planeje</strong><small>Você decide o que vai para o mundo.</small></div><span className="login-step-number">03</span></div>
          </div>
        </div>
        <p className="login-story-footer">Mais clareza para criar. Mais espaço para crescer.</p>
      </section>

      <section className="login-access" aria-labelledby="login-title">
        <div className="login-company"><img src="/brand/logo-dark.png" alt="e-Fortini" /></div>
        <div className="login-form-container">
          <div className="login-welcome-icon"><Sparkles size={23} aria-hidden="true" /></div>
          <p className="login-form-eyebrow">BEM-VINDO AO E-CRIATIVO</p>
          <h1 id="login-title">Vamos criar algo bom?</h1>
          <p className="login-intro">Entre na sua conta para cuidar da sua marca ou das marcas dos seus clientes.</p>

          <form className="login-form" onSubmit={submit} aria-busy={submitting || loading}>
            <div>
              <label htmlFor="email">Seu e-mail</label>
              <div className="login-input-wrap"><Mail size={19} aria-hidden="true" /><input autoComplete="username" className="login-input" id="email" name="email" onChange={event => setEmail(event.target.value)} placeholder="voce@empresa.com" required type="email" value={email} disabled={submitting} autoCapitalize="none" spellCheck={false} /></div>
            </div>
            <div>
              <label htmlFor="password">Sua senha</label>
              <div className="login-input-wrap"><LockKeyhole size={19} aria-hidden="true" /><input autoComplete="current-password" className="login-input" id="password" name="password" onChange={event => setPassword(event.target.value)} onKeyDown={event => setCapsLock(event.getModifierState("CapsLock"))} onKeyUp={event => setCapsLock(event.getModifierState("CapsLock"))} onBlur={() => setCapsLock(false)} placeholder="Digite sua senha" required type={showPassword ? "text" : "password"} value={password} disabled={submitting} aria-describedby={capsLock ? "login-caps-lock" : undefined} /><button className="login-password-toggle" type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
              {capsLock && <p id="login-caps-lock" className="login-caps-lock" role="status">Caps Lock está ativado. Confira as letras maiúsculas.</p>}
            </div>
            {error && <div className="login-error" ref={errorRef} tabIndex={-1} role="alert"><AlertCircle size={19} aria-hidden="true" /><div><strong>Não foi possível entrar</strong><p>{error}</p></div></div>}
            <button className="login-submit" disabled={submitting || loading} type="submit">{submitting || loading ? <><LoaderCircle size={19} className="animate-spin" aria-hidden="true" />{submitting ? "Entrando no seu estúdio…" : "Verificando seu acesso…"}</> : <>Entrar no meu estúdio <ArrowRight size={19} aria-hidden="true" /></>}</button>
          </form>

          <details className="login-help"><summary><HelpCircle size={17} aria-hidden="true" /> Precisa de ajuda para entrar? <ChevronDown size={16} className="login-help-chevron" aria-hidden="true" /></summary><p>Use o e-mail cadastrado pela sua equipe. Se esqueceu a senha ou ainda não tem acesso, peça ajuda ao administrador da sua conta.</p></details>
        </div>
        <p className="login-access-footer">Tecnologia e criatividade, do seu lado.<span>e-Fortini · e-Criativo</span></p>
      </section>
    </main>
  );
}
