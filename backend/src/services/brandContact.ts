import { z } from "zod";

export function normalizeContactPhone(value: string) {
  // Paste-friendly display normalization only: never infer a country or alter digits.
  return value.normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, "-")
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
    .trim();
}

export const brandContactFields = {
  contact_phone: z.string().transform(normalizeContactPhone)
    .refine(value => value.length <= 40, "O telefone deve ter até 40 caracteres.")
    .refine(value => !value || (/^\+?[0-9\s().-]+$/.test(value) && value.replace(/[^0-9]/g, "").length >= 7),
      "Informe um telefone com código de área. Ex.: 401-555-0123 ou +1 (401) 555-0123. O código do país é opcional para divulgação.").optional(),
  instagram_handle: z.string().trim().transform(value => value.replace(/^@/, ""))
    .refine(value => !value || /^[a-zA-Z0-9._]{1,30}$/.test(value), "Informe apenas o @ do Instagram, sem o link do perfil.").optional(),
  address: z.string().trim().max(500, "O endereço deve ter até 500 caracteres.").optional()
};

export function brandContactContext(client: { contact_phone?: string | null; instagram_handle?: string | null; address?: string | null }) {
  return {
    telefone: client.contact_phone?.trim() || undefined,
    instagram: client.instagram_handle?.trim() ? `@${client.instagram_handle.trim().replace(/^@/, "")}` : undefined,
    endereco: client.address?.trim() || undefined,
    uso: "Use estes dados exatos nas legendas e nas artes quando houver chamada para contato, visita ou perfil. Nunca invente contato, endereço ou @. Não é necessário repetir em todas as páginas de um carrossel."
  };
}
