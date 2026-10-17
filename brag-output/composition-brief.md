# Hyperframes Composition Brief: Frota Rural

Create a 22-second landscape 1920×1080 launch video from the storyboard in brag-plan.md. Language pt-BR; no narration; warm polished tone.

## Source material
README.md; FrontEnd/src/index.css; FrontEnd/src/pages/Index.tsx; FrontEnd/src/pages/BuscarMaquinario.tsx; FrontEnd/src/pages/AnuncioDetalhe.tsx; FrontEnd/src/pages/Reservar.tsx; FrontEnd/src/pages/Contrato/Contrato.tsx; FrontEnd/src/components/MascoteFrota.tsx.
Use the existing machine photos, mascot, Epilogue and Inter. Recreate legible excerpts of the actual UI, adapted for video. Source sample listings are illustrative, not live inventory. Keep an unobtrusive “Demonstração · dados ilustrativos” label on UI scenes. Condense intermediate rental approvals and payment, without claiming instant guaranteed rental.

## Copy and direction
Hook: Máquina parada. Safra esperando.
Search: Encontre a máquina certa. / Buscar Maquinário
Action: Solicitar Reserva
Contract: Assine o Contrato Digitalmente / Assinar e Finalizar
Close: Frota Rural / O maquinário certo. Na hora certa.
Four beats: 0–3.27 hook; 3.27–8.74 search; 8.74–18.56 reserve/sign; 18.56–22 brand.
Palette #0A3701, #FEB734, #FFFAEB, #1F2119. Photo crops and cream UI surfaces carry the story; amber signals action. Font sizes adapted to 1080p. Keep runtime and assets local.

## Audio
Bundled vol-12 at 0.30, 0.4s fade-in and 1.5s fade-out, on track 10. Exact music cue preset copied to composition/assets/music/. Strong locks 8.74 / 13.11 / 18.56. Card sequence 3.82 / 4.39 / 4.91.
SFX analysis: ~/.codex/skills/brag/assets/sfx/sfx-analysis.md; use low-risk short clicks and warm reveal thud. Separate tracks.
Audio-reactive helper was tried and failed with ModuleNotFoundError: numpy. Reactive treatment omitted; deterministic cue sync retained.

## Deliverables
composition/index.html and local assets; brag.mp4; brag.jpg as poster and video frame zero; share-copy.txt. Run Hyperframes check with zero errors, inspect hero frames, render locally, verify duration and streams. The brag invocation authorizes complete local video creation.
