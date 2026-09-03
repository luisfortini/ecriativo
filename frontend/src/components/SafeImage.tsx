import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    setFailed(false);
    setUsingFallback(false);
  }, [fallbackSrc, src]);

  if (!src || failed) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 p-3 text-center text-xs text-slate-500 ${className}`}>
        <ImageOff size={24} />
        <span>Imagem indisponível</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={usingFallback ? fallbackSrc || undefined : src}
      alt={alt}
      onError={() => {
        if (!usingFallback && fallbackSrc && fallbackSrc !== src) setUsingFallback(true);
        else setFailed(true);
      }}
    />
  );
}
