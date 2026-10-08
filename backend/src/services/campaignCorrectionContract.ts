import { z } from "zod";
import type { CampaignFormat, ClientProfile } from "../types.js";
import { socialBrandContract, socialContentLanguage } from "./socialBrandContract.js";

export const campaignCorrectionSchema = z.object({
  note: z.string().trim().min(5, "Descreva o ajuste desejado com pelo menos 5 caracteres.").max(2000, "A correção deve ter até 2000 caracteres."),
  base_image_url: z.string().min(1, "Atualize a página para selecionar a arte atual.").max(2000)
});

export function buildCampaignCorrectionPrompt(client: ClientProfile, format: CampaignFormat, originalPrompt: string, note: string) {
  return [
    `Edite a imagem de um anúncio existente da marca ${client.name}, no formato ${format}. Não crie uma campanha diferente.`,
    `Contexto visual original, secundário às regras atuais: ${originalPrompt.slice(0,12000)}`,
    `PERFIL ATUAL DA MARCA (prevalece sobre instruções e textos antigos): ${socialBrandContract(client)}`,
    `Todo texto visível deve estar em ${socialContentLanguage(client)}, mantendo nomes próprios. Use os dados públicos exatamente como cadastrados; nunca invente telefone, endereço, @ ou oferta.`,
    "Preserve a composição, fotos reais autorizadas, produtos, pessoas e textos compatíveis que não precisem de ajuste. A solicitação afeta somente a arte, não a legenda do anúncio.",
    "Não desenhe nem recrie logos. Remova logos incorporadas à arte; a logo original do cadastro será aplicada pelo sistema. Reserve a área da logo sem cobrir texto. Preserve marcas nas embalagens reais autorizadas.",
    "Arte preenchendo todo o quadro, sem bordas externas, barras brancas, mockups ou margens adicionadas. Não corte textos, rostos ou produtos.",
    `CORREÇÃO SOLICITADA: ${note}. Aplique este ajuste dentro do idioma, paleta e restrições atuais. Não altere outros elementos compatíveis sem necessidade.`
  ].join("\n");
}
