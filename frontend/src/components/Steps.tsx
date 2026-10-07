export function Steps({ labels, current, onChange, disabled = false }: { labels: string[]; current: number; onChange: (index: number) => void; disabled?: boolean }) {
  return <ol className="studio-steps" aria-label="Etapas">{labels.map((label, index) => <li key={label}><button type="button" disabled={disabled} aria-current={current === index ? "step" : undefined} className={current === index ? "active" : index < current ? "complete" : ""} onClick={() => onChange(index)}><span>{index < current ? "✓" : index + 1}</span><strong>{label}</strong></button></li>)}</ol>;
}
