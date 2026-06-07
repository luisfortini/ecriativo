import { Check, Copy, ExternalLink, ImageIcon, MessageCircle, Repeat2, Save, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { getCampaign, saveCampaignLearning, sendCampaignWhatsapp, updateCampaignStatus } from "../services/api";
import type { CampaignDetail } from "../types";

export function CampaignResult() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [confirmedActions, setConfirmedActions] = useState<Record<string, string>>({});

  function load() {
    if (!id) return;
    getCampaign(id)
      .then(setCampaign)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function learn(action: string, label: string, value?: string) {
    if (!campaign) return;
    setMessage("");
    setError("");
    setPendingAction(action);
    try {
      await saveCampaignLearning(campaign.id, action, value);
      setConfirmedActions((current) => ({ ...current, [action]: "Salvo" }));
      setMessage(`${label} salvo no perfil do cliente.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o aprendizado.");
    } finally {
      setPendingAction("");
    }
  }

  async function setStatus(status: "approved" | "rejected") {
    if (!campaign) return;
    const action = `status_${status}`;
    setMessage("");
    setError("");
    setPendingAction(action);
    try {
      const updated = await updateCampaignStatus(campaign.id, status);
      setCampaign(updated);
      setConfirmedActions((current) => ({ ...current, status_approved: "", status_rejected: "", [action]: status === "approved" ? "Aprovado" : "Reprovado" }));
      setMessage(status === "approved" ? "Campanha marcada como aprovada." : "Campanha marcada como reprovada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar o status.");
    } finally {
      setPendingAction("");
    }
  }

  async function sendWhatsapp() {
    if (!campaign) return;
    setMessage("");
    setError("");
    try {
      await sendCampaignWhatsapp(campaign.id);
      setMessage("Envio via WhatsApp solicitado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel enviar via WhatsApp.");
    }
  }

  if (loading) return <LoadingBlock label="Carregando resultado..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!campaign) return null;
  const adCaption = buildAdCaption(campaign);

  return (
    <>
      <PageHeader
        title={campaign.cliente}
        description={`${campaign.segmento || "Sem segmento"} · ${campaign.formato || "1:1"} · ${new Date(campaign.created_at).toLocaleString("pt-BR")}`}
        action={
          campaign.client_id ? (
            <Link className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm" to={`/nova-campanha?client_id=${campaign.client_id}`}>
              <Repeat2 size={16} />
              Duplicar com mesmo cliente
            </Link>
          ) : null
        }
      />
      {error && <ErrorBanner message={error} />}
      {message && <div className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-hover">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="space-y-4">
          <Block title="Estrategia">
            <Info label="Angulo" value={campaign.strategy.angulo} />
            <Info label="Publico" value={campaign.strategy.publico} />
            <Info label="Promessa" value={campaign.strategy.promessa} />
          </Block>

          <Block title="Copy">
            <Info label="Headline" value={campaign.strategy.headline} large />
            <Info label="Texto principal" value={campaign.strategy.texto_principal} />
            <Info label="CTA" value={campaign.strategy.cta} />
          </Block>

          <Block title="Direcao Criativa">
            <Info label="Resumo visual" value={campaign.creative.direcao_visual_resumida} />
            <Info label="Briefing criativo" value={formatCreativeBriefing(campaign.strategy.briefing_criativo)} />
            <PromptBox value={campaign.creative.prompt_imagem} />
            <Info label="Negative prompt" value={campaign.creative.negative_prompt} />
          </Block>
        </section>

        <aside className="space-y-4">
          <section className="panel overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-ink">Imagem final</h2>
            </div>
            <div className="bg-slate-100 p-4">
              {campaign.image_url ? (
                <img className="w-full rounded-md object-cover" src={campaign.image_url} alt={`Criativo gerado para ${campaign.cliente}`} />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-md bg-white text-slate-400">
                  <ImageIcon size={36} />
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 bg-white p-4">
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white" type="button" onClick={sendWhatsapp}>
                  <MessageCircle size={14} /> Enviar via WhatsApp
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700" type="button" onClick={sendWhatsapp}>
                  <MessageCircle size={14} /> Reenviar
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700" type="button" onClick={() => navigator.clipboard.writeText(adCaption)}>
                  <Copy size={14} /> Copiar legenda
                </button>
                {campaign.image_url && (
                  <a className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700" href={campaign.image_url} target="_blank">
                    <ExternalLink size={14} /> Abrir imagem
                  </a>
                )}
              </div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-ink">Legenda do anuncio</h2>
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={() => navigator.clipboard.writeText(adCaption)}
                >
                  <Copy size={13} />
                  Copiar
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{adCaption}</p>
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="mb-3 font-bold text-ink">Feedback e aprendizado</h2>
            <div className="grid grid-cols-2 gap-2">
              <Action icon={<Check size={15} />} label="Aprovado" pending={pendingAction === "status_approved"} confirmedLabel={confirmedActions.status_approved} onClick={() => setStatus("approved")} />
              <Action icon={<X size={15} />} label="Reprovado" pending={pendingAction === "status_rejected"} confirmedLabel={confirmedActions.status_rejected} onClick={() => setStatus("rejected")} />
              <Action icon={<ThumbsUp size={15} />} label="Gostei do estilo" pending={pendingAction === "liked_style"} confirmedLabel={confirmedActions.liked_style} onClick={() => learn("liked_style", "Estilo aprovado")} />
              <Action icon={<ThumbsDown size={15} />} label="Nao gostei" pending={pendingAction === "disliked_style"} confirmedLabel={confirmedActions.disliked_style} onClick={() => learn("disliked_style", "Estilo reprovado")} />
            </div>
            <div className="mt-3 space-y-2">
              <Action full icon={<Save size={15} />} label="Salvar headline como CTA preferido" pending={pendingAction === "save_cta"} confirmedLabel={confirmedActions.save_cta} onClick={() => learn("save_cta", "CTA preferido", campaign.strategy.headline)} />
              <Action full icon={<Save size={15} />} label="Salvar estilo visual como aprovado" pending={pendingAction === "approve_style"} confirmedLabel={confirmedActions.approve_style} onClick={() => learn("approve_style", "Estilo visual aprovado")} />
              <Action full icon={<Save size={15} />} label="Marcar estilo como proibido" pending={pendingAction === "forbid_style"} confirmedLabel={confirmedActions.forbid_style} onClick={() => learn("forbid_style", "Estilo visual proibido")} />
              <Action full icon={<Save size={15} />} label="Salvar paleta usada no cliente" pending={pendingAction === "save_palette"} confirmedLabel={confirmedActions.save_palette} onClick={() => learn("save_palette", "Paleta")} />
              <Action full icon={<Save size={15} />} label="Salvar observacao estrategica" pending={pendingAction === "save_note"} confirmedLabel={confirmedActions.save_note} onClick={() => learn("save_note", "Observacao estrategica")} />
              <Action full icon={<Save size={15} />} label="Salvar direcao visual no cliente" pending={pendingAction === "save_visual_direction"} confirmedLabel={confirmedActions.save_visual_direction} onClick={() => learn("save_visual_direction", "Direcao visual")} />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function buildAdCaption(campaign: CampaignDetail) {
  const text = (campaign.strategy.texto_principal || "").replace(/^\s*texto principal para an[uú]ncio:\s*/i, "");
  const sectionStart = text.search(
    /\n\s*(sugest[oõ]es? de headlines?|headlines alternativas|estrutura visual|sugest[aã]o de criativo|sugest[aã]o de v[ií]deo|dire[cç][aã]o visual|briefing criativo|prompt de imagem)\b[^:]*:/i
  );
  const caption = sectionStart >= 0 ? text.slice(0, sectionStart) : text;
  return caption.trim() || text.trim();
}

function formatCreativeBriefing(value: CampaignDetail["strategy"]["briefing_criativo"]) {
  if (typeof value === "string") return value;
  return [
    value.conceito,
    value.emocao ? `Emocao: ${value.emocao}` : "",
    value.composicao ? `Composicao: ${value.composicao}` : "",
    value.paleta?.length ? `Paleta: ${value.paleta.join(", ")}` : "",
    value.elementos_visuais?.length ? `Elementos: ${value.elementos_visuais.join(", ")}` : "",
    value.hierarquia ? `Hierarquia: ${value.hierarquia}` : "",
    value.evitar?.length ? `Evitar: ${value.evitar.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function Action({
  label,
  icon,
  full,
  pending,
  confirmedLabel,
  onClick
}: {
  label: string;
  icon: React.ReactNode;
  full?: boolean;
  pending?: boolean;
  confirmedLabel?: string;
  onClick: () => void;
}) {
  const confirmed = Boolean(confirmedLabel);
  return (
    <button
      className={`${full ? "w-full" : ""} inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition ${
        confirmed ? "border-accent/40 bg-accent-soft text-accent-hover" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      } ${pending ? "cursor-wait opacity-80" : ""}`}
      type="button"
      disabled={pending}
      onClick={onClick}
    >
      {confirmed ? <Check size={15} /> : icon}
      {pending ? "Salvando..." : confirmedLabel || label}
    </button>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-lg font-bold text-ink">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Info({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={large ? "text-xl font-bold text-ink" : "text-sm leading-6 text-slate-700"}>{value}</p>
    </div>
  );
}

function PromptBox({ value }: { value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="label mb-0">Prompt de imagem</p>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
        >
          <Copy size={13} />
          Copiar
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-md bg-slate-950 p-4 text-sm leading-6 text-slate-100">{value}</pre>
    </div>
  );
}
