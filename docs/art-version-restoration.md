# Usar uma versão anterior

No histórico dos anúncios, cada imagem concluída tem “Usar esta versão” e a arte
atual está identificada como “Versão em uso”. A confirmação troca a imagem sem
reescrever a legenda. Tanto a versão anterior quanto a substituída continuam
disponíveis no histórico. Uma restauração adiciona um registro concluído ao mesmo
histórico antes/depois, com usuário e descrição de restauração, sem gerar imagem.

No social media, “Usar versão N” restaura o conjunto completo de artes e a legenda
salva na revisão (texto alternativo, prompts e direção também são recuperados).
O estado atual é acrescentado às revisões antes da troca, permitindo desfazer a
restauração. Questões de qualidade registradas na versão antiga não são apagadas.
Versões parciais ou arquivos ausentes não podem substituir a arte atual.

Ambos exigem nova aprovação, não geram custo de IA e não enviam WhatsApp nem
publicam automaticamente. Apenas owner/admin podem restaurar. As alterações são
transacionais e isoladas por empresa, com verificação da base visível para rejeitar
trocas concorrentes ou tela desatualizada. Produções/correções em andamento são
bloqueadas. No social, agendamentos scheduled/publishing/uncertain precisam ser
cancelados ou reconciliados primeiro; publicações realizadas não são modificadas.

Não há migração: são reutilizados campaign_image_corrections e social_contents.revisions.

Verificação: build, test:art-versions, smoke:art-versions em esquema descartável do
banco autorizado, testes existentes de correção/publicação e testes de interface
studio-ui/ad-corrections-ui com dados fictícios. O smoke valida voltar/retornar,
preservação de histórico, reaprovação, falhas sem substituição, bloqueios e RLS,
sem nenhuma chamada de IA.
