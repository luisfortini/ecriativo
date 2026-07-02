# Arquitetura Funcional de IA do e-Criativo

**Status do documento:** documentação oficial do estado atual
**Data de referência:** 1º de julho de 2026
**Escopo:** arquitetura funcional de IA, contratos entre agentes, memória, persistência, pipeline e Brand Overlay
**Público principal:** especialistas responsáveis por criar, revisar e evoluir os prompts dos agentes

---

## Finalidade deste documento

Este documento descreve o funcionamento real do sistema de IA do e-Criativo sem exigir leitura do código-fonte. Ele deve ser usado como referência para:

- escrever prompts compatíveis com o pipeline atual;
- entender exatamente quais informações cada agente recebe;
- entender quais decisões pertencem a cada agente;
- preservar os contratos oficiais entre agentes;
- evitar que um prompt tente executar responsabilidades que pertencem ao backend;
- diferenciar recursos existentes de extensões futuras ainda não implementadas.

O sistema possui três agentes de texto:

1. Agente Analista de Marca;
2. Agente Estrategista;
3. Agente Criativo.

A geração da imagem e a aplicação da marca não são agentes. Elas são etapas operacionais executadas pelo backend:

4. Geração de imagem;
5. Brand Overlay.

Todos os agentes oficiais ativos estão atualmente configurados com o modelo `gpt-5.5`. O modelo, a temperatura, o limite de saída e o texto dos prompts podem ser alterados na Central de Agentes. Os contratos oficiais, por outro lado, não são editáveis pela interface.

Embora exista uma temperatura armazenada para cada agente, o executor atual não envia o parâmetro de temperatura para modelos cujo nome começa por `gpt-5` ou `o`. Portanto, as temperaturas listadas neste documento são configurações persistidas, mas não controlam atualmente as chamadas feitas ao `gpt-5.5`.

---

# 1. Visão geral do pipeline

## 1.1 Fluxo funcional completo

O fluxo atual de uma nova campanha é:

```text
Cadastro e memória do cliente
        ↓
Briefing livre e campos específicos da campanha
        ↓
Normalização do briefing
        ↓
Obtenção ou geração do ProfileDiagnostic ativo
        ↓
Criação do Campaign Pipeline Run
        ↓
Agente Estrategista
        ↓
CreativeBrief oficial
        ↓
Agente Criativo
        ↓
CreativeOutput oficial
        ↓
Geração da imagem sem logo
        ↓
Brand Overlay
        ↓
Imagem final
        ↓
Persistência, histórico, custos e notificação
```

Esse fluxo é usado tanto por campanhas criadas manualmente quanto por campanhas disparadas pelo planejador automático. O planejador prepara um briefing automático e chama o mesmo processo de criação de campanha.

No planejador, uma falha pode reenfileirar a geração completa conforme a política de tentativas da fila. Isso não equivale à retomada de uma etapa interna do mesmo run.

## 1.2 Seleção do cliente

Toda nova campanha precisa estar vinculada a um cliente existente.

O cliente é a unidade de memória reutilizável. É nele que ficam:

- dados institucionais;
- público;
- posicionamento;
- tom de voz;
- identidade visual;
- restrições;
- aprendizados;
- materiais;
- referências aprovadas e reprovadas;
- diagnósticos de perfil;
- campanhas anteriores.

O pipeline não cria um cliente implícito e não executa uma campanha sem vínculo com um cliente.

## 1.3 Briefing da campanha

O briefing inicial possui:

- briefing livre obrigatório;
- objetivo opcional;
- oferta opcional;
- formato obrigatório;
- público-alvo opcional;
- tom de marca opcional;
- paleta opcional;
- referências visuais opcionais;
- restrições opcionais;
- observações opcionais;
- arquivo de referência opcional.

Os formatos atualmente aceitos são:

- `1:1`;
- `4:5`;
- `9:16`;
- `16:9`.

Os campos preenchidos especificamente na campanha têm prioridade sobre os valores equivalentes presentes na memória do cliente durante a normalização.

## 1.4 Normalização do briefing

Antes de chamar um agente, o sistema cria um snapshot normalizado da campanha.

Esse snapshot combina:

- dados atuais da campanha;
- perfil cadastrado do cliente;
- análise de marca legada mais recente;
- memória textual do cliente;
- materiais aprovados e reprovados;
- resumos de assets;
- aprendizados registrados;
- informações visuais extraídas anteriormente;
- resumos de campanhas recentes.

O snapshot normalizado é persistido na própria campanha. Isso permite saber qual era o contexto consolidado no momento da geração.

Importante: o snapshot normalizado é mais amplo que o contexto efetivamente enviado ao Estrategista. O pipeline usa projeções menores para reduzir consumo de tokens.

## 1.5 Garantia do diagnóstico ativo

Antes de iniciar o run da campanha, o sistema procura um `ProfileDiagnostic` com status `active` para o cliente.

Se já existir:

- o diagnóstico é reutilizado;
- o Agente Analista de Marca não é chamado novamente;
- várias campanhas podem usar o mesmo diagnóstico.

Se não existir:

- o Agente Analista de Marca é executado automaticamente;
- ele recebe o cadastro do cliente, os assets existentes e uma observação de que se trata do diagnóstico inicial automático;
- o diagnóstico produzido torna-se o diagnóstico ativo;
- o pipeline da campanha passa a referenciar esse diagnóstico.

O diagnóstico automático criado nesse momento não coleta automaticamente o conteúdo das URLs salvas no cadastro. A coleta de site e Instagram acontece quando essas URLs são enviadas explicitamente na ação de análise da marca. No diagnóstico automático, as URLs continuam visíveis dentro do objeto do cliente, mas o backend não faz uma nova leitura pública delas.

## 1.6 Criação da campanha antes das chamadas de IA

A campanha é persistida antes da execução do Estrategista.

Seu estado inicial é `processing`.

Esse comportamento garante que:

- falhas sejam associadas a uma campanha real;
- logs possam apontar diretamente para a campanha;
- o pipeline possa ser auditado;
- a campanha possa terminar em `failed` sem desaparecer.

## 1.7 Criação do Pipeline Run

Depois que existe uma campanha e um diagnóstico ativo, o sistema cria um `CampaignPipelineRun`.

O run vincula:

- campanha;
- cliente;
- diagnóstico utilizado;
- snapshot normalizado de entrada;
- estado geral da execução;
- etapa atual;
- horários de início e fim;
- eventual mensagem de erro.

Uma campanha pode ter mais de um run ao longo do tempo, embora a interface atual ainda não ofereça uma operação completa para reexecutar etapas individualmente.

## 1.8 Etapa `creative_brief`

O Agente Estrategista recebe:

```text
profile_diagnostic
campaign_briefing
```

O `campaign_briefing` enviado ao agente contém:

- `freeBriefing`: briefing livre, limitado a 1.800 caracteres;
- `objective`: objetivo, limitado a 500 caracteres;
- `offer`: oferta, limitada a 500 caracteres;
- `format`: formato da campanha;
- `targetAudienceOverride`: público atual, limitado a 500 caracteres;
- `restrictions`: restrições da campanha, limitadas a 700 caracteres;
- `observations`: observações, limitadas a 700 caracteres;
- `approvedReferences`: referências aprovadas resumidas;
- `rejectedReferences`: referências reprovadas resumidas;
- `campaignReferenceFile`: caminho do arquivo de referência, quando enviado.

O agente deve produzir exatamente um `CreativeBrief` oficial.

Esse artefato contém a estratégia, a copy e a direção visual. Estratégia relevante não deve ficar fora dele.

## 1.9 Persistência do Creative Brief

O `CreativeBrief` é validado contra seu contrato TypeBox.

Se estiver válido:

- é salvo como artefato `creative_brief`;
- recebe versão dentro do run;
- é associado ao agente;
- é associado à versão do agente;
- é associado ao log da execução que o produziu.

Se estiver inválido:

- a execução do agente falha;
- o run fica `failed`;
- a campanha fica `failed`;
- o Criativo não é executado.

## 1.10 Etapa `creative_output`

O Agente Criativo recebe:

```text
profile_diagnostic
creative_brief
output_format
```

Ele não recebe:

- o arquivo binário da logo;
- o conteúdo visual da logo;
- o arquivo original da imagem final, pois ela ainda não existe;
- a lista completa de assets do cliente;
- liberdade para alterar o Creative Brief;
- liberdade para aplicar a logo.

Sua responsabilidade é traduzir o Creative Brief em instruções para o modelo de imagem e sugerir os parâmetros de Brand Overlay.

Sua saída obrigatória é um `CreativeOutput`.

## 1.11 Persistência do Creative Output

O `CreativeOutput` é validado contra seu contrato TypeBox.

Se estiver válido:

- é salvo como artefato `creative_output`;
- recebe versão dentro do run;
- é ligado ao agente, à versão do agente e ao log da execução.

O objeto `brandOverlay` faz parte do contrato oficial. Ele não é uma observação livre.

## 1.12 Etapa `image_generation`

O modelo de imagem recebe um prompt composto por:

1. `imagePrompt`, produzido pelo Agente Criativo;
2. `negativePrompt`, acrescentado como conteúdo a evitar;
3. uma instrução fixa do backend para não desenhar, recriar ou incorporar logotipos;
4. uma instrução para reservar espaço visual para a aplicação posterior da logo original.

O modelo de imagem não recebe a logo original.

Essa separação é intencional: o modelo gera apenas o layout visual da peça.

A imagem produzida nessa etapa é a imagem original da IA e é preservada em:

- `image_path`: caminho local da imagem gerada;
- `image_url`: URL da imagem gerada.

Esses campos não devem apontar para a versão com overlay.

## 1.13 Etapa `brand_overlay`

Depois da geração da imagem, o backend executa o `BrandOverlayService`.

Ele usa a sugestão `brandOverlay` do Creative Output para decidir:

- se a logo deve ser aplicada;
- qual posição utilizar;
- qual percentual de largura utilizar.

O backend:

- localiza a logo principal oficial do cliente;
- valida o arquivo;
- carrega a imagem gerada;
- redimensiona a logo proporcionalmente;
- calcula uma margem de segurança;
- compõe a logo sobre a imagem;
- salva uma nova imagem final.

A imagem original nunca é sobrescrita.

## 1.14 Conclusão da campanha

Se as etapas obrigatórias de IA e geração de imagem forem concluídas:

- os formatos legados são preenchidos por adapters;
- `final_image_url` recebe a URL final;
- a campanha passa para `completed`;
- o pipeline run passa para `completed`;
- custos e tokens são associados à campanha;
- a notificação de conclusão pode ser disparada.

Se o Brand Overlay não puder ser aplicado:

- a campanha continua normalmente;
- o pipeline continua normalmente;
- `final_image_url` recebe a própria `image_url`;
- um evento técnico é registrado.

Se Estrategista, Criativo ou geração de imagem falharem:

- a campanha passa para `failed`;
- o pipeline run passa para `failed`;
- a mensagem de erro é persistida.

## 1.15 Operação sem API configurada

Se não existir chave OpenAI configurada:

- cada agente oficial usa uma resposta local determinística compatível com seu contrato;
- a geração de imagem cria um placeholder local;
- contratos, persistência, pipeline e Brand Overlay continuam sendo exercitados.

Esse modo é um fallback de desenvolvimento. Ele não representa a qualidade ou o comportamento criativo do modelo real.

---

# 2. Agentes existentes

## 2.1 Agente Analista de Marca

### Identificação

- Nome: `Agente Analista de Marca`
- Chave interna: `brand_analyzer_agent`
- Ordem configurada: `0`
- Contrato: `profile_diagnostic@1.0.0`
- Modelo atual: `gpt-5.5`
- Temperatura atual: `0.3`
- Limite atual de saída: `2.200` tokens

### Finalidade

Transformar dados institucionais, informações públicas, textos, metadados e materiais cadastrados em um diagnóstico estruturado e reutilizável da marca.

### Responsabilidade

O Analista deve identificar padrões observáveis da marca, tais como:

- tom de voz;
- posicionamento;
- público provável;
- paleta;
- estilo visual;
- padrões de conteúdo;
- CTAs recorrentes;
- palavras recorrentes;
- sugestões de estilos a manter;
- sugestões de estilos a evitar;
- lacunas de informação;
- nível de confiança.

### Entrada efetiva

O contexto contém:

#### `client`

Perfil completo do cliente, incluindo campos cadastrais, assets e diagnósticos já relacionados. Antes do envio, dados excessivos como históricos completos, logs e outputs brutos são removidos pelo compactador.

#### `sources`

Fontes coletadas durante a análise:

- página pública de site;
- página pública de Instagram;
- texto manual.

Para páginas públicas, o sistema tenta extrair:

- texto visível do HTML;
- até 12 URLs de imagens;
- status da coleta.

A extração não autentica em redes sociais, não atravessa bloqueios e não acessa conteúdo privado.

#### `manual_notes`

Texto manual fornecido pelo usuário ou uma observação automática de criação inicial do diagnóstico.

#### `uploaded_materials`

Lista de materiais selecionados, contendo:

- ID;
- tipo;
- URL;
- descrição;
- feedback do usuário;
- status de análise.

Os arquivos não são enviados ao agente como entrada multimodal. O agente recebe seus URLs e metadados em JSON. Portanto, o prompt não deve presumir que o modelo “viu” efetivamente cada imagem.

#### `rules`

Regras fixas:

- nunca usar conteúdo privado;
- nunca burlar login, bloqueios ou permissões;
- não sobrescrever dados cadastrais automaticamente;
- tratar materiais aprovados como referência positiva;
- tratar materiais reprovados como referência negativa.

### Saída

Produz exatamente um `ProfileDiagnostic`.

### O que pode fazer

- inferir padrões sustentados pelos dados recebidos;
- apontar nível de confiança;
- apontar informações ausentes;
- sugerir estilos aprovados e proibidos;
- consolidar linguagem, posicionamento e público;
- produzir diagnóstico mesmo com informação incompleta, desde que declare as lacunas.

### O que não pode fazer

- inventar fatos não observados;
- afirmar acesso a páginas privadas;
- afirmar que visualizou um arquivo quando recebeu somente URL e metadados;
- alterar diretamente o Creative Brief;
- gerar prompt de imagem;
- criar a imagem final;
- aplicar logo;
- alterar o cadastro do cliente por conta própria;
- devolver campos fora do `ProfileDiagnostic`.

### Persistência e efeito

Ao concluir:

- cria uma análise de marca no formato legado para compatibilidade;
- cria uma nova versão de `client_profile_diagnostics`;
- torna essa nova versão `active`;
- marca o diagnóstico anteriormente ativo como `superseded`;
- registra origem, hash das fontes e rastreabilidade da execução;
- atualiza resumos de assets analisados.

O diagnóstico oficial se torna ativo imediatamente. A aplicação manual de sugestões ao cadastro do cliente é uma operação separada.

---

## 2.2 Agente Estrategista

### Identificação

- Nome: `Agente Estrategista`
- Chave interna: `strategist_agent`
- Ordem configurada: `1`
- Contrato: `creative_brief@2.0.0`
- Modelo atual: `gpt-5.5`
- Temperatura atual: `0.4`
- Limite atual de saída: `1.800` tokens

### Finalidade

Transformar o diagnóstico do cliente e o briefing atual em um Creative Brief completo, acionável e estruturado.

### Responsabilidade

O Estrategista é responsável por decidir:

- objetivo interpretado da campanha;
- público da peça;
- estágio do funil;
- ângulo;
- promessa;
- benefício central;
- objeção a combater;
- headline;
- subheadline;
- CTA;
- legenda final pronta para publicação;
- tom de voz;
- gatilhos permitidos;
- restrições;
- conceito e direção visual;
- hierarquia;
- instruções para imagem;
- instruções para legenda.

### Entrada efetiva

#### `profile_diagnostic`

O diagnóstico ativo completo, exatamente no contrato `ProfileDiagnostic`.

#### `campaign_briefing`

Projeção reduzida da campanha:

- briefing livre;
- objetivo;
- oferta;
- formato;
- público atual;
- restrições;
- observações;
- referências aprovadas resumidas;
- referências reprovadas resumidas;
- caminho do arquivo de referência, se houver.

O caminho do arquivo de referência é texto. O Estrategista não recebe automaticamente o conteúdo binário ou visual desse arquivo.

### Regra de prioridade

O prompt deve tratar o briefing atual como prioridade.

O diagnóstico define padrões da marca, mas não deve substituir:

- oferta específica;
- objetivo específico;
- restrição específica;
- observação específica;
- público sobrescrito na campanha.

### Saída

Produz exatamente um `CreativeBrief`.

### O que pode fazer

- interpretar o briefing;
- selecionar um estágio de funil;
- escolher um ângulo estratégico;
- definir copy;
- escrever a legenda final pronta para publicação;
- orientar a composição;
- consolidar restrições;
- decidir como o conceito será traduzido visualmente;
- usar referências positivas e negativas resumidas.

### O que não pode fazer

- produzir um formato próprio fora do contrato;
- omitir campos obrigatórios;
- criar um segundo objeto de estratégia fora do Creative Brief;
- alterar o Profile Diagnostic;
- aplicar a logo;
- determinar coordenadas em pixels;
- gerar imagem;
- tratar o caminho de um arquivo como se tivesse visualizado seu conteúdo;
- depender de histórico recente que não esteja presente no payload;
- sobrescrever a memória do cliente.

### Regra da legenda

O campo `adCaption` deve conter a legenda final completa, pronta para copiar, enviar por WhatsApp ou publicar. Ele não pode conter instruções, comentários editoriais ou frases como “escreva uma legenda”.

O campo `captionInstructions` permanece separado e contém somente orientações editoriais reutilizáveis para futuras adaptações.

---

## 2.3 Agente Criativo

### Identificação

- Nome: `Agente Criativo`
- Chave interna: `creative_agent`
- Ordem configurada: `2`
- Contrato: `creative_output@1.0.0`
- Modelo atual: `gpt-5.5`
- Temperatura atual: `0.5`
- Limite atual de saída: `1.800` tokens

### Finalidade

Traduzir o Creative Brief em instruções finais para o modelo de imagem e em uma sugestão estruturada de Brand Overlay.

### Responsabilidade

O Criativo deve:

- preservar as decisões do Creative Brief;
- criar um prompt de imagem claro;
- criar instruções negativas;
- resumir a direção visual;
- decidir se recomenda aplicação de logo;
- sugerir uma única posição permitida;
- sugerir tamanho entre 8% e 20%.

### Entrada efetiva

#### `profile_diagnostic`

Diagnóstico completo da marca.

#### `creative_brief`

Creative Brief oficial completo.

#### `output_format`

Formato da peça: `1:1`, `4:5`, `9:16` ou `16:9`.

### Saída

Produz exatamente um `CreativeOutput`.

### O que pode fazer

- detalhar cena, composição, atmosfera e acabamento;
- transformar `imageInstructions` em um prompt adequado ao modelo visual;
- consolidar elementos a evitar;
- escolher a posição mais equilibrada para a logo futura;
- indicar se a logo é necessária;
- sugerir o tamanho percentual.

### O que não pode fazer

- mudar a estratégia;
- reescrever o Creative Brief como uma nova estratégia;
- inventar outra posição de logo;
- usar percentual abaixo de 8 ou acima de 20;
- desenhar, recriar, estilizar ou incorporar a logo;
- pedir que o modelo de imagem gere uma logo;
- incluir a logo dentro do `imagePrompt`;
- aplicar o overlay;
- alterar cor, transparência ou proporção da logo;
- adicionar sombra, brilho ou efeito à logo;
- devolver campos fora do `CreativeOutput`.

### Regra absoluta de logo

O Criativo não recebe a logo para manipulá-la. Ele deve planejar espaço de respiro e devolver somente:

```json
{
  "logoRequired": true,
  "preferredPosition": "bottom_right",
  "sizePercent": 14
}
```

O backend toma a decisão operacional final de aplicar ou não, com base na validade do contrato e na disponibilidade da logo.

---

## 2.4 Componentes que não são agentes

### Gerador de imagem

É uma chamada direta ao modelo de imagem configurado. Não possui prompt independente editável na Central de Agentes.

Recebe o conteúdo preparado pelo Creative Output e instruções fixas adicionais do backend.

### Brand Overlay

É um motor determinístico de composição com Sharp. Não usa modelo de linguagem e não toma decisão estratégica.

### Briefing Normalizer

É uma etapa determinística de preparação de dados. Não é um agente.

### Campaign Planner

Organiza agenda, fila, variações e limites de geração. Não é um agente editorial e não produz estratégia por conta própria.

---

# 3. Contratos oficiais

## 3.1 Princípio dos contratos

Os contratos são a interface oficial entre as etapas.

Eles não dependem da redação de um prompt. Um prompt pode ser alterado, mas sua saída continua obrigada a respeitar o mesmo contrato enquanto `contract_version` não mudar.

Versões atuais:

- `ProfileDiagnostic`: `1.0.0`;
- `CreativeBrief`: `2.0.0`;
- `CreativeOutput`: `1.0.0`.

Todos os campos são obrigatórios. Campos extras são proibidos.

## 3.2 ProfileDiagnostic

### Objetivo

Representar uma leitura estruturada, versionada e reutilizável da marca.

### Quem produz

Agente Analista de Marca.

### Quem consome

- Agente Estrategista;
- Agente Criativo;
- perfil do cliente;
- histórico de diagnósticos;
- pipeline run, por referência ao diagnóstico utilizado.

### Campos

| Campo | Significado funcional |
|---|---|
| `schemaVersion` | Versão do contrato. Atualmente `1.0.0`. |
| `brandVoice` | Características do tom e da forma de comunicação. |
| `positioning` | Posicionamento percebido ou recomendado com base nas fontes. |
| `targetAudience` | Público principal inferido. |
| `colorPalette` | Lista de cores associadas à marca. |
| `visualStyle` | Descrição consolidada do estilo visual. |
| `contentPatterns` | Padrões recorrentes de conteúdo. |
| `commonCtas` | CTAs recorrentes ou adequados à marca. |
| `recurringWords` | Palavras ou expressões recorrentes observadas. |
| `approvedStyleSuggestions` | Estilos sugeridos como positivos. |
| `forbiddenStyleSuggestions` | Estilos sugeridos como negativos. |
| `strategicNotes` | Aprendizados estratégicos consolidados. |
| `confidenceScore` | Confiança numérica entre `0` e `1`. |
| `missingInformation` | Informações ausentes que limitam a análise. |

### Regras semânticas

- `confidenceScore` não é uma nota de qualidade estética; é confiança na análise com os dados disponíveis.
- `missingInformation` deve ser usado de forma honesta.
- listas devem conter itens objetivos, não parágrafos repetidos.
- não existe campo opcional: ausência de evidência deve ser representada por texto ou lista vazia compatível com o significado do campo.

## 3.3 CreativeBrief

### Objetivo

Ser a fonte única de verdade da estratégia, copy e direção visual de uma campanha.

### Quem produz

Agente Estrategista.

### Quem consome

- Agente Criativo;
- frontend de resultado;
- adapter de compatibilidade;
- histórico de artefatos;
- futuras etapas de conteúdo que venham a ser criadas.

### Campos estratégicos e de copy

| Campo | Significado funcional |
|---|---|
| `schemaVersion` | Versão do contrato. |
| `campaignObjective` | Objetivo funcional interpretado para a campanha. |
| `targetAudience` | Público específico da peça. |
| `funnelStage` | Estágio do funil escolhido. É texto livre no contrato atual. |
| `communicationAngle` | Recorte estratégico central. |
| `mainPromise` | Promessa principal. |
| `centralBenefit` | Benefício central comunicado. |
| `objectionAddressed` | Objeção que a comunicação combate. |
| `headline` | Headline principal. |
| `subheadline` | Complemento da headline. |
| `callToAction` | CTA principal. |
| `toneOfVoice` | Tom de voz desta campanha. |
| `allowedTriggers` | Lista de gatilhos permitidos. |
| `restrictions` | Lista de restrições obrigatórias. |

### Campo `visualDirection`

| Subcampo | Significado funcional |
|---|---|
| `concept` | Conceito visual central. |
| `emotion` | Emoção que a composição deve transmitir. |
| `composition` | Organização visual sugerida. |
| `colorPalette` | Paleta aplicável à peça. |
| `visualElements` | Elementos visuais desejados. |
| `avoid` | Elementos ou abordagens a evitar. |

### Campos de execução criativa

| Campo | Significado funcional |
|---|---|
| `elementHierarchy` | Ordem de prioridade dos elementos. |
| `imageInstructions` | Instruções para criação da imagem. |
| `adCaption` | Legenda final completa e pronta para publicação. |
| `captionInstructions` | Instruções para o texto principal/legenda. |

### Regras semânticas

- não deve existir estratégia relevante fora desse contrato;
- `adCaption` é a copy entregue ao usuário e alimenta o campo legado `texto_principal`;
- `captionInstructions` é somente orientação e nunca deve ser exibido como legenda final;
- `adCaption` deve usar o idioma adequado ao briefing e não pode conter metalinguagem;
- `elementHierarchy` é uma lista ordenada;
- `restrictions` e `visualDirection.avoid` não são equivalentes: a primeira lista regras gerais; a segunda lista proibições visuais específicas;
- o contrato não define uma enumeração fechada para `funnelStage`; o prompt deve manter nomenclatura consistente.

## 3.4 CreativeOutput

### Objetivo

Representar a tradução executável do Creative Brief para a geração de imagem e para a etapa de Brand Overlay.

### Quem produz

Agente Criativo.

### Quem consome

- gerador de imagem;
- BrandOverlayService;
- frontend;
- adapter de compatibilidade;
- histórico de artefatos.

### Campos

| Campo | Significado funcional |
|---|---|
| `schemaVersion` | Versão do contrato. |
| `imagePrompt` | Prompt positivo para a imagem, sem logo. |
| `negativePrompt` | Conteúdo visual que deve ser evitado. |
| `visualDirectionSummary` | Resumo curto da direção final. |
| `brandOverlay` | Recomendação estruturada para aplicação posterior da marca. |

### `brandOverlay`

| Campo | Regra |
|---|---|
| `logoRequired` | Booleano. Indica se o agente recomenda aplicar a logo. |
| `preferredPosition` | Deve ser uma das cinco posições permitidas. |
| `sizePercent` | Inteiro entre `8` e `20`. |

Posições permitidas:

- `top_left`;
- `top_right`;
- `bottom_left`;
- `bottom_right`;
- `bottom_center`.

### Regras semânticas

- `imagePrompt` nunca deve solicitar logo;
- `negativePrompt` deve reforçar a ausência de logos inventadas quando necessário;
- a posição é uma sugestão sem coordenadas;
- o percentual representa a largura desejada da logo em relação à largura da imagem;
- o backend valida novamente todos os valores.

---

# 4. Pipeline

## 4.1 CampaignPipelineService

O `CampaignPipelineService` é o coordenador funcional dos runs de campanha.

Suas responsabilidades são:

- criar um run;
- validar a relação entre campanha, cliente e diagnóstico;
- registrar a etapa atual;
- controlar estados;
- executar uma operação dentro de uma etapa;
- marcar falha quando uma etapa lança erro;
- salvar e versionar artefatos;
- validar artefatos;
- garantir rastreabilidade;
- registrar e consultar eventos;
- concluir o run.

Ele não:

- escreve estratégia;
- cria prompts;
- gera imagem;
- aplica logo;
- escolhe conteúdo.

## 4.2 Pipeline Run

Um Pipeline Run representa uma execução completa do fluxo para uma campanha.

Ele guarda:

- campanha;
- cliente;
- diagnóstico utilizado;
- status;
- etapa atual;
- snapshot de entrada;
- erro;
- data de início;
- data de fim;
- artefatos;
- eventos.

## 4.3 Estados do run

### `pending`

Run criado, mas nenhuma etapa iniciada.

### `running`

Alguma etapa está em execução.

O campo `current_step` indica qual etapa foi iniciada mais recentemente.

### `completed`

Pipeline concluído e campanha atualizada.

### `failed`

Uma etapa obrigatória falhou.

### `cancelled`

Estado previsto no modelo. Não existe atualmente uma operação completa de cancelamento do pipeline exposta ao usuário.

## 4.4 Etapas atuais

### `creative_brief`

Executa o Estrategista e salva `creative_brief`.

### `creative_output`

Executa o Criativo e salva `creative_output`.

### `image_generation`

Executa o modelo de imagem e preserva a imagem original.

### `brand_overlay`

Executa a composição determinística da logo.

### `profile_diagnostic`

É registrada como chave de etapa no log da execução do Analista, mas a criação do diagnóstico acontece antes do Pipeline Run da campanha. Portanto, ela não aparece atualmente como uma etapa interna do mesmo run.

## 4.5 Falhas

Quando `creative_brief`, `creative_output` ou `image_generation` lançam erro:

- o run passa a `failed`;
- a campanha passa a `failed`;
- o erro é persistido;
- etapas posteriores não são executadas.

O Brand Overlay é deliberadamente diferente:

- captura suas próprias falhas;
- registra evento;
- retorna a imagem original;
- não lança a falha ao orquestrador;
- permite conclusão do run.

## 4.6 Versionamento de artefatos

Cada artefato tem:

- `artifact_type`;
- `schema_version`;
- `version`;
- `status`;
- `payload`;
- agente;
- versão do agente;
- log da execução.

O versionamento é por tipo e por run.

Exemplo:

```text
Run 10
  creative_brief v1
  creative_output v1
```

Se outro artefato do mesmo tipo for salvo no mesmo run:

- recebe a próxima versão;
- versões anteriores em `draft` ou `completed` passam para `superseded`.

Atualmente só existem dois tipos de artefato:

- `creative_brief`;
- `creative_output`.

A imagem e o resultado do overlay não são artefatos genéricos. São persistidos em campos da campanha e em eventos técnicos.

## 4.7 Rastreabilidade

Um artefato pode apontar para:

- agente que produziu;
- versão do agente;
- log exato da execução;
- run;
- versão do contrato.

Antes de salvar, o sistema verifica:

- se a versão pertence ao agente informado;
- se o log pertence ao run;
- se o log pertence ao agente.

---

# 5. Persistência

## 5.1 Diagnósticos oficiais

Tabela funcional: `client_profile_diagnostics`.

Cada registro guarda:

- cliente;
- número da versão;
- versão do schema;
- status;
- payload JSONB;
- hash das fontes;
- snapshot das fontes;
- agente;
- versão do agente;
- log de execução;
- datas.

Estados:

- `draft`;
- `active`;
- `superseded`;
- `failed`.

O fluxo atual cria diretamente um diagnóstico `active`.

Existe no máximo um diagnóstico ativo por cliente.

## 5.2 Análises de marca legadas

Tabela funcional: `client_brand_analysis`.

Ela continua sendo preenchida para:

- tela de comparação;
- aplicação manual de sugestões ao cadastro;
- compatibilidade com código anterior;
- fallback da memória consolidada.

Essa análise não é o contrato oficial entre agentes. O contrato oficial é `ProfileDiagnostic`.

## 5.3 Creative Briefs e Creative Outputs

São armazenados em `campaign_artifacts` como JSONB.

O campo `artifact_type` diferencia:

- `creative_brief`;
- `creative_output`.

O payload mantém a forma canônica camelCase dos contratos.

## 5.4 Campanhas

A tabela de campanhas mantém:

- briefing livre;
- briefing normalizado;
- estratégia legada;
- criativo legado;
- IDs dos agentes;
- imagem original;
- imagem final;
- status;
- erro.

### Imagem original

- `image_path`;
- `image_url`.

### Imagem final

- `final_image_url`.

Quando o overlay é aplicado, `final_image_url` aponta para um novo PNG.

Quando o overlay não é aplicado, `final_image_url` recebe `image_url`.

## 5.5 Logs de execução dos agentes

Cada execução registra:

- agente;
- chave do agente;
- versão do agente;
- cliente;
- campanha;
- pipeline run;
- etapa;
- entrada compactada;
- prompt final;
- output bruto;
- output parseado;
- status;
- erro;
- tokens de entrada;
- tokens de saída;
- total de tokens;
- tamanho do contexto;
- alerta de contexto excessivo;
- latência.

## 5.6 Custos

O uso dos agentes e da geração de imagem é registrado separadamente para acompanhamento de custos.

O sistema associa consumo a:

- cliente;
- campanha;
- plano;
- fila;
- agente;
- operação;
- modelo.

O Brand Overlay não é uma chamada de IA e não gera custo de tokens.

## 5.7 Versões de agentes

Cada salvamento na Central de Agentes cria uma nova versão contendo:

- nome;
- prompt do sistema;
- template de entrada;
- schema de compatibilidade;
- modelo;
- temperatura;
- limite de tokens;
- nota de alteração.

As versões podem ser comparadas e restauradas.

Para agentes oficiais, restaurar um prompt antigo não restaura liberdade para alterar o contrato. O executor continua resolvendo o contrato oficial pelo registry.

## 5.8 Snapshot do briefing

O briefing normalizado é salvo antes do pipeline.

Isso preserva:

- valores usados como base;
- memória consolidada daquele momento;
- referências resumidas;
- prioridades de fonte.

Esse snapshot não significa que todos os seus campos foram enviados a todos os agentes.

---

# 6. Memória do cliente

## 6.1 Campos cadastráveis

O perfil do cliente pode guardar:

- nome;
- segmento;
- descrição do negócio;
- público-alvo;
- diferenciais;
- tom de voz;
- posicionamento;
- paleta;
- cores proibidas;
- tipografia preferida;
- referências visuais;
- estilos aprovados;
- estilos proibidos;
- restrições de comunicação;
- CTAs preferidos;
- políticas do segmento;
- notas estratégicas;
- resumo de memória da marca;
- URL do site;
- URL do Instagram.

## 6.2 Assets

Tipos atualmente aceitos:

- logo principal;
- logo branca;
- logo escura;
- imagem de referência;
- anúncio aprovado;
- anúncio reprovado;
- print de Instagram;
- print de site;
- referência aprovada;
- referência reprovada;
- campanha anterior;
- material de marca.

O Brand Overlay utiliza somente `logo_main`.

## 6.3 Aprendizados de campanha

A interface permite salvar como memória:

- CTA;
- estilo aprovado;
- estilo proibido;
- paleta;
- nota estratégica;
- direção visual;
- feedback positivo;
- feedback negativo.

Esses aprendizados são anexados aos campos textuais do cliente.

## 6.4 Memória consolidada

O sistema monta um contexto consolidado contendo:

- nome;
- segmento;
- descrição;
- público;
- posicionamento;
- tom;
- paleta;
- cores proibidas;
- tipografia;
- estilos aprovados;
- estilos proibidos;
- CTAs;
- restrições;
- resumo da marca;
- aprendizados recentes;
- até três campanhas recentes resumidas;
- até cinco referências aprovadas;
- até cinco referências reprovadas.

Também aplica limites de tamanho para reduzir tokens.

## 6.5 O que efetivamente atravessa campanhas

### Reutilização direta

- Profile Diagnostic ativo;
- referências aprovadas resumidas;
- referências reprovadas resumidas;
- campos atuais usados na normalização;
- assets e seus resumos;
- aprendizados gravados no perfil;
- imagem da logo principal para Brand Overlay.

### Reutilização indireta

- análise de marca legada como fallback do normalizador;
- resumos de campanhas recentes dentro do snapshot;
- histórico do mesmo tema incluído pelo planejador em briefings automáticos.

### Limitação importante

O Estrategista atual não recebe o `client_prompt_context` completo.

Ele recebe:

- Profile Diagnostic;
- briefing atual reduzido;
- referências aprovadas;
- referências reprovadas.

Portanto:

- campanhas recentes presentes no snapshot não chegam automaticamente ao Estrategista em campanhas manuais;
- tipografia, CTAs preferidos, cores proibidas e outras informações do perfil só chegam se estiverem refletidas no Profile Diagnostic ou nas restrições atuais;
- alterações no cadastro não invalidam automaticamente o diagnóstico ativo;
- um aprendizado salvo depois da criação do diagnóstico pode exigir nova análise para aparecer no Profile Diagnostic.

Prompts não devem presumir a presença de campos que não fazem parte da entrada efetiva do agente.

## 6.6 Prioridade

A intenção funcional da normalização é:

```text
campanha atual > memória do cliente > fallback
```

O Profile Diagnostic deve ser tratado como memória reutilizável, não como ordem para ignorar o briefing atual.

## 6.7 Limites de contexto

Antes de enviar contexto à OpenAI:

- valores vazios são removidos;
- strings são compactadas;
- strings comuns são limitadas normalmente a 900 caracteres;
- campos que contenham `prompt` podem chegar a 1.800;
- arrays comuns são limitados a 10 itens;
- arrays de campanhas são limitados a 3;
- arrays de referências aprovadas/reprovadas são limitados a 5;
- objetos muito profundos são descartados depois do limite de profundidade;
- históricos completos, logs e outputs brutos são removidos.

O prompt deve ser eficiente e não solicitar repetição integral do contexto na saída.

---

# 7. Sistema de contratos

## 7.1 TypeBox

TypeBox é a fonte única das definições oficiais.

De cada definição são obtidos:

- tipo TypeScript;
- JSON Schema para Structured Outputs;
- validação runtime.

Não há uma definição manual paralela para os contratos oficiais.

## 7.2 `contract_key`

Identifica qual contrato oficial pertence ao agente.

Mapeamento atual:

| Agente | `contract_key` |
|---|---|
| Analista de Marca | `profile_diagnostic` |
| Estrategista | `creative_brief` |
| Criativo | `creative_output` |

## 7.3 `contract_version`

Identifica a versão aceita pelo registry.

O vínculo atual é:

- `profile_diagnostic@1.0.0`;
- `creative_brief@2.0.0`;
- `creative_output@1.0.0`.

## 7.4 Registry

O registry mantém:

- contratos conhecidos;
- versão aceita de cada contrato;
- schema TypeBox;
- vínculo esperado para agentes oficiais.

Ao executar um agente oficial, o sistema:

1. lê `contract_key`;
2. lê `contract_version`;
3. resolve o schema no registry;
4. verifica se o agente está ligado ao contrato esperado;
5. rejeita chave desconhecida;
6. rejeita versão desconhecida;
7. rejeita vínculo divergente.

## 7.5 Structured Outputs

O schema é enviado à API com:

```text
type = json_schema
strict = true
```

Todos os objetos:

- exigem todos os campos;
- proíbem propriedades adicionais.

A resposta ainda é parseada e validada em runtime pelo backend.

Se o JSON aparentar ter sido truncado e o agente tiver limite de saída configurado, o executor faz uma tentativa adicional sem aplicar esse limite. Isso é uma proteção operacional, não uma licença para produzir respostas longas: os prompts devem continuar exigindo campos concisos e sem repetição.

## 7.6 Validação runtime

Mesmo após Structured Outputs, o backend valida:

- formato do objeto;
- campos obrigatórios;
- tipos;
- literais;
- limites numéricos;
- ausência de campos adicionais.

Exemplos de rejeição:

- `preferredPosition = "center"`;
- `sizePercent = 25`;
- ausência de `brandOverlay`;
- retorno de `headline_extra`;
- `confidenceScore` fora de `0` a `1`.

## 7.7 Schema de compatibilidade no banco

O campo antigo `output_schema_json` continua existindo.

Para agentes oficiais:

- é sincronizado com o schema TypeBox;
- é exibido como somente leitura;
- não é a fonte usada na execução.

Para agentes personalizados sem `contract_key`:

- `output_schema_json` continua sendo a fonte do schema.

## 7.8 Compatibilidade de versões

O registry atual mantém somente uma versão ativa por chave de contrato.

Artefatos antigos preservam seu `schema_version`, mas não existe ainda um catálogo multi-versão que permita executar simultaneamente várias versões do mesmo contrato.

Uma futura mudança incompatível deve:

- criar nova versão de contrato;
- registrar a versão;
- definir adapters ou migração;
- atualizar o vínculo do agente;
- preservar leitura de artefatos anteriores.

## 7.9 Como o prompt final é montado

Cada chamada de agente possui duas mensagens:

### Mensagem de sistema

É o `system_prompt` editável na Central de Agentes. Nele devem ficar:

- papel;
- objetivo;
- limites de responsabilidade;
- regras de qualidade;
- proibições;
- instruções estáveis.

### Mensagem de usuário

É produzida pelo `prompt_template`.

O template pode usar:

- `{{context_json}}`: contexto compactado da execução;
- `{{agent_key}}`: chave do agente;
- `{{agent_name}}`: nome do agente.

O contexto não é inserido como memória oculta. Ele aparece no conteúdo da mensagem de usuário como JSON serializado.

Templates atuais:

| Agente | Estrutura da mensagem de usuário |
|---|---|
| Analista | `Contexto de analise de marca:\n{{context_json}}` |
| Estrategista | `Contexto enxuto da campanha e memoria consolidada do cliente:\n{{context_json}}` |
| Criativo | `Estrategia objetiva, memoria visual resumida e restricoes atuais:\n{{context_json}}` |

O texto introdutório do template não altera os nomes reais das chaves presentes no JSON.

## 7.10 O que é editável

Na Central de Agentes é possível alterar:

- nome;
- chave interna;
- descrição;
- função declarada;
- modelo;
- temperatura armazenada;
- limite de tokens;
- prompt do sistema;
- template de entrada;
- status ativo;
- ordem;
- notas da alteração.

Para agentes com contrato oficial:

- o schema é exibido;
- o schema não pode ser editado;
- alterações de prompt criam versão;
- o executor continua impondo o registry.

Apesar de a chave interna aparecer como campo editável, as chaves dos três agentes oficiais fazem parte do roteamento do pipeline e não devem ser alteradas:

- `brand_analyzer_agent`;
- `strategist_agent`;
- `creative_agent`.

Alterar uma dessas chaves faz o pipeline deixar de encontrar o agente correspondente.

---

# 8. Brand Overlay

## 8.1 Por que a IA não desenha a logo

Modelos de imagem podem:

- distorcer símbolos;
- alterar tipografia;
- mudar cores;
- gerar versões inexistentes;
- posicionar a marca de forma inconsistente;
- produzir texto ilegível.

Por isso, a logo foi removida da responsabilidade da IA.

O modelo gera o layout sem logo. O backend aplica o arquivo oficial posteriormente.

## 8.2 Responsabilidade do Agente Criativo

O Criativo apenas informa:

- se recomenda logo;
- posição;
- percentual de tamanho.

Ele deve considerar:

- área de respiro;
- equilíbrio da composição;
- contraste provável;
- legibilidade;
- hierarquia.

Ele não deve:

- descrever visualmente a logo;
- pedir logo no prompt;
- criar uma versão branca ou escura;
- pedir efeito;
- informar coordenadas.

## 8.3 Logo oficial

O overlay procura o asset mais recente do tipo `logo_main`.

Novos uploads de logo principal:

- devem ser PNG;
- devem possuir transparência real;
- substituem a logo principal anterior;
- removem a referência anterior;
- não criam seleção entre múltiplas versões.

Assets `logo_white` e `logo_dark` existem no cadastro, mas não são utilizados pelo Brand Overlay atual.

## 8.4 Carregamento da imagem

O serviço tenta usar o caminho local da imagem original.

Se não existir caminho local:

- baixa a imagem pela URL;
- usa timeout de 15 segundos;
- limita o arquivo remoto a 30 MB.

## 8.5 Redimensionamento

O percentual sugerido é aplicado sobre a largura da imagem.

Exemplo:

```text
imagem com 1.000 px de largura
sizePercent = 14
largura solicitada da logo = 140 px
```

A logo é redimensionada proporcionalmente.

O serviço não:

- estica;
- muda proporção;
- altera cores intencionalmente;
- remove transparência;
- aplica sombra;
- aplica brilho;
- aplica contorno;
- aplica efeito.

## 8.6 Margem de segurança

A margem é:

```text
4% da menor dimensão da imagem
```

com mínimo de:

```text
16 pixels
```

## 8.7 Posições

### `top_left`

Logo no canto superior esquerdo, respeitando a margem.

### `top_right`

Logo no canto superior direito.

### `bottom_left`

Logo no canto inferior esquerdo.

### `bottom_right`

Logo no canto inferior direito.

### `bottom_center`

Logo centralizada horizontalmente junto à margem inferior.

## 8.8 Exportação

Quando aplicado, o resultado é exportado como novo PNG.

A imagem original permanece no arquivo e URL originais.

## 8.9 Fallback

O fallback ocorre quando:

- `logoRequired` é falso;
- posição é inválida;
- percentual é inválido;
- não há logo;
- logo não é PNG;
- logo não é transparente;
- arquivo da logo não é encontrado;
- imagem não pode ser carregada;
- dimensões não são identificadas;
- Sharp falha;
- saída não pode ser salva.

Resultado do fallback:

- `applied = false`;
- `final_image_url = image_url`;
- campanha continua;
- run continua;
- evento é tentado;
- imagem original permanece intacta.

Até falha ao registrar o evento é capturada para não interromper a campanha.

## 8.10 Imagem original versus imagem final

| Conceito | Campo |
|---|---|
| Imagem criada pela IA, sem logo | `image_path` e `image_url` |
| Imagem entregue ao usuário | `final_image_url` |

Listagens e notificações priorizam a imagem final.

---

# 9. Eventos do pipeline

## 9.1 Finalidade

`campaign_pipeline_events` registra eventos técnicos que:

- não são outputs de agente;
- não são artefatos criativos;
- não pertencem ao planejador;
- ajudam a auditar fallback e comportamento operacional.

## 9.2 Campos

Cada evento pode guardar:

- campanha;
- pipeline run;
- etapa;
- tipo;
- severidade;
- mensagem;
- metadata JSONB;
- data.

Ao menos campanha ou run deve estar presente.

Severidades:

- `info`;
- `warning`;
- `error`.

## 9.3 Eventos implementados

### `overlay_applied`

Severidade: `info`.

Indica aplicação bem-sucedida.

Metadata pode conter:

- ID do asset da logo;
- posição;
- percentual;
- margem calculada;
- URL final.

### `logo_missing`

Severidade: `warning`.

Indica ausência de `logo_main`.

### `invalid_position`

Severidade: `warning`.

Indica posição fora da lista permitida.

Com contrato válido, esse evento tende a ocorrer somente por dados externos, artefatos antigos ou chamada direta inválida.

### `composition_failed`

Severidade: `warning` ou `error`.

Pode indicar:

- tamanho inválido;
- logo inválida;
- arquivo ausente;
- falha de leitura;
- falha do Sharp;
- falha de escrita.

### `overlay_skipped`

Severidade: `info`.

Indica que `logoRequired` foi `false`.

## 9.4 O que não vai para essa tabela

- logs do planejador;
- tokens;
- output bruto do agente;
- custo de IA;
- versões de artefato.

Essas informações têm estruturas próprias.

---

# 10. Compatibilidade

## 10.1 Campanhas antigas

Campanhas antigas continuam legíveis porque as colunas anteriores não foram removidas.

O sistema ainda entende:

- `strategy_json`;
- `creative_json`;
- `strategist_output_json`;
- `creative_output_json`;
- `image_url`;
- `final_image_url`.

Campanhas antigas podem não possuir:

- pipeline run;
- Profile Diagnostic oficial;
- artefatos;
- eventos;
- Brand Overlay.

Nesses casos, a interface continua usando os dados legados.

Artefatos históricos `creative_brief@1.0.0` não possuem `adCaption` e não são reescritos. Para eles, frontend e WhatsApp usam `strategy.texto_principal` como fallback. Novas campanhas usam `creative_brief@2.0.0`, no qual `adCaption` é obrigatório.

## 10.2 Adapters

### Profile Diagnostic para análise legada

Converte camelCase oficial para os campos antigos usados pela tela de comparação e aplicação.

### Creative Brief para Strategy Output legado

Mapeia:

- `communicationAngle` → `angulo`;
- `targetAudience` → `publico`;
- `mainPromise` → `promessa`;
- `headline` → `headline`;
- `adCaption` → `texto_principal`;
- `callToAction` → `cta`;
- direção visual → `briefing_criativo`.

### Creative Output para formato legado

Mapeia:

- `imagePrompt` → `prompt_imagem`;
- `negativePrompt` → `negative_prompt`;
- `visualDirectionSummary` → `direcao_visual_resumida`.

`brandOverlay` não entra no objeto legado. Ele permanece no artefato oficial.

## 10.3 Schema legado

`output_schema_json` permanece no banco, mas agentes oficiais usam o registry.

## 10.4 Imagens

Para campanhas sem Brand Overlay:

- a imagem final continua sendo resolvida por fallback para a imagem antiga.

Para campanhas novas:

- original e final ficam semanticamente separadas.

## 10.5 Análise legada e diagnóstico oficial

Os dois formatos são salvos em paralelo.

Isso permite:

- novo pipeline usar `ProfileDiagnostic`;
- frontend anterior continuar usando campos antigos;
- migração gradual sem apagar histórico.

---

# 11. Restrições importantes para os prompts

## 11.1 Regras gerais

Todo prompt oficial deve:

- produzir somente o JSON definido pelo contrato;
- preencher todos os campos;
- não adicionar campos;
- respeitar `schemaVersion`;
- usar os nomes canônicos em camelCase;
- evitar repetir todo o contexto;
- diferenciar evidência de inferência;
- tratar o briefing atual como prioridade;
- respeitar restrições e referências negativas;
- não assumir dados ausentes;
- não tentar modificar memória ou banco;
- não delegar ao próximo agente uma decisão que pertence ao contrato atual.

## 11.2 Structured Outputs

Não se deve instruir o agente a:

- responder em Markdown;
- envolver JSON em bloco de código;
- escrever explicação antes ou depois do objeto;
- usar chaves alternativas;
- omitir campos “quando não se aplicarem”;
- devolver `null` em campos que exigem string ou array;
- retornar um schema diferente.

## 11.3 Analista de Marca

O prompt deve:

- usar apenas informação observável;
- declarar lacunas;
- manter `confidenceScore` entre 0 e 1;
- evitar certeza excessiva;
- respeitar polaridade de materiais aprovados/reprovados;
- nunca alegar acesso privado;
- nunca alegar visão multimodal quando recebeu apenas URLs;
- não alterar cadastro;
- produzir apenas Profile Diagnostic.

## 11.4 Estrategista

O prompt deve:

- produzir o Creative Brief completo;
- manter toda estratégia dentro dele;
- preencher `adCaption` com a legenda final pronta para publicação;
- manter `captionInstructions` restrito a orientações editoriais;
- nunca devolver metalinguagem em `adCaption`;
- usar o Profile Diagnostic como memória;
- priorizar briefing atual;
- respeitar restrições;
- considerar referências aprovadas e reprovadas;
- escrever copy utilizável;
- definir direção visual executável;
- não usar formato legado `briefing_criativo`;
- não gerar imagem;
- não aplicar logo.

## 11.5 Criativo

O prompt deve:

- receber o Creative Brief como decisão superior;
- não contradizer headline, promessa, público ou restrições;
- gerar `imagePrompt` sem logo;
- nunca desenhar, recriar, estilizar ou incorporar logo;
- nunca pedir logo inventada;
- deixar espaço para aplicação posterior;
- usar somente posições permitidas;
- usar tamanho inteiro entre 8 e 20;
- informar apenas sugestão de overlay;
- não informar coordenadas;
- não aplicar efeitos à logo;
- produzir apenas Creative Output.

## 11.6 Logo e Brand Overlay

Frases que não devem aparecer no `imagePrompt`:

- “adicione o logotipo da empresa”;
- “recrie a logo”;
- “coloque a marca no canto”;
- “gere uma versão branca da logo”;
- “estilize o símbolo”;
- “aplique sombra na logo”.

O correto é:

- gerar composição sem logo;
- preservar área visual;
- preencher `brandOverlay`.

## 11.7 Dados que o prompt não deve presumir

O Estrategista não deve presumir que recebe:

- histórico completo das campanhas;
- arquivo visual de referência;
- todos os campos do cadastro;
- CTAs atualizados fora do diagnóstico;
- conteúdo visual da logo.

O Criativo não deve presumir que recebe:

- assets completos;
- arquivo da logo;
- campanhas anteriores;
- output bruto do Analista;
- liberdade para mudar o Creative Brief.

## 11.8 Eficiência de tokens

Prompts devem:

- evitar pedir raciocínio exposto;
- evitar repetir briefing;
- evitar duplicar estratégia em vários campos;
- usar listas curtas;
- escrever campos acionáveis;
- não produzir introdução ou conclusão;
- não transformar cada campo em ensaio.

## 11.9 Contratos não são prompts

Se um novo comportamento exige novo campo:

- não inserir o campo apenas no prompt;
- primeiro alterar e versionar o contrato;
- depois adaptar produtores, consumidores, persistência e frontend.

---

# 12. O que ainda NÃO está implementado

## 12.1 Agentes não existentes

Não existem:

- Agente Social Media;
- Trend Hunter;
- Agente de Calendário Editorial;
- Agente de Distribuição;
- Agente de Revisão;
- Agente Jurídico/compliance;
- Agente de Performance;
- Agente de Variações;
- Agente de QA visual.

## 12.2 Social Media

Não existe:

- publicação em Instagram, Facebook, LinkedIn ou TikTok;
- agendamento em redes sociais;
- adaptação automática por plataforma;
- geração de hashtags por contrato;
- gestão de comentários;
- leitura de métricas sociais;
- calendário editorial funcional.

O planejador atual agenda geração de campanhas, não publicação editorial.

## 12.3 Tendências

Não existe:

- coleta de tendências;
- ranking de assuntos;
- monitoramento de concorrentes;
- detecção de áudio ou hashtags;
- Trend Hunter.

## 12.4 Revisão humana

Existe marcação posterior de campanha como aprovada ou reprovada e existe `approval_mode` no planejador.

Não existe:

- pausa obrigatória entre Estrategista e Criativo;
- edição humana do Creative Brief antes da próxima etapa;
- aprovação humana obrigatória antes da imagem;
- workflow de comentários;
- trilha de revisores;
- aprovação formal do Profile Diagnostic antes de torná-lo ativo.

## 12.5 Reexecução por etapa

O serviço possui primitivas de runs, estados e versões.

Não existe uma experiência completa para:

- reexecutar somente o Estrategista;
- editar e aprovar uma versão do Creative Brief;
- reexecutar somente o Criativo;
- reexecutar apenas Brand Overlay;
- retomar automaticamente um run falho do ponto exato;
- invalidar dependências pela interface.

## 12.6 Brand Overlay futuro

Ainda não existem:

- QR Code;
- selo promocional;
- assinatura;
- rodapé;
- redes sociais;
- telefone;
- endereço;
- elemento institucional;
- múltiplas camadas de marca;
- escolha automática entre logo clara e escura;
- múltiplas logos;
- logo por campanha;
- editor manual de posição;
- detecção visual de colisão após a imagem;
- ajuste automático de contraste;
- fundo de proteção da logo;
- regras de brand book por zona de exclusão.

Os tipos `logo_white` e `logo_dark` existem como assets, mas o overlay ignora ambos.

## 12.7 Geração visual

Não existe:

- uso da logo como imagem de referência no modelo;
- envio multimodal das referências ao gerador;
- ControlNet;
- inpainting;
- máscara de composição;
- renderização determinística de headline e CTA;
- sistema tipográfico pós-geração;
- validação OCR;
- inspeção automática de texto ilegível;
- comparação visual com brand book.

## 12.8 Memória avançada

Não existe:

- banco vetorial;
- embeddings;
- recuperação semântica;
- ranking de memória por relevância;
- invalidação automática do diagnóstico quando o cadastro muda;
- expiração automática de diagnóstico;
- uso automático do `source_hash` para decidir reanálise;
- separação de memória por marca quando um cliente tiver várias marcas.

## 12.9 Contratos avançados

Não existe:

- catálogo de contratos no banco;
- múltiplas versões executáveis simultaneamente no registry;
- migração automática de payload entre versões;
- contrato oficial para imagem gerada;
- contrato oficial para resultado do overlay;
- contrato oficial para legenda publicada;
- contrato oficial para calendário editorial;
- contrato oficial para distribuição.

## 12.10 Qualidade e experimentação

Não existe:

- avaliação automática de qualidade;
- score de aderência ao Creative Brief;
- score de aderência visual à marca;
- A/B test automatizado de prompts;
- seleção automática da melhor versão;
- feedback quantitativo retroalimentando o diagnóstico;
- aprendizado automático a partir de performance;
- bloqueio automático por políticas de segmento.

## 12.11 Limitações atuais da análise de marca

- páginas dinâmicas podem não ter conteúdo útil no HTML coletado;
- Instagram pode exigir autenticação ou retornar conteúdo limitado;
- imagens são representadas por URLs e metadados, não por visão multimodal;
- o diagnóstico automático inicial não recarrega automaticamente as URLs cadastradas;
- o diagnóstico torna-se ativo sem aprovação formal;
- mudanças posteriores do cadastro não invalidam o diagnóstico.

## 12.12 Limitações operacionais atuais

- os prompts atuais podem conter termos herdados do formato legado;
- não existe garantia de que uma referência em caminho local seja visualizada pelo modelo;
- Brand Overlay depende de logo principal PNG transparente válida;
- erro de overlay não impede entrega, portanto uma campanha pode concluir sem logo;
- o banco atual pode conter assets antigos de logo que não atendem à validação nova;
- não existe autenticação ou governança de aprovação descrita dentro da arquitetura funcional de IA.

---

# Apêndice A — Resumo das entradas e saídas oficiais

| Etapa | Entrada principal | Saída |
|---|---|---|
| Analista | cliente, fontes, notas, materiais, regras | `ProfileDiagnostic` |
| Estrategista | `ProfileDiagnostic` + briefing reduzido | `CreativeBrief` |
| Criativo | `ProfileDiagnostic` + `CreativeBrief` + formato | `CreativeOutput` |
| Imagem | `imagePrompt` + `negativePrompt` + regra sem logo | imagem original |
| Brand Overlay | imagem original + logo oficial + `brandOverlay` | imagem final ou fallback |

---

# Apêndice B — Responsabilidade por decisão

| Decisão | Responsável |
|---|---|
| Diagnóstico da marca | Analista |
| Ângulo, promessa e benefício | Estrategista |
| Headline, subheadline e CTA | Estrategista |
| Direção visual | Estrategista |
| Tradução para prompt de imagem | Criativo |
| Posição sugerida da logo | Criativo |
| Aplicação real da logo | Backend / BrandOverlayService |
| Coordenadas e margem | Backend / BrandOverlayService |
| Arquivo oficial da logo | Cadastro do cliente |
| Renderização da imagem | Modelo de imagem |
| Fallback do overlay | Backend |
| Validação dos contratos | Registry + TypeBox |

---

# Apêndice C — Regra de ouro para criação de prompts

Um prompt pode orientar **como preencher** um contrato.

Um prompt não pode:

- redefinir o contrato;
- criar campos;
- remover campos;
- transferir responsabilidades entre agentes;
- executar tarefas operacionais do backend;
- presumir entradas que não são enviadas.

Quando houver dúvida, a ordem de autoridade é:

```text
Contrato oficial
    ↓
Responsabilidade funcional da etapa
    ↓
Dados efetivamente recebidos
    ↓
Prompt do agente
```
