# Sugestão de Valor/Hora por IA — Especificação do Algoritmo

> Status: **implementado**. Este documento é a especificação; o código vive em
> `BackEnd/pricing/` e os números abaixo são verificados por teste
> (`pricing/tests.py::EngineTests::test_reproduz_o_exemplo_da_especificacao`).
> Integração com a arquitetura de `develop`: `codex/retrofit-pricing-chat-develop`.

| Onde | O quê |
|:---|:---|
| `BackEnd/pricing/params.py` | Parâmetros por categoria, versionados (§3.3) |
| `BackEnd/pricing/engine.py` | Cálculo determinístico, sem rede nem banco (§4) |
| `BackEnd/pricing/research.py` | Seleção de provedor e pesquisa com busca na web (§3.1) |
| `BackEnd/pricing/service.py` | Cache, fallbacks, ancoragem, persistência (§5, §11) |
| `FrontEnd/src/features/pricing/api/` | Repository com HTTP injetado e store de sugestões |
| `FrontEnd/src/features/pricing/hooks/usePricingSuggestion.ts` | Mutação explícita, descarte de respostas antigas e vínculo de auditoria |
| `POST /api/pricing/suggest` | Endpoint, restrito ao dono da máquina (§8) |
| `FrontEnd/src/features/pricing/components/SugestaoPrecoPanel.tsx` | Painel com a composição do custo |

Quando o locador cria um anúncio, ele hoje digita `hourly_rate` no escuro. Este
documento define como sugerir esse valor: uma IA pesquisa o preço de mercado da
máquina (marca/modelo/ano) e um algoritmo determinístico converte esse valor em
uma tarifa horária de locação.

---

## 1. Princípio de arquitetura: a IA não calcula preço

A separação abaixo é a decisão central do desenho.

| Camada | Responsabilidade | Determinístico? |
|:---|:---|:---|
| **IA (pesquisa)** | Descobrir *fatos*: valor de mercado do usado, valor do equivalente novo, potência, vida útil típica, tarifas praticadas | Não |
| **Motor de precificação** | Transformar esses fatos em R$/hora | **Sim** |

Motivos:

- **Auditável.** O locador (e o admin) precisa ver *por que* deu R$ 192/h. Um LLM
  cuspindo um número não explica nada e não se defende num questionamento.
- **Testável.** O motor vira função pura: entra um dict de insumos, sai um preço.
  Cobertura por testes unitários, sem mock de LLM no caminho crítico.
- **Estável.** O mesmo anúncio reprecificado amanhã não pode variar 30% por
  variação de temperatura do modelo.
- **Barato.** A pesquisa é cacheável por `(marca, modelo, ano)`; o cálculo roda
  em microssegundos e pode ser re-executado sempre que um parâmetro mudar.

Regra prática: **se o número entra numa conta, ele vem da pesquisa; se ele sai de
uma conta, ele vem do código.**

---

## 2. Restrições que o nosso próprio sistema impõe

Duas coisas no código atual mudam o algoritmo e precisam estar explícitas antes
de qualquer fórmula.

### 2.1 `hourly_rate` não é hora de motor — é hora faturada

`BackEnd/payments/pricing.py` cobra:

```python
HORAS_POR_DIARIA = 8
valor_diaria = hourly_rate * HORAS_POR_DIARIA
subtotal    = valor_diaria * diarias
total       = subtotal * (1 + TAXA_PLATAFORMA)   # 5%
```

Ou seja: **fatura-se 8 h por dia de calendário reservado**, independentemente do
horímetro. O `initial_hour_meter` / `final_hour_meter` de `Rentals` serve para
vistoria e apuração de desgaste, **não** para o faturamento.

Consequências diretas:

- O divisor do custo fixo é **horas faturadas/ano**, não horas de motor/ano.
- O desgaste (depreciação por uso e reparos) acontece por **hora de motor**, que
  é menor que a hora faturada. A ponte entre os dois é o **fator de carga**
  `λ = horas de motor ÷ horas faturadas` (tipicamente 0,60–0,75).
- Confundir os dois subprecifica a máquina em ~35%. É o erro mais provável aqui.

A UI precisa dizer isso em português claro: *"valor por hora faturada — a
plataforma cobra 8 h por dia de reserva"*.

### 2.2 A taxa de 5% é somada por fora

`total = subtotal * 1.05`. Logo a tarifa sugerida é a tarifa **bruta do
locador** (o que ele recebe), e a tela deve mostrar também o que o locatário
efetivamente paga (`× 1,05`), para o locador entender sua competitividade.

---

## 3. Insumos

### 3.1 Da IA (pesquisa web, saída em JSON estrito)

```json
{
  "categoria": "trator | colheitadeira | pulverizador | implemento",
  "potencia_cv": 110,
  "valor_mercado_usado_brl": 380000,
  "intervalo_valor_usado_brl": [340000, 420000],
  "valor_novo_equivalente_brl": 620000,
  "vida_util_horas_estimada": 12000,
  "horas_uso_tipicas_por_ano": 700,
  "tarifas_observadas_brl_hora": [
    {"valor": 180, "regiao": "PR", "inclui_operador": false, "fonte_idx": 0}
  ],
  "confianca": "alta | media | baixa",
  "fontes": [{"url": "...", "titulo": "...", "data": "2026-01"}]
}
```

Regras do prompt: (a) sempre em BRL, sempre com fonte e data; (b) se não achar o
modelo exato, achar o mais próximo em potência e **declarar** a substituição;
(c) nunca inventar — `confianca: "baixa"` e campos nulos são respostas válidas e
preferíveis a um chute.

### 3.2 Do nosso banco

| Campo | Origem | Situação |
|:---|:---|:---|
| `brand`, `model`, `year` | `machines` | ✅ existe |
| `usage_purpose` | `machines` | ⚠️ texto livre, 4 valores de fato |
| `location_lat/lng`, `location_cep` | `postings` | ✅ existe |
| Horímetro acumulado da máquina | — | ❌ **não existe** (ver §10) |
| Potência (cv) | — | ❌ **não existe** (ver §10) |
| Comparáveis internos | `postings.hourly_rate` | ✅ existe, pouco volume ainda |

### 3.3 Paramétricos por categoria (constantes nossas, versionadas)

| Parâmetro | Símbolo | Trator | Colheitadeira | Pulverizador |
|:---|:---:|---:|---:|---:|
| Vida útil (h de motor) | `L` | 12.000 | 9.000 | 10.000 |
| Valor residual (fração de `V_novo`) | `s` | 0,20 | 0,20 | 0,20 |
| Dias reserváveis/ano (janela sazonal) | `D` | 120 | 45 | 90 |
| Ocupação-alvo | `U` | 0,55 | 0,70 | 0,55 |
| Fator de carga (h motor / h faturada) | `λ` | 0,65 | 0,75 | 0,70 |
| Coef. de reparo ASABE | `RF1` | 0,007 | 0,040 | 0,028 |
| Expoente de reparo ASABE | `RF2` | 2,0 | 2,1 | 2,1 |
| Seguro + tributos + guarda (%/ano de `V_usado`) | `i` | 0,02 | 0,02 | 0,02 |
| Custo de capital real (%/ano) | `r` | 0,08 | 0,08 | 0,08 |
| Fração da depreciação atribuída ao tempo | `φ` | 0,55 | 0,55 | 0,55 |
| Margem do locador | `m` | 0,20 | 0,20 | 0,20 |

`RF1`/`RF2` vêm do padrão **ASABE EP496 / D497** (engenharia agrícola), que é a
referência aceita para custo de máquinas agrícolas — não são números inventados.
Todos ficam num único módulo de parâmetros, versionado, para poderem ser
recalibrados com os dados reais da plataforma.

---

## 4. O algoritmo

### 4.1 Horas faturáveis por ano

```
H_fat = D × U × 8          # horas faturadas/ano
H_mot = H_fat × λ          # horas de motor/ano
```

Este é o **parâmetro mais sensível de todo o modelo**. Errar `D × U` em 30% erra
o preço em ~20%. Ele merece explicação na UI e, no futuro, deve ser medido a
partir do histórico real de reservas da própria plataforma, por categoria e
região — em vez de estimado.

### 4.2 Custos fixos anuais (existem com a máquina parada)

**Depreciação temporal.** A perda de valor cai com a idade e tende a um piso
(máquina velha já perdeu o que tinha para perder):

```
d(idade) = d_min + (d_0 − d_min) · e^(−k · idade)      d_0 = 0,15  d_min = 0,05  k = 0,15
D_tempo  = φ · d(idade) · V_usado
```

O fator `φ` existe para **não contar a depreciação duas vezes**: o valor de
mercado observado já embute desgaste *e* envelhecimento. Atribuímos `φ` ao tempo
(aqui) e o restante ao uso (§4.3).

**Custo de capital.** Dinheiro parado na máquina:

```
C_cap = r · V_usado
```

`r` é taxa **real** (descontada a inflação), porque o resto do modelo está em
termos reais. Referência: custo de oportunidade do produtor / linhas do Plano
Safra.

**Seguro, tributos e guarda:**

```
C_seg = i · V_usado
```

**Total fixo:**

```
F = D_tempo + C_cap + C_seg
```

### 4.3 Custos variáveis por hora de motor (causados por quem aluga)

**Depreciação por uso** — quanto de vida útil o locatário consome por hora:

```
W_desgaste = V_novo · (1 − s) / L
```

Usa-se `V_novo` (custo de reposição), não `V_usado`: a hora consumida vale o que
custa repor aquela capacidade.

**Reparos marginais (ASABE).** O custo acumulado de reparo cresce com o
quadrado das horas; o custo *marginal* na hora `h` é a derivada:

```
RC(h)    = RF1 · V_novo · (h/1000)^RF2
W_reparo = dRC/dh = RF1 · RF2 · V_novo · (h/1000)^(RF2−1) / 1000
```

É isto que captura a intuição correta e contra-intuitiva: **o custo por hora cai
muito menos do que o valor da máquina**. Medido no motor: um trator que hoje vale
38% do que valia ainda custa ~63% por hora. Capital e depreciação caem junto com
o valor, mas a curva de reparo sobe e absorve boa parte da queda — a manutenção
sai de ~4% para ~38% do custo horário.

É a razão de o modelo somar componentes em vez de aplicar um percentual sobre o
preço de mercado: o percentual subprecificaria toda máquina velha. Verificado em
`test_custo_horario_cai_bem_menos_que_o_valor_da_maquina`.

**Opcionais** (só se o anúncio incluir):

```
W_diesel   = 0,15 · potencia_cv · preço_litro     # ≈ consumo a carga parcial
W_operador = salário_hora · (1 + encargos)
```

**Total variável, convertido para hora faturada:**

```
W = (W_desgaste + W_reparo [+ W_diesel] [+ W_operador]) · λ
```

### 4.4 Tarifa de custo e tarifa base

```
Custo_hora = F / H_fat + W
Tarifa_custo = Custo_hora · (1 + m)
```

---

## 5. Ancoragem em mercado

O custo diz o **piso defensável**; o mercado diz o que **realmente se paga**. A
sugestão final combina três sinais:

```
Tarifa_ancorada = w_c · Tarifa_custo + w_m · Tarifa_mercado + w_i · Tarifa_interna
```

- `Tarifa_interna` = mediana de `hourly_rate` de anúncios ativos da mesma
  categoria, faixa de potência (±20%) e faixa de ano (±3) num raio de 300 km.
- Pesos por disponibilidade e confiança:

| Situação | `w_c` custo | `w_m` mercado | `w_i` interno |
|:---|---:|---:|---:|
| Sem comparável interno, pesquisa fraca | 1,00 | 0,00 | 0,00 |
| Sem comparável interno, pesquisa boa | 0,55 | 0,45 | 0,00 |
| ≥ 5 comparáveis internos | 0,30 | 0,25 | 0,45 |

O peso interno crescente é intencional: **conforme a plataforma acumula
anúncios e locações concluídas, a nossa própria base vira a melhor fonte de
preço** e a dependência da IA cai. Esse é o ativo de longo prazo do recurso.

---

## 6. Ajustes de região e sazonalidade

```
Tarifa_final = Tarifa_ancorada · M_regiao · M_sazonal · M_escassez
```

- `M_regiao` — multiplicador por UF/mesorregião (fronteira agrícola do
  Centro-Oeste paga mais que região consolidada). Tabela nossa, começa em 1,00.
- `M_sazonal` — calendário agrícola cruzado com `usage_purpose`: preparo de solo
  e plantio (set–dez), colheita de verão (jan–mar), safrinha (jun–ago). Faixa
  sugerida 0,90–1,25.
- `M_escassez` — poucos anúncios concorrentes da mesma categoria no raio →
  prêmio. Limitar a [0,95 ; 1,15] para não virar preço abusivo.

Cada multiplicador é limitado individualmente e o **produto** dos três é
limitado a [0,80 ; 1,40].

---

## 7. Guarda-corpos (o que impede a IA de estragar o preço)

Nada da pesquisa entra no cálculo sem passar por:

1. **Coerência interna** — `V_usado < V_novo`; `V_usado` dentro do
   `intervalo_valor_usado_brl`; potência plausível para a categoria (20–700 cv).
2. **Sanidade de depreciação** — `V_usado / V_novo` compatível com a idade
   (2019 → esperado 0,45–0,75). Fora disso, `confianca = baixa`.
3. **Banda de saída** — `Custo_hora / V_usado` deve cair em **0,02%–0,10% por
   hora faturada**. Fora da banda, não sugere: mostra a faixa de mercado e
   avisa que não conseguiu estimar com segurança.
4. **Exigência de fonte** — sem `fontes[]`, o resultado é descartado.
5. **Fallback em cascata** — pesquisa falhou → comparáveis internos → tabela
   R$/cv por categoria e ano → **não sugerir**. Nunca inventar.
6. **Nunca bloquear.** A sugestão é assíncrona, com timeout curto. Se falhar, o
   locador digita o valor normalmente. Criar anúncio **não pode** depender disso.
7. **Nunca preencher sozinho.** O campo é sugerido, com botão "usar este valor".
   O locador é quem decide o preço — inclusive juridicamente.

---

## 8. Saída

Faixa, nunca ponto único:

```json
{
  "sugerido_brl_hora": 192.16,
  "faixa_brl_hora": [163.00, 221.00],
  "locatario_paga_brl_hora": 201.77,
  "equivalente_diaria_brl": 1537.28,
  "confianca": "media",
  "composicao": [
    {"item": "Depreciação (tempo)",      "brl_hora": 33.65, "pct": 0.18},
    {"item": "Custo de capital",         "brl_hora": 57.58, "pct": 0.30},
    {"item": "Seguro, tributos, guarda", "brl_hora": 14.39, "pct": 0.07},
    {"item": "Desgaste (vida útil)",     "brl_hora": 26.86, "pct": 0.14},
    {"item": "Manutenção e reparos",     "brl_hora": 27.64, "pct": 0.14},
    {"item": "Margem do locador (20%)",  "brl_hora": 32.03, "pct": 0.17}
  ],
  "premissas": {
    "valor_mercado_usado_brl": 380000,
    "horas_faturaveis_ano": 528,
    "horas_motor_ano": 343,
    "margem": 0.20
  },
  "fontes": ["..."]
}
```

A `composicao` é o que dá credibilidade: o locador vê que a maior parcela é
custo de capital e entende que o preço não é arbitrário.

---

## 9. Exemplos numéricos

### 9.1 Caso normal — John Deere 6110J, 2019, 110 cv (trator)

Pesquisa: `V_usado = 380.000`, `V_novo = 620.000`, horímetro ≈ 4.900 h.

```
H_fat = 120 × 0,55 × 8 = 528 h/ano
H_mot = 528 × 0,65     = 343 h/ano

d(7)     = 0,05 + 0,10 · e^(−1,05)          = 0,085
D_tempo  = 0,55 × 0,085 × 380.000           = R$ 17.765/ano
C_cap    = 0,08 × 380.000                   = R$ 30.400/ano
C_seg    = 0,02 × 380.000                   = R$  7.600/ano
F                                            = R$ 55.765/ano
F / H_fat                                    = R$ 105,62/h faturada

W_desgaste = 620.000 × 0,80 / 12.000         = R$ 41,33/h motor
W_reparo   = 0,007 × 2,0 × 620.000 × 4,9 / 1000 = R$ 42,53/h motor
W          = (41,33 + 42,53) × 0,65          = R$ 54,51/h faturada

Custo_hora   = 105,62 + 54,51                = R$ 160,13/h
Tarifa_custo = 160,13 × 1,20                 = R$ 192,16/h  ← locador recebe
Locatário paga (×1,05)                       = R$ 201,77/h
Diária equivalente (×8)                      = R$ 1.537/dia
```

Sanidade: `160,13 / 380.000 = 0,042%/h` → dentro da banda. Diária de R$ 1,5 mil
para um trator de 110 cv sem operador e sem diesel é coerente com o praticado.

### 9.2 Caso de estresse — Case IH Axial-Flow 8250, 2023 (colheitadeira)

`V_usado = 2.400.000`, `V_novo = 3.200.000`, ~1.500 h.

```
H_fat = 45 × 0,70 × 8 = 252 h/ano       ← janela de safra curtíssima
F / H_fat ≈ R$ 1.548/h
W         ≈ R$   528/h
Custo_hora ≈ R$ 2.076/h  →  ~R$ 16.600/dia
```

O número é alto **e provavelmente correto**: colheitadeira trabalha poucas horas
por ano e cada uma custa caro. Mas expõe um limite real do modelo — no mercado,
colheitadeira é contratada **por hectare**, não por hora. Para essa categoria,
tratar a ancoragem de mercado como dominante (`w_m` alto) e, adiante, avaliar
uma unidade de cobrança alternativa (R$/ha) no `Postings`.

---

## 10. Lacunas no modelo de dados

O algoritmo depende de três coisas que hoje não existem no banco:

| Campo | Situação | Observação |
|:---|:---|:---|
| **Horímetro acumulado** | ✅ `machines.hour_meter` + `hour_meter_updated_at` | Declarado pelo locador. Ausente, é estimado por `idade × 700 h` e a resposta marca `horimetro_declarado: false`. |
| **Potência (cv)** | ✅ `machines.power_cv` | Cai para a potência vinda da pesquisa quando não informada. |
| **Categoria como enum** | ❌ ainda derivada | `params.category_for()` deduz de `usage_purpose` por palavra-chave, porque o campo é texto livre e os dados reais já divergem ("Colheita", "Colheita de Grãos"). Funciona, mas um enum tornaria a dedução desnecessária. |
| **Flags de inclusão** | ❌ só no pedido | `includes_fuel`/`includes_operator` são parâmetros do endpoint, não colunas de `postings`. Enquanto não forem gravados, dois anúncios com escopos diferentes continuam comparáveis entre si na busca — e nos comparáveis internos do §5. |

`hour_meter_updated_at` é carimbado pelo servidor e só é re-carimbado quando a
leitura muda de fato: um PATCH que reenvia o mesmo horímetro não pode rejuvenescer
a data e fazer uma leitura de um ano atrás parecer recente.

---

## 11. Persistência, cache e aprendizado

- **`machine_valuations`** — cache de pesquisa por `(brand, model, year)`, com
  TTL de 90 dias, payload JSON e fontes. Corta custo e latência drasticamente:
  vários anúncios do mesmo modelo compartilham a pesquisa.
- **`pricing_suggestions`** — toda sugestão gerada, com insumos, versão dos
  parâmetros, valor sugerido, valor efetivamente escolhido pelo locador e se ele
  aceitou. Isto é o dataset de calibração.
- **Ciclo de melhoria** — cruzar sugestão × preço final × **taxa de conversão do
  anúncio em locação**. Anúncio caro não aluga; anúncio barato aluga na hora.
  Com algumas centenas de locações concluídas dá para calibrar `D`, `U` e `m`
  com dados reais e reduzir o peso da IA.

Versionar os parâmetros (`pricing_params_version`) é obrigatório: sem isso não
se consegue explicar por que o mesmo anúncio foi sugerido a R$ 192 em março e
R$ 210 em julho.

---

## 12. Limitações conhecidas

- Não há tabela FIPE oficial de máquinas agrícolas no Brasil. A pesquisa depende
  de anúncios de usados (Mercado Máquinas, Agrofy, revendas), que refletem preço
  **pedido**, não preço **fechado** — viés para cima de 5–15%.
- `D × U` (§4.1) é hoje um chute educado. É a maior fonte de erro do modelo.
- Frete/mobilização não entra na tarifa horária; é custo à parte e pode ser
  maior que a locação em distâncias longas.
- Implementos sem motor (grade, plantadeira) não seguem a curva ASABE de trator;
  precisam de parâmetros próprios ou ficam fora da v1.

---

## 13. Decisões pendentes

Resolvidas na implementação:

- **Campos do §10** — `hour_meter` e `power_cv` foram adicionados.
- **Provedor** — Groq (`groq/compound-mini` + `openai/gpt-oss-120b`) por padrão;
  Gemini e Claude são alternativas explícitas. Cache de 90 dias por `(marca, modelo, ano)`.
  Sem a chave do provedor escolhido (`GROQ_API_KEY` por padrão), o recurso não
  aparece; nada mais deixa de funcionar.
- **Categorias** — as três (trator, colheitadeira, pulverizador) estão na tabela
  de parâmetros. Colheitadeira produz números altos porém coerentes (§9.2).

Em aberto:

1. `includes_fuel`/`includes_operator` viram colunas de `postings`? Sem isso, a
   busca compara tarifas de escopos diferentes.
2. `usage_purpose` vira enum, tornando `category_for()` desnecessário?
3. A sugestão aparece também em "reprecificar", no `GerenciarAnuncio`?
4. Colheitadeira ganha unidade de cobrança por hectare (§9.2)?
5. Quando houver histórico suficiente, recalibrar `D`, `U` e `m` a partir das
   locações concluídas e subir `PARAMS_VERSION`.


### Configuração gratuita de desenvolvimento

O adaptador `BackEnd/pricing/groq.py` usa a busca web do Compound e depois
extrai os fatos com GPT OSS pelo schema JSON. As fontes vêm dos resultados
reais da busca, nunca de URLs inventadas durante a extração. Respostas
incompletas ou sem fontes não viram sugestões. O adaptador Gemini segue a
mesma separação, preservando também as sugestões de pesquisa do Google.
Veja a configuração e as restrições de cada provedor no
[guia Docker](../Devops/README.md#precificação-com-groq-gratuito).
