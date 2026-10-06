import { z } from "zod";

export const SOCIAL_CONTENT_LIMITS = { caption: 10000, altText: 3000, imagePrompt: 8000 } as const;
export interface SocialTextResponse {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string; annotations?: Array<{ type: string; url?: string }> }> }>;
}

function contentSchema(format: string) {
  return z.object({
    caption: z.string().trim().min(1).max(SOCIAL_CONTENT_LIMITS.caption),
    alt_text: z.string().trim().min(1).max(SOCIAL_CONTENT_LIMITS.altText),
    visual_direction: z.string().trim().min(5).max(3000).optional(),
    image_prompts: z.array(z.string().trim().min(5).max(SOCIAL_CONTENT_LIMITS.imagePrompt)).length(format === "carousel" ? 3 : 1)
  }).strict();
}
export type SocialContentOutput = z.infer<ReturnType<typeof contentSchema>>;

/** One recovery request at most; no truncation or retry of network/provider failures. */
export async function generateValidatedSocialContent(format: string, generate: (repair: string) => Promise<SocialTextResponse>): Promise<SocialContentOutput> {
  let repair = "";
  let lastIssue = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await generate(repair);
    const parts = (response.output ?? []).flatMap(item => item.content ?? []);
    if (parts.some(part => part.type === "refusal") || response.incomplete_details?.reason === "content_filter") {
      throw new Error("A IA não pôde produzir este conteúdo por uma restrição de segurança. Revise o assunto e tente novamente.");
    }
    if (response.status && !["completed", "incomplete"].includes(response.status)) {
      throw new Error("A produção do conteúdo não foi concluída pelo serviço de IA. Tente novamente mais tarde.");
    }
    if (response.status === "incomplete") {
      lastIssue = "A resposta foi interrompida antes de terminar.";
    } else {
      const text = parts.filter(part => part.type === "output_text").map(part => part.text ?? "").join("\n");
      try {
        const parsed = contentSchema(format).safeParse(JSON.parse(text));
        if (parsed.success) return parsed.data;
        const oversized = parsed.error.issues.find(issue => issue.code === "too_big" && issue.path[0] === "image_prompts" && typeof issue.path[1] === "number");
        lastIssue = oversized ? `A descrição da arte ${Number(oversized.path[1]) + 1} ultrapassou o tamanho permitido.` : "A resposta não respeitou o formato ou os limites de texto necessários.";
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        lastIssue = "A resposta veio incompleta ou em um formato inválido.";
      }
    }
    repair = `A tentativa anterior não pôde ser usada: ${lastIssue} Reescreva o conteúdo completo a partir dos dados originais, de forma mais concisa. Limite cada image_prompt a 1500 caracteres, caption a 2000 e alt_text a 800. Preserve a marca, os fatos, as características obrigatórias e a quantidade de artes. Não corte frases, não invente informações e não inclua explicações fora do JSON.`;
  }
  throw new Error(`${lastIssue} A tentativa automática de ajuste também não foi concluída. Tente gerar o conteúdo novamente; se persistir, simplifique a ideia ou os dados da marca.`);
}
