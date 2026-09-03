import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, MessageCircle, Repeat2, Save, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { SafeImage } from "../components/SafeImage";
import { getCampaign, getCreativeNavigation, saveCampaignLearning, sendCampaignWhatsapp, updateCampaignStatus } from "../services/api";
import type { CampaignDetail, CreativeBriefArtifact, CreativeNavigation, CreativeOutputArtifact } from "../types";
import { uiLabel } from "../utils/uiLabels";

export function CampaignResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [navigation, setNavigation] = useState<CreativeNavigation>({ previous_id: null, next_id: null });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [confirmedActions, setConfirmedActions] = useState<Record<string, string>>({});
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected" | null>(null);
  const [reviewReason, setReviewReason] = useState("");

  function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    setReviewDecision(null);
    Promise.all([getCampaign(id), getCreativeNavigation(id)])
      .then(([campaignData, navigationData]) => {
        setCampaign(campaignData);
        setNavigation(navigationData);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const element = event.target as HTMLElement | null;
      if (element?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft" && navigation.previous_id) navigate(`/campanhas/${navigation.previous_id}`);
      if (event.key === "ArrowRight" && navigation.next_id) navigate(`/campanhas/${navigation.next_id}`);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, navigation]);

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
      setError(err instanceof Error ? err.message : "Não foi possível salvar o aprendizado.");
    } finally {
      setPendingAction("");
    }
  }

  async function submitReview() {
    const status = reviewDecision;
    if (!campaign) return;
    if (!status) return;
    if (status === "rejected" && !reviewReason.trim()) {
      setError("Informe o motivo da reprovação.");
      return;
    }
    const action = `status_${status}`;
    setMessage("");
    setError("");
    setPendingAction(action);
    try {
      const updated = await updateCampaignStatus(campaign.id, status, reviewReason.trim() || undefined);
      setCampaign(updated);
      setConfirmedActions((current) => ({ ...current, status_approved: "", status_rejected: "", [action]: status === "approved" ? "Aprovado" : "Reprovado" }));
      setMessage(status === "approved" ? "Campanha marcada como aprovada." : "Campanha marcada como reprovada.");
      setReviewDecision(null);
      setReviewReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a situação.");
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
      setError(err instanceof Error ? err.message : "Não foi possível enviar via WhatsApp.");
    }
  }

  if (loading) return <LoadingBlock label="Carregando resultado..." />;
  if (error && !campaign) return <ErrorBanner message={error} />;
  if (!campaign) return null;
  if (campaign.status === "failed") {
    return (
      <>
        <PageHeader
          title={campaign.cliente}
          description={`${campaign.segmento || "Sem segmento"} · ${campaign.formato || "1:1"} · ${new Date(campaign.created_at).toLocaleString("pt-BR")}`}
        />
        <ErrorBanner message={campaign.error_message || "A geração desta campanha falhou antes de produzir o resultado."} />
      </>
    );
  }
  const officialBrief = campaign.pipeline_run?.artifacts
    .filter((artifact) => artifact.artifact_type === "creative_brief" && artifact.status === "completed")
    .slice(-1)[0]?.payload as CreativeBriefArtifact | undefined;
  const adCaption = buildAdCaption(campaign, officialBrief);
  const officialCreativeOutput = campaign.pipeline_run?.artifacts
    .filter((artifact) => artifact.artifact_type === "creative_output" && artifact.status === "completed")
    .slice(-1)[0]?.payload as CreativeOutputArtifact | undefined;

  return (
    <>
      <PageHeader
        title={campaign.cliente}
        description={`${campaign.segmento || "Sem segmento"} · ${campaign.formato || "1:1"} · ${new Date(campaign.created_at).toLocaleString("pt-BR")}`}
        action={(
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={!navigation.previous_id}
              title="Criativo anterior (seta para a esquerda)"
              onClick={() => navigation.previous_id && navigate(`/campanhas/${navigation.previous_id}`)}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={!navigation.next_id}
              title="Próximo criativo (seta para a direita)"
              onClick={() => navigation.next_id && navigate(`/campanhas/${navigation.next_id}`)}
            >
              Próximo <ChevronRight size={16} />
            </button>
            {campaign.client_id && (
              <Link className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm" to={`/nova-campanha?client_id=${campaign.client_id}`}>
                <Repeat2 size={16} />
                Duplicar com mesmo cliente
              </Link>
            )}
          </div>
        )}
      />
      {error && <ErrorBanner message={error} />}
      {message && <div className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-hover">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="space-y-4">
          {campaign.pipeline_run && (
            <Block title="Pipeline">
              <Info label="Situação do pipeline" value={uiLabel(campaign.pipeline_run.status)} />
              <Info label="Diagnóstico utilizado" value={campaign.pipeline_run.profile_diagnostic_id ? `#${campaign.pipeline_run.profile_diagnostic_id}` : "Não vinculado"} />
              <Info
                label="Artefatos"
                value={campaign.pipeline_run.artifacts.map((artifact) => `${artifact.artifact_type} v${artifact.version} · schema ${artifact.schema_version}`).join("\n") || "Nenhum artefato"}
              />
              <Info
                label="Eventos"
                value={campaign.pipeline_run.events?.map((event) => `${event.event_type}: ${event.message}`).join(" | ") || "Nenhum evento tecnico"}
              />
            </Block>
          )}

          {officialCreativeOutput?.brandOverlay && (
            <Block title="Aplicação da marca">
              <Info label="Logo solicitada" value={officialCreativeOutput.brandOverlay.logoRequired ? "Sim" : "Não"} />
              <Info label="Posição sugerida" value={officialCreativeOutput.brandOverlay.preferredPosition} />
              <Info label="Tamanho sugerido" value={`${officialCreativeOutput.brandOverlay.sizePercent}%`} />
            </Block>
          )}

          {officialBrief && (
            <Block title="Briefing criativo oficial">
              <Info label="Objetivo" value={officialBrief.campaignObjective} />
              <Info label="Estágio do funil" value={officialBrief.funnelStage} />
              <Info label="Benefício central" value={officialBrief.centralBenefit} />
              <Info label="Objeção combatida" value={officialBrief.objectionAddressed} />
              <Info label="Subheadline" value={officialBrief.subheadline} />
              <Info label="Tom de voz" value={officialBrief.toneOfVoice} />
              <Info label="Instruções de imagem" value={officialBrief.imageInstructions} />
              {officialBrief.adCaption && <Info label="Legenda final" value={officialBrief.adCaption} />}
              <Info label="Instruções de legenda" value={officialBrief.captionInstructions} />
            </Block>
          )}

          <Block title="Estrategia">
            <Info label="Ângulo" value={campaign.strategy.angulo} />
            <Info label="Público" value={campaign.strategy.publico} />
            <Info label="Promessa" value={campaign.strategy.promessa} />
          </Block>

          <Block title="Copy">
            <Info label="Headline" value={campaign.strategy.headline} large />
            <Info label="Texto principal" value={campaign.strategy.texto_principal} />
            <Info label="CTA" value={campaign.strategy.cta} />
          </Block>

          <Block title="Direção criativa">
            <Info label="Resumo visual" value={campaign.creative.direcao_visual_resumida} />
            <Info label="Briefing criativo" value={formatCreativeBriefing(campaign.strategy.briefing_criativo)} />
            <PromptBox value={campaign.creative.prompt_imagem} />
            <Info label="Restrições do prompt" value={campaign.creative.negative_prompt} />
          </Block>
        </section>

        <aside className="space-y-4">
          <section className="panel overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-ink">Imagem final</h2>
            </div>
            <div className="bg-slate-100 p-4">
              <div className="aspect-square overflow-hidden rounded-md">
                <SafeImage className="h-full w-full object-cover" src={campaign.image_url} fallbackSrc={campaign.generated_image_url} alt={`Criativo gerado para ${campaign.cliente}`} />
              </div>
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
                <h2 className="font-semibold text-ink">Legenda do anúncio</h2>
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
            <p className="mb-3 text-sm text-slate-600">Situação atual: <strong>{creativeStatusLabel(campaign.creative_status)}</strong></p>
            <div className="grid grid-cols-2 gap-2">
              <Action icon={<Check size={15} />} label="Aprovar" pending={pendingAction === "status_approved"} confirmedLabel={confirmedActions.status_approved} onClick={() => { setError(""); setReviewDecision("approved"); setReviewReason(""); }} />
              <Action icon={<X size={15} />} label="Reprovar" pending={pendingAction === "status_rejected"} confirmedLabel={confirmedActions.status_rejected} onClick={() => { setError(""); setReviewDecision("rejected"); setReviewReason(""); }} />
              <Action icon={<ThumbsUp size={15} />} label="Gostei do estilo" pending={pendingAction === "liked_style"} confirmedLabel={confirmedActions.liked_style} onClick={() => learn("liked_style", "Estilo aprovado")} />
              <Action icon={<ThumbsDown size={15} />} label="Não gostei" pending={pendingAction === "disliked_style"} confirmedLabel={confirmedActions.disliked_style} onClick={() => learn("disliked_style", "Estilo reprovado")} />
            </div>
            <div className="mt-3 space-y-2">
              <Action full icon={<Save size={15} />} label="Salvar headline como CTA preferido" pending={pendingAction === "save_cta"} confirmedLabel={confirmedActions.save_cta} onClick={() => learn("save_cta", "CTA preferido", campaign.strategy.headline)} />
              <Action full icon={<Save size={15} />} label="Salvar estilo visual como aprovado" pending={pendingAction === "approve_style"} confirmedLabel={confirmedActions.approve_style} onClick={() => learn("approve_style", "Estilo visual aprovado")} />
              <Action full icon={<Save size={15} />} label="Marcar estilo como proibido" pending={pendingAction === "forbid_style"} confirmedLabel={confirmedActions.forbid_style} onClick={() => learn("forbid_style", "Estilo visual proibido")} />
              <Action full icon={<Save size={15} />} label="Salvar paleta usada no cliente" pending={pendingAction === "save_palette"} confirmedLabel={confirmedActions.save_palette} onClick={() => learn("save_palette", "Paleta")} />
              <Action full icon={<Save size={15} />} label="Salvar observação estratégica" pending={pendingAction === "save_note"} confirmedLabel={confirmedActions.save_note} onClick={() => learn("save_note", "Observação estratégica")} />
              <Action full icon={<Save size={15} />} label="Salvar direção visual no cliente" pending={pendingAction === "save_visual_direction"} confirmedLabel={confirmedActions.save_visual_direction} onClick={() => learn("save_visual_direction", "Direção visual")} />
            </div>
            {campaign.reviews?.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="mb-2 text-sm font-bold text-ink">Histórico de avaliações</h3>
                <div className="max-h-56 space-y-2 overflow-auto">
                  {campaign.reviews.map((review) => (
                    <div key={review.id} className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <p className="font-semibold">{review.decision === "approved" ? "Aprovado" : "Reprovado"} · {new Date(review.created_at).toLocaleString("pt-BR")}</p>
                      {review.reason && <p className="mt-1 whitespace-pre-wrap">{review.reason}</p>}
                      {review.reviewer_name && <p className="mt-1 text-slate-500">Por {review.reviewer_name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
      {reviewDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h2 id="review-title" className="text-lg font-bold text-ink">{reviewDecision === "approved" ? "Aprovar arte" : "Reprovar arte"}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {reviewDecision === "approved" ? "Conte o que funcionou para orientar as próximas criações." : "Explique o que precisa ser evitado ou melhorado nas próximas criações."}
            </p>
            <label className="label mt-4" htmlFor="review-reason">Motivo {reviewDecision === "rejected" ? "(obrigatório)" : "(opcional)"}</label>
            <textarea
              id="review-reason"
              className="field min-h-32"
              maxLength={2000}
              autoFocus
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold" type="button" onClick={() => setReviewDecision(null)}>Cancelar</button>
              <button
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                type="button"
                disabled={Boolean(pendingAction) || (reviewDecision === "rejected" && !reviewReason.trim())}
                onClick={() => void submitReview()}
              >
                {pendingAction ? "Salvando..." : "Confirmar avaliação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function creativeStatusLabel(status: CampaignDetail["creative_status"]) {
  if (status === "approved") return "Aprovada";
  if (status === "rejected") return "Reprovada";
  if (status === "draft") return "Rascunho";
  return "Aguardando revisão";
}

function buildAdCaption(campaign: CampaignDetail, officialBrief?: CreativeBriefArtifact) {
  const text = (officialBrief?.adCaption || campaign.strategy.texto_principal || "")
    .replace(/^\s*texto principal para an[uú]ncio:\s*/i, "");
  const sectionStart = text.search(
    /\n\s*(sugest[oõ]es? de headlines?|headlines alternativas|estrutura visual|sugest[aã]o de criativo|sugest[aã]o de v[ií]deo|dire[cç][aã]o visual|briefing criativo|prompt de imagem)\b[^:]*:/i
  );
  const caption = sectionStart >= 0 ? text.slice(0, sectionStart) : text;
  return caption.trim() || text.trim();
}

function formatCreativeBriefing(value: CampaignDetail["strategy"]["briefing_criativo"] | null | undefined) {
  if (!value) return "Briefing criativo ainda não disponível.";
  if (typeof value === "string") return value;
  return [
    value.conceito,
    value.emocao ? `Emocao: ${value.emocao}` : "",
    value.composicao ? `Composição: ${value.composicao}` : "",
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
