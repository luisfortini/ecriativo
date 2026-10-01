import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { getAuthToken } from "../auth/authStorage";
import { API_URL } from "../services/api";

export function SafeImage({
  src,
  fallbackSrc,
  alt,
  className = ""
}: {
  src: string | null | undefined;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [displaySrc, setDisplaySrc] = useState<string | undefined>();

  useEffect(() => {
    setFailed(false);
    setUsingFallback(false);
  }, [fallbackSrc, src]);

  useEffect(() => {
    const candidate = usingFallback ? fallbackSrc : src;
    let active = true;
    let objectUrl: string | undefined;
    if (!candidate) {
      setDisplaySrc(undefined);
      return;
    }
    const mediaPath = managedMediaPath(candidate);
    if (!mediaPath) {
      setDisplaySrc(candidate);
      return;
    }
    setDisplaySrc(undefined);
    const token = getAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    void fetch(`${new URL(API_URL).origin}${mediaPath}`, { headers, credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("Imagem indisponivel");
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        if (!active) return;
        if (!usingFallback && fallbackSrc && fallbackSrc !== src) setUsingFallback(true);
        else setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fallbackSrc, src, usingFallback]);

  if (!src || failed) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 p-3 text-center text-xs text-slate-500 ${className}`}>
        <ImageOff size={24} />
        <span>Imagem indisponível</span>
      </div>
    );
  }

  if (!displaySrc) {
    return <div className={`h-full w-full animate-pulse bg-slate-100 ${className}`} aria-label="Carregando imagem" />;
  }

  return (
    <img
      className={className}
      src={displaySrc}
      alt={alt}
      onError={() => {
        if (!usingFallback && fallbackSrc && fallbackSrc !== src) setUsingFallback(true);
        else setFailed(true);
      }}
    />
  );
}

function managedMediaPath(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    const match = url.pathname.match(/\/(generated|uploads)\/[^/]+$/);
    return match?.[0];
  } catch {
    return undefined;
  }
}
