import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { SocialPublishingPanel } from "../components/SocialPublishingPanel";
import type { SocialContent } from "../components/SocialContentCard";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { useStudio } from "../studio/StudioContext";
import { request } from "../services/api";

export function StudioPublishing({ mode }: { mode: "calendar" | "connections" }) {
  const { brand } = useStudio();
  const [contents, setContents] = useState<SocialContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!brand) {setLoading(false);return;}
    const load = async () => {
      const plans = await request<Array<{id:number;client_id:number}>>("/social-media/plans");
      const data = await Promise.all(plans.filter(plan => Number(plan.client_id) === Number(brand.id)).map(plan => request<{contents: SocialContent[]}>("/social-media/plans/" + plan.id + "/calendar")));
      if (active) {setContents(data.flatMap(item => item.contents));setError("");setLoading(false);}
    };
    void load().catch(reason => {if(active){setError(reason.message);setLoading(false);}});
    const timer = setInterval(() => void load().catch(reason => {if(active)setError(reason.message);}), 20000);
    return () => {active = false;clearInterval(timer);};
  }, [brand?.id]);
  return <><PageHeader title={mode === "calendar" ? "Seu calendário de publicações" : "Conecte sua marca às redes"} description={mode === "calendar" ? "Escolha o dia e o horário. Acompanhe o que está agendado, publicado ou precisa de atenção." : "Autorize as contas corretas do Instagram e Facebook. Suas credenciais ficam protegidas no servidor."}/>
    {error && <ErrorBanner message={error}/>}
    {!brand ? <section className="panel p-6"><p>Prepare a marca antes de conectar as redes.</p><Link className="btn-primary mt-4" to="/clientes">Preparar marca</Link></section> : loading ? <LoadingBlock/> : <SocialPublishingPanel clientId={Number(brand.id)} contents={contents} mode={mode}/>}
  </>;
}
