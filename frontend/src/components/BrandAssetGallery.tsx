import { Download, Expand, FileText, ImageUp, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "../auth/authStorage";
import { API_URL } from "../services/api";
import type { ClientAsset, ClientAssetType } from "../types";
import { SafeImage } from "./SafeImage";

function isPdf(asset: ClientAsset) {
  try { return new URL(asset.file_url, window.location.origin).pathname.toLowerCase().endsWith(".pdf"); }
  catch { return false; }
}

export function BrandAssetGallery({ assets, labels }: { assets: ClientAsset[]; labels: Record<ClientAssetType, string> }) {
  const [selected, setSelected] = useState<ClientAsset | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  // Keep the gallery scoped to this client's current assets after upload/replacement.
  useEffect(() => {
    if (selected && !assets.some(asset => asset.id === selected.id)) setSelected(null);
  }, [assets, selected]);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [selected]);

  return <section className="panel p-5" aria-labelledby="brand-files-title">
    <h2 id="brand-files-title" className="font-bold text-ink">Arquivos cadastrados <span className="brand-asset-count">{assets.length}</span></h2>
    <p className="mt-2 mb-4 text-xs text-slate-500">Confira os arquivos da marca. Clique na imagem para ampliar.</p>
    {assets.length === 0 ? <div className="brand-assets-empty"><ImageUp size={26} aria-hidden="true" /><p>Nenhum arquivo adicionado ainda.</p><small>Envie a logo ou uma referência no formulário acima.</small></div> :
      <div className="brand-asset-list">{assets.map(asset => <AssetCard key={asset.id} asset={asset} label={labels[asset.type]} onExpand={() => setSelected(asset)} />)}</div>}
    {selected && <dialog ref={dialog} className="brand-asset-dialog" aria-labelledby="brand-asset-dialog-title" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="brand-asset-dialog-content">
        <header><div><p className="studio-eyebrow">ARQUIVO DA MARCA</p><h2 id="brand-asset-dialog-title">{labels[selected.type]}</h2></div><button type="button" className="btn-secondary" aria-label="Fechar visualização" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button></header>
        <div className={`brand-asset-large ${selected.type === "logo_white" ? "brand-asset-dark" : ""}`}><SafeImage src={selected.file_url} alt={selected.description || labels[selected.type]} className="brand-asset-image" /></div>
        <footer><div><p className="brand-asset-description">{selected.description || "Sem descrição"}</p><p className="mt-1 text-xs text-slate-500">Se a imagem estiver indisponível, tente baixar o arquivo. Se o download também falhar, será necessário reenviá-lo.</p></div><AssetDownload asset={selected} label={labels[selected.type]} /></footer>
      </div>
    </dialog>}
  </section>;
}

function AssetCard({ asset, label, onExpand }: { asset: ClientAsset; label: string; onExpand: () => void }) {
  const pdf = isPdf(asset);
  return <article className="brand-asset-card">
    {pdf ? <div className="brand-asset-pdf"><FileText size={32} aria-hidden="true" /><strong>Documento PDF</strong><span>Baixe para visualizar o conteúdo.</span></div> :
      <button type="button" className={`brand-asset-thumbnail ${asset.type === "logo_white" ? "brand-asset-dark" : ""}`} onClick={onExpand} aria-label={`Ampliar ${label}: ${asset.description || "sem descrição"}`}><SafeImage src={asset.file_url} alt={asset.description || label} className="brand-asset-image" /><span className="brand-asset-expand"><Expand size={14} aria-hidden="true" /> Ampliar</span></button>}
    <div className="brand-asset-details"><h3>{label}</h3><p className="brand-asset-description">{asset.description || "Sem descrição"}</p>
      {asset.ai_summary && <details className="brand-asset-analysis"><summary>Análise do arquivo</summary><p>{asset.ai_summary}</p></details>}
      <AssetDownload asset={asset} label={label} />
    </div>
  </article>;
}

function AssetDownload({ asset, label }: { asset: ClientAsset; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      // Resolve managed media on the active API host, never send credentials to a stored external host.
      const pathname = new URL(asset.file_url, window.location.origin).pathname;
      const mediaPath = pathname.match(/\/(uploads|generated)\/[^/]+$/)?.[0];
      if (!mediaPath) throw new Error("Este arquivo não está disponível para download. Envie-o novamente.");
      const token = getAuthToken();
      const response = await fetch(`${new URL(API_URL).origin}${mediaPath}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Seu acesso não permite baixar este arquivo. Entre novamente ou fale com o administrador." : "Não foi possível baixar o arquivo. Tente novamente; se persistir, envie-o novamente.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl; link.download = decodeURIComponent(mediaPath.split("/").pop() || `arquivo-${asset.id}`);
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível baixar o arquivo."); }
    finally { setBusy(false); }
  }
  return <div className="brand-asset-download"><button type="button" className="btn-secondary" onClick={() => void download()} disabled={busy} aria-label={`Baixar ${label}: ${asset.description || "sem descrição"}`}>{busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{busy ? "Baixando…" : "Baixar arquivo"}</button>{error && <p role="alert" className="studio-inline-error mt-2">{error}</p>}</div>;
}
