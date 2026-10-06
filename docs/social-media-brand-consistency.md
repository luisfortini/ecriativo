# Idioma e identidade do Social Media

O idioma é definido no cliente, em **Tom de voz → Idioma dos conteúdos e artes**. Um valor explícito prevalece sobre observações antigas. Cadastros sem esse valor mantêm a compatibilidade com menções a inglês/espanhol no tom de voz, nas restrições ou nas observações; caso contrário, usam português brasileiro. País e cidade não determinam o idioma.

A produção mantém uma direção visual compartilhada, salva em `social_contents.visual_direction`. Cada arte recebe o perfil atual com paleta, cores proibidas, tipografia, estilos aprovados/proibidos e restrições. A capa usa uma referência aprovada do próprio cliente, quando disponível; as demais páginas recebem a primeira arte como referência visual. A logo principal oficial é aplicada depois da geração, em tamanho e posição uniformes.

Cada imagem passa por uma revisão visual de idioma, marca e estilo. Problemas são salvos em `images[].quality_issues`, aparecem junto à arte e impedem que o conteúdo passe para revisão final. A revisão por IA não substitui a revisão humana e pode produzir falsos positivos. Ela acrescenta uma chamada de texto com visão por imagem, registrada em Custos de IA; uma reprovação não dispara novas imagens automaticamente.

Para corrigir um conteúdo antigo:

1. Salve o idioma e as regras visuais no cadastro do cliente.
2. Selecione as artes no Social Media e descreva os ajustes.
3. Para mudar idioma ou refazer a identidade inteira, marque **Reescrever legenda e textos das artes no idioma atual do cliente**. Todas as páginas de cada conteúdo escolhido serão refeitas.
4. Sem essa opção, a legenda e as artes não selecionadas são preservadas.

Uma refação interrompida mantém as versões antigas pendentes e pode continuar sem repetir a reescrita de texto nem as artes já concluídas. O histórico preserva a direção visual e as imagens anteriores. O limite do plano continua sendo aplicado a cada tentativa de imagem.

A migração `014_social_brand_and_language` adiciona o idioma ao cliente e a direção visual ao conteúdo. A criação e a atualização do perfil aceitam idioma vazio sem violar a restrição do banco. O upload de referências sem extensão é identificado pelo conteúdo do arquivo.
