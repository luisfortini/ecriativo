# Agendamento de Instagram e Facebook

## Primeira versão

O Social Media permite conectar contas por cliente, ativar somente as contas autorizadas, agendar conteúdos aprovados por rede e acompanhar resultados. Instagram recebe posts e carrosséis; Facebook recebe posts com uma ou várias fotos, não um carrossel de anúncio. Stories, Reels, métricas e escolha automática de melhores horários não fazem parte desta versão.

As datas do planejamento editorial continuam sendo sugestões. Publicação exige um agendamento separado com conta, data, horário e fuso IANA (por exemplo `America/Sao_Paulo` ou `America/New_York`). A aprovação humana é obrigatória. A legenda do Instagram não pode ultrapassar 2.200 caracteres. Imagens são preparadas em JPEG, com até 8 MB e proporção de feed entre 4:5 e 1,91:1.

## Configuração no EasyPanel

1. Criar/configurar um aplicativo Meta com Facebook Login e acesso às APIs de Páginas e Instagram. Esta implementação usa Facebook Login: o Instagram deve ser profissional e estar vinculado à Página.
2. Configurar `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (uma versão suportada pelo app) e `META_REDIRECT_URI`. A URL de retorno deve ser exatamente `https://SUA_API/api/social-publishing/meta/callback`, cadastrada entre as URLs OAuth permitidas na Meta. Configurar os domínios, política de privacidade e tratamento/exclusão de dados exigidos pela Meta antes do uso comercial.
3. Gerar `SOCIAL_TOKEN_ENCRYPTION_KEY`: 32 bytes aleatórios em hexadecimal, 64 caracteres. Exemplo local: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guardar com segurança no EasyPanel e no backup de configuração. Não enviar a chave ou o segredo Meta para o frontend. Trocar/perder a chave exige reconectar contas e invalida autorizações/links de mídia anteriores.
4. Usar `PUBLIC_BASE_URL` HTTPS, publicamente acessível pela Meta. As imagens normais continuam privadas. A Meta recebe links temporários criptografados de uma imagem específica de uma publicação em andamento; expiram em duas horas e deixam de funcionar ao encerrar a execução. Evitar registrar os caminhos completos desses links e a query do callback OAuth no proxy/analytics.
5. Manter `SOCIAL_PUBLISHING_ENABLED=false`. Conectar a conta em Social Media, autorizar somente as Páginas do cliente e atualizar conexões. As contas novas/reconectadas ficam desativadas até escolha explícita do administrador.
6. Validar permissões `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic` e `instagram_content_publish`, além dos requisitos de revisão/acesso avançado/verificação que a Meta aplicar ao aplicativo. Contas de clientes externos não devem ser consideradas prontas apenas porque contas com papel de teste funcionam. A implementação não cria nem aprova o aplicativo Meta.
7. Após aprovação e validação, liberar `SOCIAL_PUBLISHING_ENABLED=true` somente quando houver autorização para publicação real. Fazer uma primeira publicação controlada em contas de teste antes de clientes. Confirmar token, acesso das imagens, legenda, ordem do carrossel e link final.

## Segurança operacional

- Tokens de Página são criptografados com AES-256-GCM; não aparecem nas respostas do frontend ou no histórico. OAuth usa estado criptografado de uso único, vinculado a empresa, cliente e administrador, válido por dez minutos.
- Novas tabelas usam RLS e chaves estrangeiras compostas por empresa/cliente. Só proprietários e administradores gerenciam conexões e publicações.
- Enquanto um conteúdo está agendado, publicando ou com resultado incerto, textos, imagens e aprovação não podem ser alterados. Cancelar os agendamentos primeiro; execuções em andamento não podem ser canceladas.
- Para reagendar, cancelar o registro pendente e criar outro horário. Desativar ou reconectar a conta cancela agendamentos pendentes. A desconexão/reconexão é bloqueada enquanto há publicação em andamento ou incerta. A desativação local não revoga o aplicativo na Meta; para revogar/remover acesso permanentemente, usar as configurações da Meta.
- O worker consulta a fila a cada minuto e processa uma publicação por empresa por execução. O instante de aparecimento na rede pode variar. Sem a liberação global, a fila não publica. Agendamentos atrasados em mais de 15 minutos falham sem envio e exigem novo horário; evita disparar em massa conteúdos vencidos ao reiniciar/ativar o servidor.
- Nenhuma falha provoca reenvio automático. Falhas antes do pedido final de publicação são marcadas `failed`. Se o pedido final pode ter chegado à rede ou a execução foi interrompida, o estado é `uncertain`. Um administrador deve conferir diretamente na rede e registrar o resultado antes de novo agendamento. A confirmação manual é uma decisão humana, não prova obtida pela API.
- O registro de sucesso é persistido antes de buscar o link; uma falha na busca do link não provoca publicação duplicada. Conteúdo já publicado não é republicado na mesma conta por este fluxo. Correções podem produzir outra versão das artes, mas devem ser tratadas como um novo conteúdo para uma nova publicação.
- O fuso é interpretado no servidor; horários inexistentes por transição de horário de verão são rejeitados. Evitar horários ambíguos nessa transição.

## Validação

`npm run test:social-publishing --workspace backend` testa criptografia, regras de aprovação e chamadas simuladas à Meta. `npm run smoke:social-publishing --workspace backend` exige `STAGING_DATABASE_URL`, cria um schema temporário com a migração 015 e valida RLS, fuso, fila, mídia, OAuth e resultados incertos, sem tráfego real de publicação. O schema é removido ao final. Nenhum teste substitui a validação real do aplicativo Meta e das permissões.

Referências: [Instagram — coleção oficial da Meta](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00), [Pages API — Posts](https://developers.facebook.com/docs/pages-api/posts/), [Facebook Login](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/).
