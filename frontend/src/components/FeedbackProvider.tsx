import { AlertCircle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

const FeedbackContext = createContext({publish: (_message: string) => {}, resolve: (_message: string) => {}});
export const useErrorFeedback = () => useContext(FeedbackContext).publish;
export const useResolveErrorFeedback = () => useContext(FeedbackContext).resolve;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<string[]>([]);
  const { user } = useAuth();
  useEffect(() => { setMessages([]); }, [user?.id, user?.organization.id]);
  const publish = useCallback((message: string) => {
    setMessages(current => current.includes(message) ? current : [...current, message]);
  }, []);
  const resolve = useCallback((message: string) => { setMessages(current => current.filter(item => item !== message)); }, []);
  const value = useMemo(() => ({publish, resolve}), [publish, resolve]);
  return <FeedbackContext.Provider value={value}>
    {children}
    {messages.length > 0 && <aside role="region" aria-live="polite" aria-label="Erros que precisam de atenção" className="studio-error-notice">
      <div className="flex items-center gap-2 text-sm font-semibold text-red-800"><AlertCircle size={18} /> Não foi possível concluir</div>
      <p className="mt-2 break-words text-sm text-slate-700">{messages[messages.length - 1]}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{messages.length > 1 ? `${messages.length} avisos pendentes` : "O aviso permanece até você fechar."}</span>
        <button type="button" className="btn-secondary shrink-0" onClick={() => setMessages(current => current.slice(0, -1))}><X size={16} /> Fechar</button>
      </div>
    </aside>}
  </FeedbackContext.Provider>;
}
