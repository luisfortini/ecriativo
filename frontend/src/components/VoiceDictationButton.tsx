import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface RecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionErrorLike {
  error: string;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

export function VoiceDictationButton({ onTranscript, disabled = false }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const RecognitionApi = getRecognitionApi();

  useEffect(() => () => recognitionRef.current?.abort(), []);

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (!RecognitionApi) return;

    setError("");
    const recognition = new RecognitionApi();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcripts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal && result[0]?.transcript) transcripts.push(result[0].transcript.trim());
      }
      if (transcripts.length) onTranscriptRef.current(transcripts.join(" "));
    };
    recognition.onerror = (event) => {
      setError(recognitionErrorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Não foi possível iniciar o microfone.");
    }
  }

  const unsupported = !RecognitionApi || !window.isSecureContext;
  const title = error || (unsupported ? "Ditado por voz requer navegador compatível e conexão HTTPS." : listening ? "Parar ditado" : "Ditar em português");

  return (
    <div className="min-w-24 shrink-0">
      <button
        className={`inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${listening ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        type="button"
        disabled={disabled || unsupported}
        aria-label={title}
        aria-pressed={listening}
        title={title}
        onClick={toggle}
      >
        {listening ? <Square size={15} /> : <Mic size={16} />}
        {listening ? "Parar" : "Ditar"}
      </button>
      {error && <p className="mt-1 max-w-40 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function appendDictation(current: string, transcript: string) {
  const cleanCurrent = current.trimEnd();
  const cleanTranscript = transcript.trim();
  if (!cleanCurrent) return cleanTranscript;
  if (!cleanTranscript) return current;
  return `${cleanCurrent}${/[.!?;:]$/.test(cleanCurrent) ? " " : ". "}${cleanTranscript}`;
}

function getRecognitionApi() {
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
}

function recognitionErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") return "Permita o acesso ao microfone para usar o ditado.";
  if (error === "no-speech") return "Nenhuma fala foi identificada. Tente novamente.";
  if (error === "audio-capture") return "Nenhum microfone disponível.";
  return "Não foi possível transcrever a fala.";
}
