# Estúdio guiado

## Experiência

- Navegação principal: Início, Criar, Revisar, Calendário, marca, redes e configurações.
- Agência/profissional seleciona a marca no cabeçalho. Empresa usa sua marca automaticamente.
- O tipo pertence à organização; não é um papel de usuário e não amplia permissões.
- Ferramentas existentes continuam acessíveis em Mais ferramentas.
- Cadastro em quatro etapas: empresa, identidade/idioma, fotos e resumo.
- Plano social em três etapas: ideia, imagens e confirmação.
- Revisão com arte e legenda lado a lado, navegação por página e correção seletiva.
- Conexão Meta e calendário têm páginas próprias; agendamentos mantêm as validações existentes.
- Erros locais ficam visíveis junto à ação e no aviso persistente, inclusive após rolagem.

## Dados e compatibilidade

A migração 016 adiciona account_type (company/agency) em organizations e contact_phone,
instagram_handle e address em clients. Contas existentes permanecem agency. Nenhum
cliente é removido. Proprietários podem mudar o tipo em Configurações; converter para
company exige no máximo uma marca. Criação simultânea de marcas é serializada com
alterações do tipo da conta para respeitar esse limite.

Os contatos públicos são opcionais, validados, persistidos e enviados ao contexto dos
anúncios, à produção social e às correções que reescrevem conteúdo. O telefone público
não substitui o destinatário interno configurado para WhatsApp. O @ é armazenado sem
o prefixo e enviado aos geradores com @. Endereço é distinto da cidade usada na pesquisa.
Alterações valem para novas gerações/correções; não reescrevem automaticamente publicações
aprovadas ou agendadas.

As operações SQL em lote agora respeitam o mesmo contexto de organização e transação
das consultas comuns. Isso corrige a preparação de agent_versions de contas novas.

## Verificação

- npm run typecheck
- npm run build
- npm run test:studio --workspace backend
- npm run test:tenant --workspace backend
- npm run test:editorial-output --workspace backend
- npm run test:social-publishing --workspace backend
- npm run smoke:studio --workspace backend (STAGING_DATABASE_URL; esquema temporário)
- frontend/tests/studio-ui.cjs: Playwright, APIs simuladas, nenhuma geração ou publicação real.
  Configure PLAYWRIGHT_MODULE, opcionalmente PLAYWRIGHT_CHANNEL, STUDIO_PREVIEW_URL
  e STUDIO_QA_DIR. Verifica 736/360/320px, agência/empresa, marcas, cadastro, plano social,
  correção seletiva, aprovação, agendamento e navegação móvel.

A migração é aplicada na inicialização do backend, como as demais. Esta implementação
não habilita a publicação real na Meta nem altera suas credenciais ou limites de IA.
