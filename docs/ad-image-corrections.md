# Correção de artes de anúncios

Na página de resultado do anúncio, use **Corrigir arte**, descreva o ajuste e confirme **Gerar versão corrigida**. A correção afeta a imagem, não a legenda ou o briefing. A IA usa a imagem existente e o perfil atual da marca, incluindo idioma, cores e dados públicos.

## Comportamento

- Proprietários e administradores podem solicitar correções. Membros podem visualizar o histórico.
- O pedido entra numa fila persistente. O worker verifica a fila a cada minuto; sair da página não cancela o trabalho. Enquanto a página está aberta, o andamento é atualizado a cada cinco segundos.
- Existe no máximo uma correção ativa por anúncio. A solicitação identifica a versão exibida, evitando substituir inadvertidamente uma imagem atualizada por outra pessoa.
- A arte atual permanece disponível até a geração e a aplicação da marca terminarem. Em caso de erro, ela não é alterada.
- A imagem sem logo aplicada é preferida como referência, evitando duplicar a assinatura. Se necessário, a imagem final é utilizada como base. A logo oficial atual é aplicada depois. Fotos de produtos e pessoas têm suas autorizações verificadas antes e depois da geração.
- Se nenhuma imagem original estiver disponível, a correção falha antes de iniciar a geração paga; não cria uma arte diferente silenciosamente.
- A nova versão volta para **Aguardando revisão**. Aprovação e envio ficam bloqueados na interface durante a correção; a API também bloqueia avaliações enquanto há pedido ativo. A correção nunca envia WhatsApp nem publica automaticamente.
- O histórico guarda pedido, solicitante, datas, erro e imagens antes/depois. Arquivos anteriores não são apagados.
- Operações em processamento há mais de 30 minutos são marcadas como interrompidas. Não há repetição automática de chamadas pagas; um novo pedido precisa ser confirmado pelo usuário.

## Implantação e limites

A migração `017_campaign_image_corrections` é aplicada na inicialização da API. A tabela possui isolamento por organização, referências compostas para anúncio/cliente e um índice que impede correções ativas duplicadas. Nenhuma aprovação antiga é apagada; avaliações anteriores não aprovam uma nova versão.

A geração utiliza a integração de imagens configurada e registra o custo como reprocessamento do anúncio. Alterações feitas por IA podem exigir uma nova revisão ou pedido de ajuste. A interface apresenta o aviso de custo antes da confirmação.

## Verificação

- `npm run test:campaign-corrections --workspace backend`: validação de pedidos e regras do prompt.
- `npm run smoke:campaign-corrections --workspace backend`: banco PostgreSQL isolado em schema temporário, engine de imagem simulada e nenhuma chamada paga. Requer `STAGING_DATABASE_URL` ou indicação explícita de `CORRECTION_TEST_ENV` apontando ao `.env` do banco de testes autorizado. O script remove apenas o schema criado naquela execução.
- `frontend/tests/ad-corrections-ui.cjs`: navegador com APIs e imagens fictícias; valida formulário, falhas locais, fila, recarga, acompanhamento, histórico, nova aprovação, retry manual, permissões e celular.

Os testes automatizados não certificam a qualidade de uma imagem produzida pelo provedor real. Uma revisão com geração real pode ser feita após implantação, considerando o custo.
