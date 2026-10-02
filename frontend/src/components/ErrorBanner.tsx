import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { useErrorFeedback } from "./FeedbackProvider";

export function ErrorBanner({ message }: { message: string }) {
  const publish = useErrorFeedback();
  useEffect(() => { if (message) publish(message); }, [message, publish]);
  return <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 shrink-0" size={18} /><div className="min-w-0 break-words"><p className="font-semibold">Precisamos da sua atenção</p><p className="mt-1">{message}</p></div></div>;
}
