import sharp from "sharp";
import { all } from "../db/connection.js";
import { AppError } from "../utils/errors.js";
import { mediaFilename, readMedia } from "./mediaStorageService.js";
export { creationBrandRules } from "./socialBrandContract.js";

export interface StyleAsset { id: number; type: string; file_url: string; }
export const styleAssetTypes = ["approved_reference", "approved_ad", "reference_image"] as const;

// Both production paths use the same priority. Logos are applied separately.
export function styleCandidates(assets: StyleAsset[], selectedId?: number | null) {
  const eligible = assets.filter(asset => styleAssetTypes.includes(asset.type as typeof styleAssetTypes[number]));
  if (selectedId != null) {
    const selected = eligible.find(asset => Number(asset.id) === selectedId);
    if (!selected) throw new AppError("A referência de estilo não pertence a esta marca ou não pode ser usada. Escolha outra imagem.", 422);
    return [selected];
  }
  return eligible.sort((a, b) => {
    const priority = (asset: StyleAsset) => asset.type === "reference_image" ? 1 : 0;
    return priority(a) - priority(b) || Number(b.id) - Number(a.id);
  });
}

export async function resolveCreationStyle(clientId: number, selectedId?: number | null) {
  const assets = await all<StyleAsset>("SELECT id,type,file_url FROM client_assets WHERE client_id=? ORDER BY id DESC", [clientId]);
  for (const asset of styleCandidates(assets, selectedId)) {
    try {
      const filename = mediaFilename(asset.file_url);
      const stored = await readMedia("uploads", filename);
      const metadata = await sharp(stored.data, { limitInputPixels: 40_000_000 }).metadata().catch(() => undefined);
      if (metadata?.format && ["png", "jpeg", "webp"].includes(metadata.format) && (metadata.pages ?? 1) === 1) return { ...asset, id:Number(asset.id), filename };
    } catch (error) {
      if (selectedId != null) throw new AppError("A referência escolhida está indisponível. Restaure o arquivo ou escolha outra imagem antes de gerar.", 422);
      if (!(error instanceof AppError && error.statusCode === 404)) throw error;
    }
  }
  if (selectedId != null) throw new AppError("Use uma imagem PNG, JPG ou WEBP estática como referência de estilo, não PDF ou logo.", 422);
  return undefined;
}

