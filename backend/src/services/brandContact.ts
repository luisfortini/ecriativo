import { z } from "zod";

export const brandContactFields = {
  contact_phone: z.string().trim().max(40, "O telefone deve ter até 40 caracteres.")
    .refine(value => !value || (/^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, "").length >= 7), "Informe um telefone válido, incluindo o código da região.").optional(),
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
