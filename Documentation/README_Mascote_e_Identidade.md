# Mascote e Identidade — Frota Rural

Documento de referência para geração de imagens do mascote e para qualquer peça
visual da marca. Contém: o que o produto é, o que o mascote simboliza, as regras
de estilo e os prompts prontos para gerador de imagem.

---

## 1. O que é o Frota Rural

Marketplace web que conecta **quem tem maquinário agrícola parado** a **quem
precisa de máquina numa janela curta de safra** — com o **serviço de operação
junto**, contrato com aceite digital e pagamento dentro da plataforma.

| | |
|---|---|
| **Atores** | Locador, Locatário, Operador, Administrador |
| **Dor central** | Máquina ociosa sem canal seguro; locação informal, sem contrato e sem verificação Renagro; pagamento sem garantia |
| **Meta-valor** | Otimizar a produtividade no campo e dar segurança à contratação |
| **Não é** | Venda de máquina, transportadora, financeira, seguradora, escritório jurídico, vínculo empregatício |

Três palavras que a identidade precisa carregar: **confiança, simplicidade,
chão de terra**. Nada de agro high-tech futurista, nada de corporativo frio.

---

## 2. O que o peãozinho simboliza

O mascote é um **peão de chapéu** — não um fazendeiro rico, não um engenheiro,
não um robô. É o produtor médio, o operador, a pessoa que está no campo.

| Elemento | O que simboliza |
|---|---|
| **Disco verde fechado ao redor dele** | O contrato e o fluxo fechado da plataforma: anúncio, aceite digital e pagamento acontecem *dentro* do círculo. Nada fora do fluxo. |
| **Chapéu de aba larga, âmbar** | Trabalho a céu aberto e proteção. O âmbar é a cor da safra madura — a janela curta de safra é o relógio do produto. |
| **Lenço no pescoço** | O **operador**. O diferencial do Frota Rural não é a máquina sozinha: é máquina + gente qualificada para operar. |
| **Rosto simples, sorriso curto** | O fluxo simplificado. É o oposto da burocracia que o produto substitui. Ele está tranquilo porque o contrato está formalizado. |
| **Formas 100% arredondadas, sem pontas** | Sem atrito, sem letra miúda, sem risco de golpe. |
| **Ausência de máquina no desenho** | O produto conecta **pessoas**, não vende equipamento. Máquina aparece nas fotos dos anúncios, nunca no mascote. |

**Personalidade:** prestativo, calmo, direto. Nunca engraçadinho, nunca
"mascote de banco". Ele acena e sai da frente.

---

## 3. Paleta obrigatória

Vindo direto de `FrontEnd/src/index.css` — não inventar cor nova.

| Token | Hex | Uso no mascote |
|---|---|---|
| `--primary` | `#0A3701` | Disco de fundo, olhos, sorriso |
| `--secondary-container` | `#FEB734` | Chapéu, lenço, bochechas |
| `--background` | `#FFFAEB` | Rosto e corpo |
| `--tertiary` | `#3D2914` | Fundo alternativo (marrom terra) |
| `--secondary` | `#804D00` | Fundo alternativo (âmbar escuro) |

Regra: **três cores por imagem**, no máximo. Sem gradiente, sem sombra, sem
degradê, sem textura.

---

## 4. Regras de estilo (para o gerador)

**Sempre:**
- Vetor flat, formas geométricas pesadas e arredondadas
- Composição quadrada, personagem centralizado, recortado num círculo
- Contorno zero (as formas se separam por contraste de cor, não por linha)
- Legível a 24 px

**Nunca:**
- Realismo, 3D, textura de pincel, aquarela, sombra projetada
- Olhos com brilho/reflexo, boca aberta, dentes
- Chapéu de caubói americano (é chapéu de peão brasileiro, aba larga e reta)
- Trigo, celeiro vermelho, moinho, bandeira — imaginário rural americano
- Texto ou letra dentro da imagem

---

## 5. Prompts prontos

Geradores respondem melhor em inglês; mantive os hex explícitos.

### 5.1 Mascote principal

```
Flat vector mascot logo, square 1:1, of a cute chubby Brazilian farm worker
("peão") shown from the chest up, centered inside a solid circle.
Extremely simple geometry: only circles, ellipses and heavy rounded rectangles.
Wide flat-brim straw hat in amber #FEB734 with a dark green hat band.
Cream #FFFAEB face and shirt. Amber #FEB734 bandana tied around the neck.
Two small dot eyes and a short curved smile in deep forest green #0A3701.
Round amber cheeks. Background circle in deep forest green #0A3701.
Strictly three colors: #0A3701, #FEB734, #FFFAEB.
No outlines, no gradient, no shadow, no texture, no text.
Friendly, calm, minimal, readable at 24 pixels. App icon style.
```

### 5.2 Corpo inteiro (para tela de estado vazio / onboarding)

```
Same flat vector mascot, full body, standing, arms short and rounded, waving
with one hand. Cream #FFFAEB body, amber #FEB734 hat and bandana, deep forest
green #0A3701 details, flat solid cream background. Three colors only.
No outline, no gradient, no shadow, no text. Minimal geometric shapes.
```

### 5.3 Variações de estado (mesma personagem, mesmo estilo)

Trocar só a última frase do prompt 5.1:

| Tela | Frase de expressão |
|---|---|
| Busca vazia | `looking around with one hand shading his eyes above the brim, curious expression` |
| Contrato assinado | `giving a small thumbs up, eyes as happy closed arcs` |
| Erro / pagamento recusado | `slightly worried, eyebrows as two short tilted lines, small flat mouth` |
| Boas-vindas | `waving with one raised hand, wide simple smile` |
| Chat / mensagem nova | `holding a rounded speech bubble in amber #FEB734` |

**Importante:** gere as variações a partir da imagem principal como referência,
não do zero — senão o rosto muda entre as telas.

---

## 6. Onde o mascote pode e não pode aparecer

| Pode | Não pode |
|---|---|
| Favicon, avatar padrão, ícone do app | Dentro do contrato gerado |
| Estados vazios (sem anúncios, sem locações) | Tela de assinatura digital |
| Onboarding, boas-vindas, cadastro | Comprovante de pagamento |
| E-mail transacional (topo) | Mensagem de erro de pagamento ou fraude |
| Material de divulgação | Sobre foto de máquina |

Regra geral: **onde o produtor está decidindo, o mascote ajuda; onde ele está
assinando ou pagando, o mascote sai de cena.** Documento formal é sério.

---

## 7. Tom de voz que acompanha o mascote

- Fala **"produtor"**, **"locador"**, **"locatário"** — nunca "cliente" ou "usuário"
- Frase curta, verbo no início: "Anuncie sua colheitadeira", não "Você pode anunciar"
- Erro explica o que fazer: "Esse Renagro já está cadastrado. Confira o número
  ou fale com o suporte." — nunca "Ocorreu um erro inesperado"
- Sem juridiquês, sem gíria de agro-influencer

---

## 8. Arquivos existentes

- `FrontEnd/public/mascote.svg` — versão vetorial atual (feita à mão, 3 cores)
- `FrontEnd/src/components/MascoteFrota.tsx` — componente React (`size`, `bgColor`)

Se a imagem gerada substituir o SVG, manter os mesmos hex e a mesma silhueta
circular, para não quebrar o favicon nem os avatares.

---

## 9. Camada personagem (estilo Duolingo)

O que está nas seções 4 e 5 é a **camada ícone**: 3 cores, sem sombra, sem
esclera, feito para 24 px. Esta seção é a **camada personagem**: corpo inteiro,
cabeça grande, olho expressivo, dois tons por cor — feita para onboarding,
estado vazio, e-mail e divulgação, onde há espaço e o mascote precisa atuar.

As duas camadas convivem. A camada personagem **não substitui** o
`mascote.svg`: favicon e avatar continuam no disco circular de três cores.

Diferenças assumidas em relação à seção 4:

| Regra do ícone | Na camada personagem |
|---|---|
| Sem esclera, olho é ponto verde | Olho grande com esclera branca e pupila `#0A3701` (sem brilho) |
| Três cores, sem sombra | Cinco cores, sombreamento chapado em dois tons |
| Busto, recortado em círculo | Corpo inteiro, fundo creme chapado |

Mantido igual: chapéu de aba larga âmbar, lenço no pescoço, formas 100%
arredondadas, sem contorno, sem gradiente, sem textura, sem texto, sem
imaginário rural americano, sem máquina no desenho.

### 9.1 Prompt principal

```
Full-body flat vector mascot character illustration, Duolingo-style: a cute
chubby Brazilian farm worker ("peão") with a big round head about 45% of the
total body height, tiny rounded body, short stubby arms and legs, no neck.
Wide flat-brim straw hat in amber #FEB734 sitting low over the forehead.
Cream #FFFAEB skin and shirt, amber #FEB734 bandana knotted at the neck,
deep forest green #0A3701 trousers and boots.
Face: two very large oval eyes with white sclera and big deep-green #0A3701
pupils, thick rounded eyelids, no eyelashes, no glint; small soft smile,
round amber #FEB734 cheek blushes. Expression friendly, warm and encouraging.
Pose: standing three-quarter view, one short arm raised waving, weight on one
leg, slight forward lean, energetic and welcoming.
Style: heavy geometric shapes built only from circles, ellipses and rounded
rectangles; clean vector, no outline; flat two-tone shading only (one solid
base plus one slightly darker flat tone of the same hue for the underside of
the hat, arms and boots); soft rounded silhouette readable as a black shape.
Palette strictly #0A3701, #FEB734, #FFFAEB, #804D00, plus white for the eyes.
Solid flat cream #FFFAEB background, full character inside frame with margin,
square 1:1, centered.
Modern mobile-app mascot, playful but calm, designed to be animated.
No 3D, no gradients, no drop shadows, no texture, no brush strokes, no
outlines, no text, no American cowboy hat, no wheat, no barn, no tractor,
no realistic proportions, no open mouth, no teeth.
```

### 9.2 Folha de expressões

Rodar **depois** do 9.1, passando a imagem aprovada como referência.

```
Same character, same style, same palette, unchanged face and proportions.
Model sheet with the character repeated in six poses on a flat cream #FFFAEB
background, evenly spaced grid, full body each time:
1) waving hello, wide smile
2) both arms up celebrating, eyes as happy closed arcs
3) small thumbs up, calm confident smile
4) worried, eyebrows tilted, small flat mouth, hands together
5) one hand shading the eyes above the hat brim, looking for something
6) holding a rounded amber #FEB734 speech bubble.
Identical character identity in all six. No text, no outlines, no shadows.
```

### 9.3 Onde usar

Valem as mesmas fronteiras da seção 6 — o corpo inteiro entra em onboarding,
estado vazio e divulgação; **não entra** em contrato, assinatura, comprovante
de pagamento nem mensagem de fraude.
