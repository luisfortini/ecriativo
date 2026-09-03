const labels: Record<string, string> = {
  active: "Ativo",
  approved: "Aprovado",
  biweekly: "Quinzenal",
  cancelled: "Cancelado",
  completed: "Concluído",
  daily: "Diário",
  draft: "Rascunho",
  error: "Erro",
  failed: "Falha",
  monthly: "Mensal",
  once: "Uma vez",
  paused: "Pausado",
  pending: "Pendente",
  processing: "Processando",
  rejected: "Reprovado",
  retry: "Nova tentativa",
  success: "Sucesso",
  waiting_review: "Aguardando revisão",
  weekly: "Semanal",
  normalizacao_briefing: "Normalização do briefing",
  estrategista: "Estrategista",
  criativo: "Criativo",
  analise_marca: "Análise de marca",
  geracao_imagem: "Geração de imagem",
  rotina_agendada: "Rotina agendada",
  reprocessamento: "Reprocessamento",
  agente: "Agente",
  analise: "Análise",
  rankings: "Classificações",
  execucoes: "Execuções",
  precos: "Preços",
  configuracoes: "Configurações"
};

export function uiLabel(value: string | null | undefined, fallback = "Não informado") {
  if (!value) return fallback;
  return labels[value] ?? value.replace(/_/g, " ").replace(/^./, (letter: string) => letter.toUpperCase());
}

export function optionLabel(value: string) {
  return labels[value] ?? uiLabel(value);
}
