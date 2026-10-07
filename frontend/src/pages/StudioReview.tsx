import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { useStudio } from "../studio/StudioContext";
import { SocialMedia } from "./SocialMedia";
import { Dashboard } from "./Dashboard";

export function StudioReview() {
  const { canManage } = useStudio();
  const [kind, setKind] = useState(canManage ? "social" : "ads");
  return <><PageHeader title="Vamos revisar com calma" description="Confira as artes, ajuste a legenda e peça correções nas imagens que precisar."/>
    <div className="studio-tabs mb-6" role="group" aria-label="Tipo de conteúdo">{canManage && <button className={kind === "social" ? "active" : ""} type="button" aria-pressed={kind === "social"} onClick={() => setKind("social")}>Conteúdos sociais</button>}<button className={kind === "ads" ? "active" : ""} type="button" aria-pressed={kind === "ads"} onClick={() => setKind("ads")}>Anúncios</button></div>
    {kind === "social" ? <SocialMedia embedded/> : <Dashboard embedded/>}
  </>;
}
