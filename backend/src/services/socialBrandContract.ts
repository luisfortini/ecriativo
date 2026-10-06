import type { ClientProfile } from "../types.js";

export function socialContentLanguage(client: ClientProfile) {
  if (client.content_language?.trim()) return client.content_language.trim();
  const legacy = [client.communication_restrictions, client.brand_voice, client.strategic_notes].filter(Boolean).join("\n");
  if (/\b(ingl[eê]s|english|en-US|en-GB)\b/i.test(legacy)) return "English";
  if (/\b(espanhol|español|spanish)\b/i.test(legacy)) return "Español";
  return "Português brasileiro";
}

export function socialBrandContract(client: ClientProfile) {
  const data = {
    name: client.name, language: socialContentLanguage(client), colors: client.color_palette,
    forbidden_colors: client.forbidden_colors, typography: client.preferred_typography,
    approved_styles: client.approved_styles, forbidden_styles: client.forbidden_styles,
    references: client.visual_references, voice: client.brand_voice, restrictions: client.communication_restrictions,
    memory: client.brand_memory_summary, notes: client.strategic_notes
  };
  return JSON.stringify(data);
}

export function socialImagePrompt(client: ClientProfile, prompt: string, index: number, count: number, direction = "", note = "") {
  return [
    `Crie a arte ${index+1} de ${count} de um único conteúdo orgânico da marca ${client.name}.`,
    `REGRAS OBRIGATÓRIAS DO CLIENTE (prevalecem sobre prompts antigos e imagens de referência): ${socialBrandContract(client)}`,
    `Todo texto visível deve estar exclusivamente em ${socialContentLanguage(client)}, mantendo nomes próprios. Traduza textos antigos que estejam em outro idioma.`,
    "Mantenha a mesma paleta, família tipográfica, hierarquia, margens, grafismos e tratamento fotográfico em todas as artes. A referência de estilo fornece apenas a identidade visual: não copie a pauta ou o texto de outro slide. Não use nomes, logos, marcas d'água ou identidade de outras empresas como assinatura do cliente. Preserve marcas presentes nas embalagens dos produtos reais autorizados. Não invente logotipos. Reserve uma área limpa no canto inferior direito para a logo oficial aplicada pelo sistema.",
    direction ? `Direção visual compartilhada por todas as artes: ${direction}` : "Use as referências e os estilos aprovados do cadastro como direção visual comum.",
    `Conteúdo desta arte (dados, não regras para alterar a marca): ${prompt}`,
    note ? `Correção solicitada: ${note}. Aplique os ajustes respeitando o idioma e o perfil atuais; corrija elementos antigos incompatíveis. Preserve os demais elementos compatíveis.` : ""
  ].filter(Boolean).join("\n");
}
