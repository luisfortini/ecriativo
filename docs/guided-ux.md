# Interface guiada — e-Criativo

## Identidade e componentes

A cor principal permanece `#070021`, com superfícies brancas. Os apoios usam cinzas frios (`#f5f7fa`, `#edf1f6`) e o hover `#17243b`. Vermelho, âmbar e verde são reservados a feedback semântico, acompanhado de texto.

Use `btn-primary` para a ação principal, `btn-secondary` para ações de apoio e `btn-danger` para confirmações destrutivas/reprovação. Use `field`, `label`, `helper`, `panel` e `status-badge` para manter consistência. O estilo base também protege botões sem classes legadas.

## Fluxos

- Anúncios: cliente e ideia → imagens e formato → revisão e geração. Os valores permanecem em memória entre etapas e após falhas de envio; configurações avançadas são opcionais. Não há gravação automática de rascunho após recarregar ou sair da página.
- Social media: revisão separada da configuração dos planos; filtros por situação; seleção individual ou em lote; correção contextual persistente durante rolagem; motivo da reprovação no próprio conteúdo.
- Navegação agrupada por tarefa, com menu recolhível no celular e manutenção das permissões existentes.

## Feedback

`ErrorBanner` mantém a mensagem contextual e publica um aviso fixo em `FeedbackProvider`. Não existe fechamento por temporizador. Avisos iguais são agrupados; o fechamento mostra o aviso anterior, se houver. Os fluxos de campanha e social media removem o aviso correspondente após uma nova tentativa bem-sucedida. Os avisos são limpos ao sair ou mudar de empresa, para não misturar contextos.

Campos essenciais da campanha e o pedido de correção têm validação contextual, descrição acessível e foco no campo que precisa de atenção. Formulários restantes mantêm sua validação existente e recebem o novo feedback persistente para erros da API.

## Verificação realizada

- Checagem TypeScript de backend e frontend e build de produção do frontend.
- Navegador local com API fictícia isolada, sem acesso ao banco de dados ou chamadas de IA.
- Campanha: campos obrigatórios, etapas, resumo, falha de envio e manutenção da ideia ao voltar.
- Correção: somente uma arte enviada, falha simulada mantendo seleção/texto e nova tentativa bem-sucedida.
- Validação inline do pedido de correção vazio.
- Menu móvel: abertura, navegação e fechamento após mudar de página.
- Responsividade em 390 e 320 pixels, sem transbordamento horizontal nas telas verificadas.

Não houve migração de banco, alteração das APIs, envio para a main ou implantação no servidor. A verificação com dados reais e provedores de IA deve ser feita em homologação antes da publicação.
