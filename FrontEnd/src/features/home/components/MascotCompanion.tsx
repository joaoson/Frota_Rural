import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Hand, Search, Sprout, Tractor } from "lucide-react";
import "./MascotCompanion.css";

const guides = [
  { label: "Quero alugar", icon: Search, title: "Encontre uma mão na sua safra.", description: "Busque máquinas pela atividade e localização. Escolha o que faz sentido para o seu campo.", action: "Encontrar máquinas", to: "/buscar-maquinario", pose: "curious" },
  { label: "Quero anunciar", icon: Tractor, title: "Sua máquina tem mais campo pela frente.", description: "Cadastre seu equipamento e prepare seu anúncio com fotos, preço e disponibilidade.", action: "Começar meu cadastro", to: "/login", pose: "proud" },
  { label: "Como funciona", icon: Sprout, title: "Vamos por partes, produtor.", description: "Conheça as etapas da locação, do anúncio ao contrato. Conte com uma orientação em cada passo.", action: "Conhecer a Frota Rural", to: "/help", pose: "welcome" },
] as const;

/** Homepage guide. Keep outside contracts, signatures and payment flows. */
export default function MascotCompanion() {
  const [selected, setSelected] = useState(0);
  const [reaction, setReaction] = useState<"happy" | "wink" | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const characterRef = useRef<HTMLDivElement>(null);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taps = useRef(0);
  const headingId = useId();
  const guide = guides[selected];

  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
  }, []);

  function lookAtPointer(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-5, Math.min(5, ((event.clientX - bounds.left) / bounds.width - 0.5) * 12));
    const y = Math.max(-4, Math.min(4, ((event.clientY - bounds.top) / bounds.height - 0.5) * 10));
    if (characterRef.current) characterRef.current.style.transform = `perspective(700px) rotateY(${x}deg) rotateX(${-y}deg)`;
  }

  function greet() {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    taps.current += 1;
    setReaction(taps.current % 2 ? "happy" : "wink");
    reactionTimer.current = setTimeout(() => setReaction(null), 1800);
  }

  return (
    <aside className="frota-companion" aria-labelledby={headingId}
      data-pose={reaction ?? guide.pose} data-keyboard={keyboard}

      onPointerDown={() => setKeyboard(false)} onKeyDown={() => setKeyboard(true)}>
      <div className="frota-companion__eyebrow"><span /> SEU PARCEIRO NO CAMPO</div>
      <div className="frota-companion__stage">
        <div className="frota-companion__sun" aria-hidden="true" />
        <span className="frota-companion__hello" aria-live="polite">{reaction ? (reaction === "happy" ? "Bom ter você por aqui!" : "Conte comigo, produtor.") : "Um aceno para começar?"}</span>
        <div ref={characterRef} className="frota-companion__parallax"
          onPointerMove={lookAtPointer}
          onPointerLeave={() => { if (characterRef.current) characterRef.current.style.transform = ""; }}>
          <button type="button" className="frota-companion__character" onClick={greet} aria-label="Cumprimentar a capivara da Frota Rural">
            <span className="frota-companion__sprite" aria-hidden="true" />
          </button>
        </div>
        <span className="frota-companion__hint"><Hand size={13} aria-hidden="true" /> Toque para dar um oi</span>
      </div>
      <div className="frota-companion__guidance">
        <div className="frota-companion__choices" role="group" aria-label="Como o mascote pode ajudar">
          {guides.map(({ label, icon: Icon }, index) => (
            <button key={label} type="button" aria-pressed={selected === index} onClick={() => { if (reactionTimer.current) clearTimeout(reactionTimer.current); setSelected(index); setReaction(null); }}>
              <Icon size={15} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        <div className="frota-companion__copy" aria-live="polite" aria-atomic="true">
          <h2 id={headingId}>{guide.title}</h2>
          <p>{guide.description}</p>
        </div>
        <Link className="frota-companion__link" to={guide.to}>{guide.action}<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
    </aside>
  );
}
