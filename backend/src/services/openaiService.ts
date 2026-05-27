import OpenAI from "openai";
import type { ResponseTextConfig } from "openai/resources/responses/responses";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { CampaignFormat, CreativeOutput, NormalizedBriefing, StrategyOutput } from "../types.js";

const strategySchema = {
  type: "object",
  additionalProperties: false,
  required: ["angulo", "publico", "promessa", "headline", "texto_principal", "cta", "briefing_criativo"],
  properties: {
    angulo: { type: "string" },
    publico: { type: "string" },
    promessa: { type: "string" },
    headline: { type: "string" },
    texto_principal: { type: "string" },
    cta: { type: "string" },
    briefing_criativo: { type: "string" }
  }
} as const;

const creativeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["prompt_imagem", "negative_prompt", "direcao_visual_resumida"],
  properties: {
    prompt_imagem: { type: "string" },
    negative_prompt: { type: "string" },
    direcao_visual_resumida: { type: "string" }
  }
} as const;

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey, timeout: config.openaiTimeoutMs }) : null;

function outputText(response: OpenAI.Responses.Response): string {
  const text = response.output_text;
  if (!text) throw new Error("A resposta da OpenAI veio sem texto estruturado.");
  return text;
}

function jsonFormat(name: string, schema: { [key: string]: unknown }): ResponseTextConfig {
  return {
    format: {
      type: "json_schema",
      name,
      schema,
      strict: true
    }
  };
}

export async function runStrategistAgent(input: NormalizedBriefing, referenceFilePath?: string): Promise<StrategyOutput> {
  if (!client) return localStrategy(input);

  const response = await client.responses.create({
    model: config.textModel,
    input: [
      {
        role: "system",
        content:
          "Voce e o Agente Estrategista do e-Criativo. Gere estrategia de anuncio em portugues do Brasil, especifica, acionavel e pronta para performance. Use a memoria do cliente como padrao, mas priorize dados da campanha atual. Respeite restricoes, cores proibidas, politicas do segmento e CTAs preferidos. Responda somente no JSON do schema."
      },
      {
        role: "user",
        content: `Contexto completo da campanha e memoria do cliente:\n${JSON.stringify(
          { ...input, arquivo_referencia_campanha: referenceFilePath ?? null },
          null,
          2
        )}`
      }
    ],
    text: jsonFormat("estrategia_e_criativo", strategySchema)
  });

  return JSON.parse(outputText(response)) as StrategyOutput;
}

export async function runCreativeAgent(input: NormalizedBriefing, strategy: StrategyOutput): Promise<CreativeOutput> {
  if (!client) return localCreative(input, strategy);

  const response = await client.responses.create({
    model: config.textModel,
    input: [
      {
        role: "system",
        content:
          "Voce e o Agente Criativo do e-Criativo. Transforme o briefing estrategico em prompt de imagem publicitaria claro. Preserve identidade visual do cliente, cite assets disponiveis por URL quando forem relevantes, siga estilos aprovados e evite estilos reprovados, cores proibidas, logos inventados e texto ilegivel. Responda somente no JSON do schema."
      },
      {
        role: "user",
        content: JSON.stringify({ briefing_normalizado: input, estrategia: strategy }, null, 2)
      }
    ],
    text: jsonFormat("criativo_e_criativo", creativeSchema)
  });

  return JSON.parse(outputText(response)) as CreativeOutput;
}

export async function generateImage(prompt: string, format: CampaignFormat) {
  if (!client) return createLocalPlaceholder(prompt, format);

  const response = await client.images.generate({
    model: config.imageModel,
    prompt,
    size: imageSize(format),
    quality: "medium",
    n: 1
  });

  const image = response.data?.[0];
  if (image?.b64_json) {
    const buffer = Buffer.from(image.b64_json, "base64");
    return saveGeneratedImage(buffer, "png");
  }

  if (image?.url) return { imagePath: null, imageUrl: image.url };

  throw new Error("A geracao de imagem nao retornou arquivo ou URL.");
}

function imageSize(format: CampaignFormat) {
  if (format === "16:9") return "1536x1024" as const;
  if (format === "4:5" || format === "9:16") return "1024x1536" as const;
  return "1024x1024" as const;
}

async function saveGeneratedImage(buffer: Buffer, extension: "png" | "webp" | "jpg" | "svg") {
  const dir = path.resolve("generated");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const imagePath = path.join(dir, filename);
  await fs.writeFile(imagePath, buffer);
  return {
    imagePath,
    imageUrl: `${config.publicBaseUrl}/generated/${filename}`
  };
}

async function createLocalPlaceholder(prompt: string, format: CampaignFormat) {
  const width = format === "16:9" ? 1536 : 1024;
  const height = format === "1:1" ? 1024 : 1536;
  const escaped = prompt.slice(0, 260).replace(/[<>&]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#070021"/><rect x="64" y="64" width="${width - 128}" height="${height - 128}" rx="28" fill="#f8fafc"/><text x="96" y="140" font-family="Arial" font-size="44" font-weight="700" fill="#070021">e-Criativo - modo local</text><foreignObject x="96" y="190" width="${width - 192}" height="${height - 280}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;font-size:30px;line-height:1.35;color:#334155">${escaped}</div></foreignObject></svg>`;
  return saveGeneratedImage(Buffer.from(svg), "svg");
}

function localStrategy(input: NormalizedBriefing): StrategyOutput {
  return {
    angulo: `Transformar ${input.offer} em uma decisao simples para ${input.target_audience || "o publico principal"}.`,
    publico: input.target_audience,
    promessa: `Ajudar ${input.target_audience || "o publico"} a avancar em ${input.objective} com uma oferta clara e alinhada a ${input.client.name}.`,
    headline: `${input.offer} para ${input.client.segment || input.client.name}`,
    texto_principal: `Campanha com tom ${input.brand_voice || "definido pela marca"}, respeitando posicionamento, restricoes e historico criativo do cliente.`,
    cta: input.preferred_ctas.split("\n")[0]?.replace(/^- /, "") || "Conheca a oferta",
    briefing_criativo: `Anuncio ${input.format} para ${input.client.name}, segmento ${input.client.segment || "nao informado"}, paleta ${input.color_palette || "da marca"}, referencias ${input.visual_references || "memoria visual do cliente"}, estilos aprovados ${input.approved_styles || "nao informados"}, evitar ${input.forbidden_styles || "estilos fora da marca"}.`
  };
}

function localCreative(input: NormalizedBriefing, strategy: StrategyOutput): CreativeOutput {
  return {
    prompt_imagem: `${strategy.briefing_criativo}. Composicao publicitaria moderna, hierarquia clara, tom ${input.brand_voice}, tipografia ${input.preferred_typography || "limpa"}, assets disponiveis: ${input.assets.map((asset) => `${asset.type}: ${asset.file_url}`).join(", ") || "nenhum"}. Sem texto pequeno ilegivel, pronto para midia paga.`,
    negative_prompt: `baixa resolucao, texto distorcido, logotipos inventados, poluicao visual, aparencia amadora, ${input.forbidden_colors}, ${input.forbidden_styles}`,
    direcao_visual_resumida: `Criativo ${input.format} com foco na promessa: ${strategy.promessa}`
  };
}
