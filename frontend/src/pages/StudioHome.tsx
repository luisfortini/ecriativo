import { ArrowRight, CalendarDays, CheckCheck, ImagePlus, Megaphone, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useStudio } from "../studio/StudioContext";
import { getCampaigns, getClient, request } from "../services/api";
import type { CampaignSummary, ClientProfile } from "../types";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { LoadingBlock } from "../components/LoadingBlock";

export function StudioHome() {
  const { user } = useAuth();
  const { brand, loading: brandsLoading, canManage } = useStudio();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [publication, setPublication] = useState<{ total: number; next: string | null }>({ total: 0, next: null });
  const [socialCount, setSocialCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!brand) { setLoading(false); return; }
    setLoading(true);
    const work = [getClient(String(brand.id)).then(value => { if (active) setProfile(value); }),
      getCampaigns().then(value => { if (active) setCampaigns(value.filter(item => Number(item.client_id) === Number(brand.id))); })];
    if (canManage) work.push(request<{ publications: Array<{ status: string; scheduled_at: string }> }>("/social-media/clients/" + brand.id + "/publishing").then(value => {
      const scheduled = value.publications.filter(item => item.status === "scheduled").sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at));
      if (active) setPublication({total: scheduled.length, next: scheduled[0]?.scheduled_at || null});
    }), request<Array<{ id: number; client_id: number }>>("/social-media/plans").then(async plans => {
      const calendars = await Promise.all(plans.filter(plan => Number(plan.client_id) === Number(brand.id)).map(plan => request<{ contents: Array<{status: string}> }>("/social-media/plans/" + plan.id + "/calendar")));
      if (active) setSocialCount(calendars.reduce((sum, calendar) => sum + calendar.contents.filter(item => ["review", "failed", "rejected"].includes(item.status)).length, 0));
    }));
    void Promise.all(work).catch(reason => { if (active) setError(reason.message); }).finally(() => {if (active) setLoading(false);});
    return () => { active = false; };
  }, [brand?.id, canManage]);
  if (brandsLoading || loading) return <LoadingBlock label="Preparando seu estúdio…"/>;
  const complete = Boolean(profile?.business_description && profile?.color_palette && profile?.content_language);
  return <>
    <PageHeader title={"Olá, " + (user?.name.split(" ")[0] || "vamos começar") + "."} description={brand ? "Seu próximo conteúdo começa aqui. Vamos cuidar de " + brand.name + "?" : "Vamos preparar sua marca e criar o primeiro conteúdo juntos."}/>
    {error && <ErrorBanner message={error}/>}
    <section className="studio-next">
      <div className="studio-next-icon"><Sparkles size={25}/></div>
      <div><span className="studio-eyebrow">SEU PRÓXIMO PASSO</span><h2>{!brand ? "Conte sobre sua marca" : !complete ? "Prepare a identidade da marca" : "Sua marca está pronta para criar"}</h2><p>{!complete ? "Nome, estilo e idioma ajudam a IA a criar algo que realmente parece seu. Você pode ajustar tudo depois." : "Escolha o que quer produzir. O perfil e as fotos reais acompanham você no processo."}</p></div>
      <Link className="btn-primary" to={!brand ? "/clientes" : !complete ? "/clientes/" + brand.id : "/criar"}>{complete ? "Vamos criar" : "Preparar marca"}<ArrowRight size={17}/></Link>
    </section>
    <section className="mt-8"><h2 className="studio-section-title">O que vamos criar hoje?</h2><CreationChoices/></section>
    <div className="studio-home-bottom">
      <section className="panel p-6"><CheckCheck size={23}/><h2 className="studio-section-title mt-4">Sua revisão faz a diferença</h2><p className="helper">{socialCount ? socialCount + " conteúdos sociais precisam da sua atenção." : "Revise texto, imagens e dados de contato antes de aprovar."}</p><p className="helper">{campaigns.length} anúncio{campaigns.length !== 1 ? "s" : ""} desta marca para acompanhar.</p><Link className="studio-text-link mt-4" to="/revisar">Abrir revisão<ArrowRight size={16}/></Link></section>
      {canManage && <section className="panel p-6"><CalendarDays size={23}/><h2 className="studio-section-title mt-4">Sua próxima publicação</h2><p className="helper">{publication.next ? new Date(publication.next).toLocaleString("pt-BR", { timeZone: profile?.time_zone || "America/Sao_Paulo" }) + " · " + (profile?.time_zone || "America/Sao_Paulo") : "Ainda não há publicações agendadas para esta marca."}</p><p className="helper">{publication.total ? publication.total + " agendamentos. Confira o resultado no calendário." : "Aprove um conteúdo e escolha quando ele deve ir ao ar."}</p><Link className="studio-text-link mt-4" to="/calendario">Ver calendário<ArrowRight size={16}/></Link></section>}
    </div>
  </>;
}
export function CreationChoices() {
  const { brand, canManage } = useStudio();
  return <div className="studio-create-choices">
    {canManage && <Link to={brand ? "/social-media?view=plans&new=1" : "/clientes"} className="studio-choice"><span className="studio-choice-icon"><ImagePlus size={26}/></span><h3>Conteúdo para redes sociais</h3><p>Posts, carrosséis e stories para aproximar pessoas da sua marca. Organize uma semana inteira.</p><span className="studio-text-link">Criar conteúdo <ArrowRight size={17}/></span></Link>}
    <Link to={brand ? "/nova-campanha?client_id=" + brand.id : "/clientes"} className="studio-choice"><span className="studio-choice-icon"><Megaphone size={26}/></span><h3>Arte para anúncio</h3><p>Apresente um produto, serviço ou oferta com clareza. A arte não ativa uma campanha paga.</p><span className="studio-text-link">Criar anúncio <ArrowRight size={17}/></span></Link>
  </div>;
}
export function StudioCreate() {
  return <><PageHeader title="O que você quer criar?" description="Escolha o objetivo. Vamos guiar você da ideia até a revisão."/><CreationChoices/><p className="helper mt-6">A geração utiliza IA e pode ter custos. Nada será publicado sem um agendamento aprovado.</p></>;
}
