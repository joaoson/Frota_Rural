import { motion } from "framer-motion";
import MaterialIcon from "@/components/MaterialIcon";
import type { ChatMessage } from "@/services/ChatService/models/ChatModels";

export type BubbleStatus = "pending" | "sent" | "failed";

interface Props {
  message: ChatMessage;
  own: boolean;
  status?: BubbleStatus;
  onReport?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({ message, own, status = "sent", onReport, onRetry }: Props) {
  const pending = status === "pending";
  const failed = status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: pending ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`group flex ${own ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          own
            ? "bg-primary text-on-primary rounded-br-sm"
            : "bg-surface-container-low text-on-surface rounded-bl-sm"
        }`}
      >
        {message.hidden ? (
          <p className="italic text-sm opacity-70">Mensagem removida pela moderação.</p>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
          {failed ? (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              className="flex items-center gap-1 font-semibold underline"
            >
              <MaterialIcon icon="refresh" size={12} /> Reenviar
            </button>
          ) : pending ? (
            <MaterialIcon icon="schedule" size={12} />
          ) : (
            <>
              <span>{hhmm(message.sent_at)}</span>
              {own ? (
                <MaterialIcon icon={message.read_at ? "done_all" : "done"} size={14} />
              ) : null}
            </>
          )}
        </div>
      </div>

      {!own && !message.hidden && onReport ? (
        <button
          type="button"
          onClick={() => onReport(message)}
          title="Denunciar mensagem"
          className="ml-1 self-center opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-error"
        >
          <MaterialIcon icon="flag" size={16} />
        </button>
      ) : null}
    </motion.div>
  );
}
