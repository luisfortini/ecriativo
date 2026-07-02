import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config.js";
import type { BrandOverlayPosition } from "../contracts/index.js";
import { get } from "../db/connection.js";
import { recordCampaignPipelineEvent } from "./campaignPipelineService.js";

const STEP_KEY = "brand_overlay";
const SAFE_POSITIONS = new Set<BrandOverlayPosition>([
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
  "bottom_center"
]);
const MAX_REMOTE_IMAGE_BYTES = 30 * 1024 * 1024;

interface BrandOverlayInput {
  campaignId: number;
  pipelineRunId: number;
  clientId: number;
  generatedImagePath: string | null;
  generatedImageUrl: string;
  overlay: {
    logoRequired: boolean;
    preferredPosition: string;
    sizePercent: number;
  };
}

export interface BrandOverlayResult {
  applied: boolean;
  finalImagePath: string | null;
  finalImageUrl: string;
}

export async function applyBrandOverlay(input: BrandOverlayInput): Promise<BrandOverlayResult> {
  const fallback = (): BrandOverlayResult => ({
    applied: false,
    finalImagePath: input.generatedImagePath,
    finalImageUrl: input.generatedImageUrl
  });

  try {
    if (!input.overlay.logoRequired) {
      await safeEvent(input, "overlay_skipped", "info", "Brand Overlay dispensado pelo Agente Criativo.", {
        overlay: input.overlay
      });
      return fallback();
    }

    if (!SAFE_POSITIONS.has(input.overlay.preferredPosition as BrandOverlayPosition)) {
      await safeEvent(input, "invalid_position", "warning", "Posicao de logo invalida; imagem original mantida.", {
        preferred_position: input.overlay.preferredPosition
      });
      return fallback();
    }

    if (!Number.isInteger(input.overlay.sizePercent) || input.overlay.sizePercent < 8 || input.overlay.sizePercent > 20) {
      await safeEvent(input, "composition_failed", "warning", "Tamanho de logo invalido; imagem original mantida.", {
        size_percent: input.overlay.sizePercent
      });
      return fallback();
    }

    const logo = await get<{ id: number; file_url: string }>(
      `SELECT id, file_url
       FROM client_assets
       WHERE client_id = ? AND type = 'logo_main'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [input.clientId]
    );
    if (!logo) {
      await safeEvent(input, "logo_missing", "warning", "Cliente sem logo principal; imagem original mantida.");
      return fallback();
    }

    const generatedSource = await loadGeneratedImage(input.generatedImagePath, input.generatedImageUrl);
    const logoPath = await resolveUploadedAssetPath(logo.file_url);
    await validateMainLogoFile(logoPath);

    const baseMetadata = await sharp(generatedSource).metadata();
    if (!baseMetadata.width || !baseMetadata.height) throw new Error("Dimensoes da imagem gerada nao puderam ser identificadas.");

    const margin = Math.max(16, Math.round(Math.min(baseMetadata.width, baseMetadata.height) * 0.04));
    const requestedWidth = Math.round(baseMetadata.width * (input.overlay.sizePercent / 100));
    const maxLogoHeight = Math.max(1, baseMetadata.height - margin * 2);
    const resizedLogo = await sharp(logoPath)
      .resize({
        width: requestedWidth,
        height: maxLogoHeight,
        fit: "inside",
        withoutEnlargement: false
      })
      .png()
      .toBuffer({ resolveWithObject: true });

    const position = calculatePosition(
      input.overlay.preferredPosition as BrandOverlayPosition,
      baseMetadata.width,
      baseMetadata.height,
      resizedLogo.info.width,
      resizedLogo.info.height,
      margin
    );
    const outputDir = path.resolve("generated");
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `brand-overlay-${input.campaignId}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
    const outputPath = path.join(outputDir, filename);

    await sharp(generatedSource)
      .composite([{ input: resizedLogo.data, left: position.left, top: position.top }])
      .png()
      .toFile(outputPath);

    const finalImageUrl = `${config.publicBaseUrl}/generated/${filename}`;
    await safeEvent(input, "overlay_applied", "info", "Logo principal aplicada com sucesso.", {
      logo_asset_id: Number(logo.id),
      preferred_position: input.overlay.preferredPosition,
      size_percent: input.overlay.sizePercent,
      safety_margin_px: margin,
      output_url: finalImageUrl
    });
    return { applied: true, finalImagePath: outputPath, finalImageUrl };
  } catch (error) {
    await safeEvent(input, "composition_failed", "error", "Falha ao compor Brand Overlay; imagem original mantida.", {
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
    return fallback();
  }
}

export async function validateMainLogoFile(filePath: string) {
  const [metadata, stats] = await Promise.all([sharp(filePath).metadata(), sharp(filePath).stats()]);
  if (metadata.format !== "png") throw new Error("A logo principal deve ser um arquivo PNG.");
  if (!metadata.hasAlpha || stats.isOpaque) throw new Error("A logo principal deve possuir fundo transparente.");
}

function calculatePosition(
  position: BrandOverlayPosition,
  imageWidth: number,
  imageHeight: number,
  logoWidth: number,
  logoHeight: number,
  margin: number
) {
  const right = imageWidth - logoWidth - margin;
  const bottom = imageHeight - logoHeight - margin;
  if (position === "top_left") return { left: margin, top: margin };
  if (position === "top_right") return { left: right, top: margin };
  if (position === "bottom_left") return { left: margin, top: bottom };
  if (position === "bottom_center") return { left: Math.round((imageWidth - logoWidth) / 2), top: bottom };
  return { left: right, top: bottom };
}

async function loadGeneratedImage(imagePath: string | null, imageUrl: string): Promise<string | Buffer> {
  if (imagePath) {
    await fs.access(imagePath);
    return imagePath;
  }

  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Nao foi possivel carregar a imagem gerada: HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REMOTE_IMAGE_BYTES) throw new Error("Imagem gerada excede o limite de 30 MB.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_REMOTE_IMAGE_BYTES) throw new Error("Imagem gerada excede o limite de 30 MB.");
  return buffer;
}

async function resolveUploadedAssetPath(fileUrl: string) {
  const filename = path.basename(new URL(fileUrl).pathname);
  const decodedFilename = decodeURIComponent(filename);
  const uploadDirectories = [path.resolve("uploads"), path.resolve("backend", "uploads")];
  for (const uploadsDir of uploadDirectories) {
    const assetPath = path.resolve(uploadsDir, decodedFilename);
    if (path.dirname(assetPath) !== uploadsDir) continue;
    try {
      await fs.access(assetPath);
      return assetPath;
    } catch {
      // Tenta o diretorio usado pela outra forma de inicializacao do backend.
    }
  }
  throw new Error("Arquivo da logo principal nao foi encontrado.");
}

async function safeEvent(
  input: Pick<BrandOverlayInput, "campaignId" | "pipelineRunId">,
  eventType: "overlay_applied" | "logo_missing" | "invalid_position" | "composition_failed" | "overlay_skipped",
  severity: "info" | "warning" | "error",
  message: string,
  metadata?: unknown
) {
  try {
    await recordCampaignPipelineEvent({
      campaignId: input.campaignId,
      pipelineRunId: input.pipelineRunId,
      stepKey: STEP_KEY,
      eventType,
      severity,
      message,
      metadata
    });
  } catch (error) {
    console.error("Nao foi possivel registrar evento do Brand Overlay.", error);
  }
}
