# Biblioteca visual e produção editorial

## Uso

1. Em **Clientes → Dados gerais**, preencha país, estado, cidade, fuso horário e dia/mês do aniversário da empresa. O ano de fundação é opcional. Para 29/02, anos não bissextos usam 28/02.
2. Em **Produtos e pessoas**, cadastre os itens e suas fotos (até 12 por item, 12 MB por envio, mínimo 256 × 256). As fotos são normalizadas, com metadados removidos, para no máximo 2048 × 2048.
3. Aprove cada item e autorize separadamente anúncios e conteúdo orgânico. Pessoas exigem registro da autorização. É possível definir validade e arquivar sem apagar o histórico.
4. Na campanha, escolha nenhum, seleção automática ou seleção manual de produtos/pessoas. A opção “Não incluir pessoas” também proíbe pessoas genéricas no prompt. O plano recorrente permite seleção automática por cliente.
5. Em **Social media**, defina cliente, quantidade semanal, pilares, formatos, limite de imagens e modo assistido/automático. Ative o plano para permitir a produção. Planos novos começam pausados.
6. Revise as pautas, edite os textos, produza, aprove/reprove, copie a legenda e baixe as artes. Refazer exige orientação e mantém a versão anterior no histórico de dados.

## Produção e segurança

- Um lote por plano e semana (segunda a domingo), no fuso do cliente. Na primeira ativação durante uma semana, distribui as pautas pelos dias restantes. O aniversário ocupa uma das publicações da quantidade contratada, não gera cobrança extra automática.
- Pesquisa web busca oportunidades atuais e datas municipais/regionais. Aceita apenas URLs citadas pelo provedor e datas dentro das janelas esperadas; as fontes aparecem nos conteúdos. A evidência ainda precisa de revisão humana: o sistema não garante cobertura de todas as datas municipais.
- Sem pesquisa confiável, usa pilares e o aniversário informado, sinalizando indisponibilidade. Não inventa feriados para preencher o calendário.
- O worker executa a cada minuto enquanto o backend está ligado. A reserva de produção é atômica; lotes semanais são únicos e imagens já persistidas não são repetidas na retomada.
- O limite é por plano/semana, contando chamadas de imagem, inclusive tentativas com erro. Carrossel usa três artes. Não é um teto monetário global; texto, pesquisa e taxas do provedor também custam. O registro atual de custos de texto não inclui a tarifa da ferramenta web.
- Fotos são privadas por organização. A seleção exige vínculo com o cliente, aprovação, autorização para a finalidade e validade. Autorizações são revalidadas antes de cada nova chamada de imagem; pausar não desfaz uma chamada já enviada ao provedor.
- Tentativas interrompidas por mais de 30 minutos viram falha para revisão manual, sem repetição paga silenciosa. Retomadas preservam referências já usadas. Refazer com ajustes cria nova versão e nova seleção autorizada.
- Conteúdos produzidos ficam em revisão. A implementação não publica nas redes, não cria campanhas pagas nas plataformas e não autoriza gasto em mídia.

## Modos de imagem

- **Referência:** envia os arquivos efetivos ao endpoint de edição de imagens. Pode alterar detalhes do produto ou da pessoa; revisar fidelidade antes de aprovar.
- **Colagem:** gera o fundo e aplica as fotografias normalizadas sem redesenhar o produto/pessoa. Não promete recorte automático nem integração fotográfica perfeita.
- Formatos finais: post 1080 × 1350, story 1080 × 1920; cada carrossel tem três imagens. Texto alternativo e legenda são produzidos separadamente.

## Operação

- A migração `012_content_library_and_editorial` adiciona as tabelas com RLS e vínculos compostos entre organização/cliente; preserva dados e fluxos anteriores.
- Configuração existente: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_TIMEOUT_MS`, `UPLOAD_FILES_DIR`, `GENERATED_FILES_DIR`, `PUBLIC_BASE_URL`.
- O modelo de texto deve suportar Responses com `web_search` e saída estruturada; o de imagem deve suportar edição com múltiplas referências. Sem chave, fotos reais e produção editorial falham explicitamente, sem criar imagem fictícia de produto.
- Apenas administradores/proprietários gerenciam biblioteca e planos editoriais. Membros podem consultar a biblioteca autorizada.
- Não ativar planos reais antes de revisar limites e permissões. Disponibilidade de tendências é pesquisa web, não integração com APIs privadas de Google Trends/TikTok.

## Verificação

`npm run typecheck --workspaces --if-present`, `npm run build`, `npm run test:tenant --workspace backend`.

`npm run smoke:content --workspace backend` usa `STAGING_DATABASE_URL`, cria um schema e arquivos temporários e os remove ao terminar. Valida biblioteca, isolamento, imagens autenticadas, calendário, idempotência, fila, revisão e revogação. As chamadas de IA são simuladas, sem custo. Não execute com banco não autorizado.

Teste opcional real: `CONFIRM_LIVE_CONTENT_TEST=yes`, `STAGING_DATABASE_URL` e a chave/modelos configurados, seguido de `node --import tsx backend/src/scripts/smokeContentLive.ts` na raiz. Consome uma pesquisa web, uma redação e uma imagem com produto fictício. Apaga os dados temporários, mas o consumo permanece faturado pelo provedor.

Documentação de integração consultada: https://developers.openai.com/api/docs/guides/image-generation e https://developers.openai.com/api/docs/guides/tools-web-search.
