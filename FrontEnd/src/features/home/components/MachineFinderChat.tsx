import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Link } from "react-router";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "framer-motion";
import { ArrowLeft, ArrowUpRight, MessageCircle, RotateCcw, Tractor, X } from "lucide-react";
import { postingMachineName } from "@/features/postings/types/posting";
import { PostingSearchEmptyState } from "@/features/postings/components/PostingSearchEmptyState";
import { useMachineFinder } from "../hooks/useMachineFinder";
import { questions } from "../types/machineFinder";
import { MachineFinderAnswer } from "./MachineFinderAnswer";
import "./MachineFinderChat.css";

type ChatMotion = { enabled: boolean; reduced: boolean };
const panelMotion: Variants = {
  closed: ({ enabled, reduced }: ChatMotion) => ({
    opacity: 0,
    transform: enabled && !reduced ? "translateY(16px) scale(0.94)" : "none",
    transition: { duration: enabled ? (reduced ? 0.12 : 0.18) : 0, ease: [0.22, 1, 0.36, 1] },
  }),
  open: ({ enabled, reduced }: ChatMotion) => ({
    opacity: 1,
    transform: enabled && !reduced ? "translateY(0px) scale(1)" : "none",
    transition: { duration: enabled ? (reduced ? 0.12 : 0.28) : 0, ease: [0.22, 1, 0.36, 1] },
  }),
};

function AnimatedChatPanel({ children, animation, ...props }: ComponentProps<typeof Dialog.Content> & { animation: ChatMotion }) {
  const present = useIsPresent();
  return <Dialog.Content {...props} forceMount asChild>
    <motion.div inert={!present} aria-hidden={!present || undefined} custom={animation}
      variants={panelMotion} initial="closed" animate="open" exit="closed">
      {children}
    </motion.div>
  </Dialog.Content>;
}

function ChatAvatar() {
  return <img src="/mascot/capivara-profile.jpg" alt="" width={72} height={72} draggable={false} />;
}

export default function MachineFinderChat() {
  const [open, setOpen] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const reducedMotion = useReducedMotion();
  const animation: ChatMotion = { enabled: motionEnabled, reduced: !!reducedMotion };
  const finder = useMachineFinder();
  const { step, responses, search } = finder;
  const logRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const complete = step === questions.length;

  useEffect(() => {
    if (open) questionRef.current?.focus({ preventScroll: true });
  }, [open, step]);
  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [open, step, search.status]);

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="machine-finder__launcher" aria-label="Encontrar máquina com a capivara"
          aria-hidden={open || undefined} tabIndex={open ? -1 : 0}
          onClick={(event) => setMotionEnabled(event.detail > 0)}>
          <ChatAvatar />
          <span className="machine-finder__launcher-badge"><MessageCircle size={15} aria-hidden="true" /></span>
          <span className="machine-finder__launcher-label">Qual máquina você precisa?</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal forceMount>
        <AnimatePresence custom={animation}>
        {open && <AnimatedChatPanel key="machine-finder" animation={animation} className="machine-finder"
          onEscapeKeyDown={() => setMotionEnabled(false)} onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => { event.preventDefault(); questionRef.current?.focus(); }}>
          <header className="machine-finder__header">
            <div className="machine-finder__avatar"><ChatAvatar /></div>
            <div className="machine-finder__heading">
              <Dialog.Title>Capivara da Frota</Dialog.Title>
              <Dialog.Description>Seu guia para encontrar máquinas</Dialog.Description>
            </div>
            <button type="button" onClick={finder.restart} aria-label="Recomeçar conversa" title="Recomeçar"><RotateCcw size={17} aria-hidden="true" /></button>
            <Dialog.Close asChild><button type="button" aria-label="Fechar conversa" onClick={(event) => setMotionEnabled(event.detail > 0)}><X size={20} aria-hidden="true" /></button></Dialog.Close>
          </header>
          <div className="machine-finder__progress">{complete ? "Busca no catálogo da Frota Rural" : `Pergunta ${step + 1} de ${questions.length}`}</div>
          <div className="machine-finder__conversation" ref={logRef}>
            <div role="log" aria-label="Conversa com a capivara" aria-live="polite" aria-relevant="additions text" className="machine-finder__messages">
              <p className="machine-finder__bubble">Oi, produtor! Me conte o que precisa. Vou buscar anúncios disponíveis e te levar direto à máquina.</p>
              {responses.map((response, index) => <div className="machine-finder__exchange" key={index}>
                <p className="machine-finder__bubble">{questions[index]}</p>
                <p className="machine-finder__reply"><span className="sr-only">Você: </span>{response}</p>
              </div>)}
              {!complete && <h3 ref={questionRef} tabIndex={-1} className="machine-finder__bubble machine-finder__question">{questions[step]}</h3>}
            </div>
            {complete && <div className="machine-finder__results" aria-busy={search.isPending}>
              <h3 ref={questionRef} tabIndex={-1} className="sr-only">Resultado da busca</h3>
              {search.isPending && <p role="status" className="machine-finder__bubble">Buscando máquinas e possíveis alternativas para você…</p>}
              {search.isError && <div role="alert" className="machine-finder__bubble">
                <p>Não consegui concluir a busca. {search.error.message}</p>
                <button type="button" className="machine-finder__skip" onClick={finder.retry}>Tentar novamente</button>
              </div>}
              {search.data && <>
                {search.data.total > 0 ? <p role="status" className="machine-finder__bubble">{search.data.matchType === "similar"
                  ? "Não encontrei uma correspondência exata. Estas são possíveis alternativas sugeridas por IA, respeitando os filtros que você informou. Confirme a aplicação com o locador."
                  : `Encontrei ${search.data.total} ${search.data.total === 1 ? "máquina" : "máquinas"} para esses filtros. ${search.data.total > 3 ? "Separei 3 opções para você." : "Confira:"}`}</p>
                  : <PostingSearchEmptyState compact onClear={finder.restart} />}
                {search.data.aiUnavailable && <div className="machine-finder__bubble" role="status">
                  <p>A busca por alternativas está indisponível no momento. Você pode tentar de novo em instantes ou explorar os anúncios.</p>
                  <button type="button" className="machine-finder__skip" onClick={finder.retry}>Tentar novamente</button>
                </div>}
                {search.data.results.map(({ posting, reasons }) => <article key={posting.id} className="machine-finder__result">
                  {search.data.matchType === "similar" && <p className="machine-finder__similar-label">Possível alternativa · IA</p>}
                  <div className="machine-finder__result-top">
                    <div className="machine-finder__photo">{posting.primaryPhotoUrl ? <img src={posting.primaryPhotoUrl} alt="" loading="lazy" /> : <Tractor size={28} aria-hidden="true" />}</div>
                    <div><h4>{postingMachineName(posting)}</h4><p>{posting.locationAddress || "Consulte a localização no anúncio"}</p><strong>{posting.hourlyRate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}<span>/h</span></strong></div>
                  </div>
                  <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  <Link to={`/anuncio/${posting.id}`} className="machine-finder__primary" aria-label={`Ver anúncio de ${postingMachineName(posting)}`}>Ver anúncio<ArrowUpRight size={17} aria-hidden="true" /></Link>
                </article>)}
                {search.data.total > 0 && <p className="machine-finder__hint">{search.data.datesChecked ? "Disponibilidade consultada agora; a confirmação acontece na reserva." : "As datas ainda precisam ser conferidas."} Confirme com o locador os implementos e a adequação ao seu solo.</p>}
                <Link to="/buscar-maquinario" className="machine-finder__browse">Explorar todos os anúncios<ArrowUpRight size={15} aria-hidden="true" /></Link>
              </>}
            </div>}
          </div>
          <footer className="machine-finder__composer">
            {!complete && <MachineFinderAnswer key={step} finder={finder} />}
            {step > 0 && <button type="button" className="machine-finder__back" onClick={finder.back}><ArrowLeft size={14} aria-hidden="true" />Voltar uma pergunta</button>}
            {complete && search.data?.total !== 0 && <button type="button" className="machine-finder__skip" onClick={finder.restart}>Fazer outra busca</button>}
          </footer>
        </AnimatedChatPanel>}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
