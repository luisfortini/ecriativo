# Estúdio de criação — primeira etapa

O ponto de entrada `/criar` reúne anúncio e planejamento social. Ambos percorrem
marca/ideia → identidade/imagens → conferência. Os campos específicos continuam
separados: oferta e formato no anúncio; assuntos, volume, formatos e limite no social.
Rotas antigas de criação redirecionam para o estúdio. A edição de planos existentes,
revisão de anúncios e conteúdos e agendamento continuam nos módulos atuais.

## Direção compartilhada

- `creationBrandRules` fornece idioma atual, paleta, tipografia, contatos e proteção
  contra assinatura/logos de outra empresa às duas produções.
- `resolveCreationStyle` usa arquivos da mesma marca, dentro do contexto da empresa.
  Seleção explícita fica no JSON `visual_selection.style_asset_id`, sem migração.
- Seleção automática: referência/anúncio aprovado mais recente; na falta de um
  arquivo utilizável, imagem de referência cadastrada. Logo e referências rejeitadas
  nunca são usadas como estilo. PDFs e imagens animadas não entram como referência.
- Uma escolha explícita ausente/inválida falha antes da geração. Seleção automática
  ignora arquivos ausentes/não utilizáveis e usa o perfil textual se não houver imagem.
- Carrosséis continuam usando o primeiro slide como âncora dos demais. A referência
  selecionada orienta a primeira arte; regras do cadastro prevalecem sobre a âncora.
- Produtos e pessoas são filtrados no seletor conforme autorização para anúncios ou
  conteúdo orgânico. A validação no servidor continua obrigatória.

## Custos e segurança

Salvar planejamento cria plano pausado, sem pesquisa/geração automática. Ativação,
planejamento da semana, revisão e agendamento permanecem explícitos. Anúncios ainda
geram imediatamente ao confirmar e respeitam o envio WhatsApp previamente configurado.
O arquivo adicional de briefing dos anúncios não é prometido como imagem de estilo;
para isso, deve-se cadastrar e escolher uma referência visual da biblioteca.

## Ainda não incluído

Esta etapa não é um motor gráfico determinístico completo. Textos/layout ainda dependem
da geração de imagem; apenas a aplicação da logo/composição já existente é determinística.
A qualidade estética precisa ser avaliada com gerações reais, não apenas testes de
interface. Revisão visual automática continua disponível para social, não foi ampliada
para anúncios nesta etapa. Não há geração paga real nos testes.

Próximas etapas: persistir direção visual preferida por marca, unificar edição/revisão,
avaliar famílias de layouts com texto renderizado pelo sistema e validar resultados
de ponta a ponta com marcas reais e orçamento de IA definido.

## Verificação

`test:creation`, testes existentes de conteúdo/correções/publicação, build completo,
`frontend/tests/creation-ui.cjs` e `frontend/tests/studio-ui.cjs` (APIs fictícias).
`smoke:creation` usa esquema temporário isolado no banco autorizado, testa arquivos
inválidos/ausentes, persistência e isolamento entre marcas/empresas e remove esse esquema.
