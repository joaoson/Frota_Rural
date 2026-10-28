# Brag Plan: Frota Rural

## Planning rubric
1. Agricultural machinery rental marketplace connecting idle equipment with producers who need it.
2. Strongest claim: “do anúncio ao contrato assinado, em um só lugar” (README).
3. Visual hook: machine photography against forest green and amber, with oversize agricultural copy.
4. Actual product material: search listing photos/titles from Index.tsx, search controls from BuscarMaquinario.tsx, reservation and signing states from Reservar.tsx.
5. Minimum satisfying duration: 22 seconds.
6. Tone: polished; a warm, direct Brazilian agricultural product film.
7. Audio: steady business music, three restrained motion-matched clicks/accents. Narration disabled.
8. Caption: Criamos o Frota Rural para conectar máquinas paradas a quem precisa delas na safra. Busca, reserva e contrato digital em um só lugar.
9. Flow: filter machines → request reservation → complete contract signing. Demonstration data, not a live transaction.

## Angle and hook
“Máquina parada. Safra esperando.” Two halves of the same problem. Bring the equipment into the digital rental flow, then close with the source tagline.

## Format and identity
Landscape, 1920×1080, 30 fps, 22 seconds. Portuguese text.
Forest #0A3701, amber #FEB734, cream #FFFAEB, ink #1F2119.
Epilogue headings and Inter body, matching FrontEnd/src/index.css.
Source visuals: machine-1.jpg, machine-2.jpg, machine-3.jpg, hero-bg.jpg, public/mascote.svg.

## Storyboard
### 1 — Hook / 0–3.27 (3.27s)
Large cream “Máquina parada.” then amber “Safra esperando.” anchored left. Oversized local machine photograph right. Small Frota Rural identity. First line settles by 0.55s, second by 1.1s. Deliberate crop/pan of the photograph. No statistics or testimonials.
### 2 — Find / 3.27–8.74 (5.47s)
“Encontre a máquina certa.” Source-derived search UI: Buscar Maquinário; location Mato Grosso; all activities; a featured Colheitadeira JD S700 listing with source photo, R$ 480/hora and location. Two smaller source listings illustrate the catalog. Cards enter in sequence at 3.82 / 4.39 / 4.91, then hold. Cursor selects the first card at 7.64. Label “Demonstração · dados ilustrativos”.
### 3 — Reserve and sign / 8.74–18.56 (9.82s)
“Da reserva ao contrato.” A large detail/reservation panel showing selected machine, illustrative dates 21–23 set. 2026, source action “Solicitar Reserva”. Cursor clicks at 10.93. Reservation stepper uses actual labels Dados da Reserva → Pagamento → Assinatura do Contrato. Payment and approval are explicitly condensed in this demonstration. At 13.11, a contract panel replaces the request panel, displaying “Assine o Contrato Digitalmente”, example signer “Produtor demonstrativo” and source action “Assinar e Finalizar”. A success mark and “Assinatura registrada” at 16.38, holding until 18.56. No legal guarantees or invented real transaction.
### 4 — Brand / 18.56–22 (3.44s)
Mascot and Frota Rural lockup, then source-derived close: “O maquinário certo. Na hora certa.” Amber action “Busque. Reserve. Cultive.” Holds through the end.

## Audio and music cue guidance
Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3, 109.96 BPM, first 22s, 0.30 gain, fade 0–0.4 and 20.5–22.
Preset: bundled assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json.
Strong cue locks: 8.74, 13.11, 18.56. Sequential card grid: 3.82, 4.39, 4.91; full set holds to preserve reading time.
SFX: restrained card arrival, selection click, signing success; choose short low-HF-risk sounds from bundled analysis.
Audio reactive: optional extraction attempted; helper unavailable because Python numpy is absent. Continue with cue-synced animation and no reactive treatment.
Restraint: no voice, no pulsing text, no sound on every word.
