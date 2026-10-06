import sharp from "sharp";
import type { CampaignFormat } from "../types.js";

export function imageDimensions(format: CampaignFormat) {
  if (format === "4:5") return { width: 1080, height: 1350 };
  if (format === "9:16") return { width: 1080, height: 1920 };
  if (format === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1080 };
}

export function imageRequestSize(format: CampaignFormat, model: string) {
  // GPT Image 2 accepts custom dimensions; keep legacy model compatibility.
  if (/^gpt-image-2(?:$|-)/.test(model)) {
    if (format === "4:5") return "1024x1280";
    if (format === "9:16") return "1008x1792";
    if (format === "16:9") return "1792x1008";
    return "1024x1024";
  }
  if (format === "16:9") return "1536x1024";
  if (format === "4:5" || format === "9:16") return "1024x1536";
  return "1024x1024";
}

export function imageFramingInstruction(format: CampaignFormat, model: string) {
  const { width, height } = imageDimensions(format);
  const [sourceWidth, sourceHeight] = imageRequestSize(format, model).split("x").map(Number);
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const horizontal = Math.ceil(((1 - width / (sourceWidth * scale)) / 2 + 0.05) * 100);
  const vertical = Math.ceil(((1 - height / (sourceHeight * scale)) / 2 + 0.05) * 100);
  return `FORMATO FINAL: ${format}, ${width}x${height}. Preencha toda a tela com o fundo da composição, até as quatro bordas, sem faixas externas, moldura branca ou letterboxing. Não copie faixas externas de referências ou da arte antiga; reconstrua o fundo até as bordas. Branco como parte intencional da paleta e do layout é permitido. Mantenha textos, rostos e elementos essenciais na área segura: pelo menos ${horizontal}% de distância das laterais e ${vertical}% do topo e da base da imagem gerada. O acabamento usa reenquadramento central proporcional, nunca estica a arte.`;
}

export async function fitImageToCanvas(buffer: Buffer, format: CampaignFormat) {
  const { width, height } = imageDimensions(format);
  // Never add white padding. Exact-ratio outputs scale without cropping; legacy
  // provider sizes use a centered crop, with safe areas specified in the prompt.
  return sharp(buffer).resize(width, height, { fit: "cover", position: "centre" }).png().toBuffer();
}
