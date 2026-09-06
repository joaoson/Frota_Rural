# Estudo de Acessibilidade — Presbiopia e Baixa Visão Relacionada à Idade

**Projeto:** Frota Rural — Marketplace de Locação de Máquinas Agrícolas

**Documento:** Estudo de acessibilidade e definição de público-alvo

**Data:** Setembro de 2026

**Escopo:** Frontend (React 19 + TypeScript + Tailwind CSS 4)

---

## Sumário

1. [Objetivo do documento](#1-objetivo-do-documento)
2. [Definição do público-alvo](#2-definição-do-público-alvo)
3. [Justificativa da escolha](#3-justificativa-da-escolha)
4. [Análise comparativa de públicos considerados](#4-análise-comparativa-de-públicos-considerados)
5. [Fundamentação normativa](#5-fundamentação-normativa)
6. [Metodologia da avaliação](#6-metodologia-da-avaliação)
7. [Diagnóstico do estado atual](#7-diagnóstico-do-estado-atual)
8. [Síntese e priorização das barreiras](#8-síntese-e-priorização-das-barreiras)
9. [Protocolo de avaliação com usuários](#9-protocolo-de-avaliação-com-usuários)
10. [Referências](#10-referências)

---

## 1. Objetivo do documento

Este documento apresenta o estudo de acessibilidade que fundamenta as intervenções realizadas no frontend do Frota Rural. Ele cumpre três funções:

1. **Definir e caracterizar** o público-alvo de acessibilidade escolhido;
2. **Justificar** a escolha com base no perfil real de usuários do domínio de aplicação;
3. **Diagnosticar** o estado da interface antes da intervenção, por meio de avaliação heurística instrumentada, estabelecendo a linha de base contra a qual os resultados serão medidos.

O documento é o artefato de referência para as etapas subsequentes: a implementação das estratégias de acessibilidade e o teste com usuários reais.

---

## 2. Definição do público-alvo

### 2.1 Público escolhido

> **Adultos a partir de 45 anos com presbiopia**, incluindo usuários com redução de acuidade visual para perto não corrigida (ou parcialmente corrigida).

### 2.2 Caracterização da condição

A **presbiopia** é a perda progressiva da capacidade de acomodação do cristalino — a habilidade do olho de alterar seu poder refrativo para focalizar objetos próximos. Diferentemente das ametropias (miopia, hipermetropia, astigmatismo), que são erros refrativos de origem anatômica variável, a presbiopia é um **processo fisiológico degenerativo associado ao envelhecimento**, não uma patologia.

Suas características determinantes para o design de interfaces são:

| Característica | Implicação para a interface |
|---|---|
| Início típico entre 40 e 45 anos, progressão até ~65 anos | O público não é "idoso"; começa na meia-idade produtiva |
| Prevalência praticamente universal acima dos 50 anos | Não é condição minoritária, e sim trajetória comum |
| Perda de foco para perto, preservando visão para longe | O usuário enxerga a tela, mas não resolve detalhes finos |
| Redução da sensibilidade ao contraste e da discriminação de detalhe | Texto pequeno com contraste marginal torna-se ilegível |
| Necessidade de maior luminância para o mesmo desempenho de leitura | Interfaces de baixo contraste penalizam desproporcionalmente |
| Correção óptica frequentemente ausente, desatualizada ou inadequada à distância de tela | Não se pode presumir correção adequada |

### 2.3 Delimitação conceitual

Para precisão terminológica, o estudo distingue:

- **Presbiopia** — foco do trabalho. Condição fisiológica relacionada à idade, afetando visão de perto.
- **Baixa visão** — comprometimento visual que não se corrige totalmente com lentes, óculos ou cirurgia. Há sobreposição parcial com o público, especialmente na faixa acima de 60 anos, e as estratégias adotadas beneficiam ambos.
- **Cegueira** — fora do escopo deste estudo; demanda estratégias distintas (leitor de tela, navegação estrutural), tratadas apenas de forma incidental.

A escolha de tratar presbiopia como público central, e não "idosos" de forma genérica, é deliberada: **presbiopia é uma condição objetivamente definida, com início etário previsível e efeitos diretamente mapeáveis para decisões de design** (tamanho tipográfico, contraste, tolerância a zoom). Isso torna tanto o diagnóstico quanto a avaliação com usuários mensuráveis, em vez de dependentes de percepção subjetiva.

---

## 3. Justificativa da escolha

A escolha do público não decorre apenas da prevalência da condição na população geral, mas da **convergência entre o perfil demográfico do usuário do sistema e a condição estudada**.

### 3.1 O perfil etário do produtor rural brasileiro

O Frota Rural é um marketplace de locação de máquinas agrícolas. Seus dois perfis de usuário — **locador** (proprietário de maquinário) e **locatário** (produtor que aluga) — pertencem ao mesmo universo: o do produtor rural brasileiro.

Esse universo apresenta uma característica demográfica decisiva: **é significativamente mais velho que a população brasileira em geral**. O Censo Agropecuário do IBGE documenta o fenômeno do envelhecimento do campo, com a maior parte dos estabelecimentos sob direção de produtores na faixa acima de 45 anos, e participação reduzida de produtores com menos de 35 anos. 

### Quem é o produtor rural brasileiro

O perfil do responsável pela direção dos estabelecimentos agropecuários no
Brasil é um elemento central para a definição do público-alvo deste trabalho.
Os dados do Censo Agropecuário 2017 revelam duas características marcantes:
a predominância masculina e o avançado processo de envelhecimento dessa
população.

![Gráfico de barras com a distribuição dos produtores rurais brasileiros por
faixa etária e por sexo, segundo o Censo Agropecuário 2017. As faixas acima de
45 anos concentram a maior parte dos produtores, e o sexo masculino predomina
em todas as faixas etárias.](https://raw.githubusercontent.com/carloshobmeier/Assets/refs/heads/main/frota_rural/agro_idade_genero.jpg)

**Figura 1** — Produtores rurais por faixa etária e sexo (Brasil, 2017).
Fonte: IBGE, Censo Agropecuário 2017. 

(Disponível em:
<https://censoagro2017.ibge.gov.br/templates/censo_agro/resultadosagro/produtores.html>.
Acesso em: 2 set. 2026.)

Quanto ao sexo, 81,3% dos produtores são homens e 18,7% são mulheres. Quanto à
idade, o censo aponta um deslocamento consistente em direção às faixas mais
velhas: entre 2006 e 2017, a participação dos menores de 25 anos caiu de 3,3%
para 2%, a de 25 a menos de 35 anos caiu de 13,6% para 9,3% e a de 35 a menos
de 45 anos caiu de 21,9% para 17,9%. No sentido oposto, cresceram as faixas de
45 a menos de 55 anos (de 23,3% para 24,2%), de 55 a menos de 65 anos (de 20,4%
para 23,5%) e de 65 anos ou mais (de 17,5% para 23,2%).

Somadas, as três faixas superiores indicam que **aproximadamente 71% dos
produtores rurais brasileiros têm 45 anos ou mais** e que cerca de 47% já
ultrapassaram os 55 anos. Considerando que a presbiopia se instala tipicamente
entre os 40 e os 45 anos de idade, esse perfil demográfico implica que a maior
parte dos potenciais usuários do sistema *Frota Rural* convive com alguma
redução da capacidade de acomodação visual para perto — o que fundamenta a
escolha do público de acessibilidade adotada nesta seção.




### 3.2 O argumento central

A conjunção dos dois fatos produz a justificativa:

> A presbiopia afeta praticamente a totalidade das pessoas acima de 50 anos. O público do Frota Rural concentra-se em faixas etárias iguais ou superiores a 45 anos. Logo, a dificuldade de leitura de perto **não é uma condição de minoria entre os usuários do sistema — é a condição esperada do usuário mediano.**

Essa formulação distingue o presente estudo de uma escolha genérica de público. Não se trata de acomodar um grupo periférico, mas de reconhecer que **a interface atual foi projetada para uma acuidade visual que a maior parte de seus usuários-alvo não possui**.

### 3.3 Reforço contextual: condições de uso

O contexto de uso agrava a barreira:

- **Possível uso ao ar livre ou em ambientes de alta luminância** (pátio, galpão, cabine de máquina) reduz o contraste efetivo percebido na tela, somando-se à perda de sensibilidade ao contraste já associada à idade.
- **Dispositivos móveis em ambiente rural**, frequentemente com a tela suja, sob sol direto, ou operados com as mãos ocupadas ou sujas — o que amplia o impacto de alvos de toque pequenos.


### 3.4 Criticidade do domínio

O sistema medeia **transações econômicas de valor elevado e efeito jurídico**: contratos de locação de maquinário, assinatura digital com verificação de hash, upload de documentos de identificação (CNH, certificações) e agendamento de operações. A consequência de um erro de leitura não é frustração estética — é **assinatura de contrato incorreto, envio de documento errado ou reserva em data equivocada**.

Isso eleva a acessibilidade, neste projeto, da categoria de refinamento à de **requisito de correção funcional**.

---

## 4. Análise comparativa de públicos considerados

A escolha foi feita após avaliação de quatro candidatos, segundo quatro critérios: aderência ao domínio, severidade da barreira existente, viabilidade de recrutamento para teste e ancoragem normativa.

| Público | Aderência ao domínio | Severidade atual | Viabilidade de teste | Ancoragem normativa | Decisão |
|---|---|---|---|---|---|
| **Presbiopia / 45+** | **Muito alta** — perfil etário do produtor rural | **Alta** — elevadas ocorrências de texto ≤11px | **Alta** — recrutamento acessível | **Forte** — WCAG 1.4.3, 1.4.11, 1.4.12, 1.3.1 | ✅ **Escolhido** |
| Daltonismo (discromatopsia) | Alta — prevalência masculina e setor majoritariamente masculino | Média-alta — paleta de gráficos colapsa sob simulação | Média — exige triagem (Ishihara) | Forte — WCAG 1.4.1 | Considerado; ver §4.1 |
| Usuários de leitor de tela | Média — plausível, porém menos característico | **Muito alta** — 0 rótulos associados em diversos campos | **Baixa** — difícil recrutar usuário proficiente | Forte — WCAG 1.3.1, 4.1.2 | Não escolhido |
| Deficiência motora / teclado | Média | **Baixa** — base já adequada (diversos `<button>`, 0 `<div onClick>`) | Média | Forte — WCAG 2.1.1 | Não escolhido |

WCAG = Web Content Accessibility Guidelines (Diretrizes de Acessibilidade para Conteúdo Web)


### 4.1 Nota sobre o daltonismo

O daltonismo foi seriamente considerado e chegou a ser objeto de análise preliminar, que identificou colapso perceptual severo na paleta de gráficos. Optou-se pela presbiopia por três razões:

1. **Abrangência do público** — a presbiopia atinge a maioria dos usuários projetados; o daltonismo, uma fração.
2. **Robustez da intervenção** — as correções para presbiopia (escala tipográfica, associação programática de rótulos e legibilidade em fluxos críticos) produzem impacto estrutural sobre todo o sistema, e não sobre um subconjunto de componentes.
3. **Viabilidade do teste com usuários** — recrutar participantes com presbiopia dispensa triagem clínica especializada.



### 4.2 Nota sobre a não escolha do público de leitor de tela

A auditoria revelou que este seria o público com o "antes" mais dramático (nenhum dos campos de formulário possui rótulo associado programaticamente). A decisão de não adotá-lo foi **metodológica, não técnica**: o item (c) da avaliação exige teste com o público escolhido, e testar um leitor de tela com participantes não proficientes mediria curva de aprendizado da tecnologia assistiva, não acessibilidade da interface — comprometendo a validade dos dados.


---

## 5. Fundamentação normativa

### 5.1 Marco legal brasileiro

- **Lei nº 13.146/2015 — Lei Brasileira de Inclusão da Pessoa com Deficiência (LBI)**, art. 63: estabelece a obrigatoriedade de acessibilidade em sítios da internet mantidos por empresas com sede ou representação comercial no país. É a sua redação:

Art. 63. É obrigatória a acessibilidade nos sítios da internet mantidos por empresas com sede ou representação comercial no País ou por órgãos de governo, para uso da pessoa com deficiência, garantindo-lhe acesso às informações disponíveis, conforme as melhores práticas e diretrizes de acessibilidade adotadas internacionalmente.

- **Decreto nº 5.296/2004**, que regulamenta a acessibilidade.

### 5.2 Normas técnicas

- **ABNT NBR ISO/IEC 40500:2025** — norma brasileira que adota integralmente o WCAG 2.0 como referência nacional de acessibilidade para conteúdo web.
- **ABNT NBR 17060:2022** — Acessibilidade em aplicativos para dispositivos móveis; pertinente ao uso mobile predominante no contexto rural.
- **eMAG 3.1** — Modelo de Acessibilidade em Governo Eletrônico; referência consolidada de boas práticas em português.

### 5.3 Critérios WCAG 2.2 aplicáveis ao público

Os critérios abaixo constituem o instrumento de avaliação adotado. Todos são de **nível AA**, salvo indicação contrária.

| Critério | Nome | Exigência | Relevância para presbiopia |
|---|---|---|---|
| **1.4.3** | Contraste (Mínimo) | 4,5:1 texto normal; 3:1 texto grande | A sensibilidade ao contraste declina com a idade |
| **1.4.4** | Redimensionar Texto | Texto ampliável a 200% sem perda de conteúdo ou função | Zoom é a principal tática de adaptação do público |
| **1.4.6** | Contraste (Aprimorado) — **AAA** | 7:1 texto normal | Meta desejável para o público-alvo |
| **1.4.10** | Reflow | Conteúdo utilizável a 320px CSS sem rolagem em dois eixos | Zoom elevado equivale a viewport estreito |
| **1.4.11** | Contraste de Não-Texto | 3:1 para componentes de interface e bordas | Delimitação de campos de formulário |
| **1.4.12** | Espaçamento de Texto | Suporte a ajuste de entrelinha e espaçamento | Ajuste do usuário não pode quebrar o layout |
| **2.5.8** | Tamanho do Alvo (Mínimo) | Alvos de ao menos 24×24px CSS | Precisão motora fina reduzida com a idade |
| **1.3.1** | Informações e Relações | Estrutura programaticamente determinável | Base para `<label for>` (ver §9, E5) |

### 5.4 Esclarecimento metodológico relevante

> **O WCAG não estabelece tamanho mínimo de fonte em pixels.** Afirmar que "texto de 10px viola o WCAG" deve ser evitado.

O que o WCAG exige é que o texto **possa ser ampliado a 200% sem perda** (1.4.4) e que atenda ao **contraste mínimo** (1.4.3). A crítica ao dimensionamento absoluto neste estudo ancora-se em fontes complementares:

- **Material Design 3** — recomenda 12sp como piso para rótulos e legendas;
- **Apple Human Interface Guidelines** — estabelece 11pt como mínimo absoluto, com recomendação de 17pt para corpo de texto;
- **W3C WAI — Older Users and Web Accessibility** (projeto WAI-AGE) — literatura sobre requisitos de usuários mais velhos.

Esta distinção é explicitada porque a confusão entre "diretriz normativa" e "boa prática de plataforma" compromete o rigor de trabalhos acadêmicos na área.

---

## 6. Metodologia da avaliação

### 6.1 Natureza

Avaliação **heurística instrumentada**: inspeção sistemática do código-fonte do frontend, combinada a cálculo programático de métricas objetivas de conformidade. Não substitui o teste com usuários (etapa subsequente), mas estabelece a linha de base quantitativa.

### 6.2 Escopo

Todo o diretório `FrontEnd/src` — 28 arquivos `.tsx` contendo páginas e componentes, além do arquivo de tokens de design `FrontEnd/src/index.css`. Excluídos: `node_modules`, código de backend e ambiente virtual Python.

### 6.3 Instrumentos

| Instrumento | Aplicação |
|---|---|
| Chrome DevTools — Rendering / Emulate vision deficiencies | Verificação visual complementar |
| Zoom de navegador (200% e 400%) | Verificação dos critérios 1.4.4 e 1.4.10 |


### 6.4 Convenção de classificação

- **PASSA / REPROVA** referem-se ao nível AA do critério aplicável.
- Textos com `font-bold` e tamanho ≥18,66px são classificados como "texto grande" (limiar 3:1); os demais, como texto normal (limiar 4,5:1).

---

## 7. Diagnóstico do estado atual

### 7.1 Dimensionamento tipográfico

A varredura identificou **elevadas ocorrências de texto com tamanho igual ou inferior a 11px**.

**Achados qualificados:**

**a) Rótulos de formulário.** O padrão adotado em todo o sistema para rótulos de campo (`pages/Signup.tsx:251` e equivalentes) é:

```
text-[10px] font-bold uppercase tracking-widest text-outline
```

Esta combinação é triplamente adversa à legibilidade:

1. **10px** — abaixo do piso recomendado por qualquer diretriz de plataforma;
2. **`uppercase`** — a caixa alta suprime as ascendentes e descendentes que compõem a silhueta da palavra, eliminando as pistas de forma usadas no reconhecimento lexical rápido e forçando leitura letra a letra;
3. **`tracking-widest`** — o espaçamento ampliado fragmenta a unidade visual da palavra, agravando o efeito anterior.

O efeito é cumulativo: cada fator isolado seria tolerável; combinados, tornam o rótulo substancialmente mais custoso de ler exatamente para quem tem menor reserva de acuidade.

**b) Hash do contrato.** Em `components/AssinaturaContratoModal.tsx:239` e `:247`, o hash criptográfico que garante a integridade do contrato é apresentado como:

```
font-mono text-[11px] break-all
```

Ou seja: **11px, monoespaçado e quebrado arbitrariamente entre linhas**, num fluxo de assinatura com efeito jurídico. O usuário que quisesse conferir a integridade do documento que assina não teria condições práticas de fazê-lo. Este é o achado de maior severidade do estudo, pela conjunção de baixa legibilidade e alta criticidade.

**c) Mensagens de erro de validação.** Renderizadas em `text-[11px]` (`pages/Login.tsx:115`, `pages/Signup.tsx:266` e equivalentes). A informação corretiva — justamente a que o usuário mais precisa ler quando está bloqueado — é apresentada no menor tamanho da tela.


### 7.2 Reflow, tolerância a zoom e alvos de toque (verificados como conformes)

Dois aspectos frequentemente problemáticos em interfaces web foram inspecionados
especificamente e **não constituem barreira** neste projeto. Registrá-los é parte
do resultado da auditoria: distinguir o que exige correção do que já está
conforme é tão relevante quanto apontar os defeitos.

**Reflow e redimensionamento de texto (critérios 1.4.4 e 1.4.10).** O layout
emprega contêineres de **largura máxima** combinada a largura fluida
(`max-w-[1200px] w-full` e equivalentes), e **não** larguras fixas em pixels.
Todas as 21 ocorrências de dimensão em pixels no código-fonte são `max-w-[...]`
ou `min-w-[...]` — o padrão responsivo correto. Em consequência, o conteúdo se
reflui ao ser ampliado e permanece utilizável sob zoom, que é a principal tática
de adaptação do público-alvo. A verificação por inspeção estática pode ser
complementada por conferência manual a 200% de zoom.

**Alvos de toque (critério 2.5.8).** Nenhum controle acionável fica abaixo do
mínimo de 24×24px CSS. Os menores botões de ícone combinam `p-1` (4px de
espaçamento) com ícone de 18px, resultando em 26px, ou `p-1.5` com ícone de
22px, resultando em 34px — ambos acima do limiar.


### 7.3 Aspectos já adequados

O rigor do diagnóstico exige registrar o que **não** constitui barreira:

- **Semântica de controles interativos** — diversos elementos `<button>` e **zero** ocorrências de `<div onClick>` ou `<span onClick>`. A base de operabilidade por teclado (critério 2.1.1) é sólida.
- **Contraste de texto** — adequado ao nível AA na quase totalidade dos casos.
- **Mensagens de erro textuais** — a validação não depende exclusivamente de cor; há texto explicativo associado (`pages/Login.tsx:115`), atendendo ao critério 1.4.1.
- **Redundância em indicadores de estado** — os *badges* de status (`pages/DashboardLocador.tsx:197`) já combinam ícone, cor e rótulo textual.



---

## 8. Síntese e priorização das barreiras


**Critério de ordenação:** severidade da barreira para o público-alvo, ponderada pela criticidade do fluxo afetado e pelo custo de correção. 


---

## 9. Protocolo de avaliação com usuários

Desenho previsto para o item *c* da avaliação, registrado aqui para garantir que as métricas do teste derivem do diagnóstico.

### 9.1 Participantes

- **Perfil:** adultos a partir de 45 anos, com presbiopia autorrelatada ou uso de correção para perto.
- **Amostra:** 3 participantes.
- **Registro:** idade, uso de correção óptica.


### 9.2 Métricas

**Objetivas:** tempo até conclusão de tarefas; número de erros; ocorrências de comportamento compensatório (aproximar-se da tela, aplicar zoom, retirar ou ajustar óculos) — esta última particularmente reveladora para o público.

**Subjetivas:** SUS (System Usability Scale) ao final de cada condição; escala de confiança de 1 a 5 por tarefa ("qual seu grau de certeza na resposta dada?"). A confiança tende a ser mais sensível que a taxa de acerto.

### 9.3 Considerações éticas

Consentimento livre e esclarecido; anonimização dos registros; direito de interrupção a qualquer momento; explicitação de que **o objeto avaliado é a interface, não o participante** — orientação relevante para evitar constrangimento em participantes mais velhos diante de tarefas digitais.

---

## 10. Referências

### Normas e legislação

- ABNT. **NBR ISO/IEC 40500:2021** — Tecnologia da informação: Diretrizes de acessibilidade para conteúdo Web (WCAG) 2.0.
- ABNT. **NBR 17060:2022** — Acessibilidade em aplicativos para dispositivos móveis.
- BRASIL. **Lei nº 13.146, de 6 de julho de 2015** — Lei Brasileira de Inclusão da Pessoa com Deficiência.
- BRASIL. **Decreto nº 5.296, de 2 de dezembro de 2004**.
- BRASIL. Governo Federal. **eMAG — Modelo de Acessibilidade em Governo Eletrônico**, versão 3.1, 2014.
- W3C. **Web Content Accessibility Guidelines (WCAG) 2.2**. W3C Recommendation, 2023. Disponível em: https://www.w3.org/TR/WCAG22/

### Diretrizes de design

- GOOGLE. **Material Design 3 — Typography**. Disponível em: https://m3.material.io/styles/typography
- APPLE. **Human Interface Guidelines — Typography**. Disponível em: https://developer.apple.com/design/human-interface-guidelines/typography
- W3C WAI. **Older Users and Web Accessibility: Meeting the Needs of Ageing Web Users** (WAI-AGE). Disponível em: https://www.w3.org/WAI/older-users/

### Dados demográficos e epidemiológicos

- IBGE. **Censo Agropecuário 2017**. Rio de Janeiro: IBGE. *(Verificar e citar tabela específica de faixa etária do produtor — ver §3.1.)*



