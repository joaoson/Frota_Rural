import { useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";

const MAX = 4000;
const TYPING_THROTTLE_MS = 2000;

interface Props {
  disabled?: boolean;
  onSend: (content: string) => void;
  onTyping: (isTyping: boolean) => void;
}

export default function MessageComposer({ disabled, onSend, onTyping }: Props) {
  const [value, setValue] = useState("");
  const lastTyping = useRef(0);

  const submit = () => {
    const content = value.trim();
    if (!content || disabled) return;
    onSend(content);
    setValue(""); // limpa na hora; se falhar, o texto vive na bolha "failed"
    onTyping(false);
  };

  return (
    <div className="border-t border-outline-variant/30 p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          disabled={disabled}
          rows={1}
          maxLength={MAX}
          placeholder={disabled ? "Esta conversa é somente leitura." : "Escreva uma mensagem..."}
          onChange={(e) => {
            setValue(e.target.value);
            const now = Date.now();
            if (now - lastTyping.current > TYPING_THROTTLE_MS) {
              lastTyping.current = now;
              onTyping(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="flex-1 resize-none rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary disabled:opacity-60 max-h-32"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="rounded-full bg-primary p-2 text-on-primary disabled:opacity-40"
          aria-label="Enviar"
        >
          <MaterialIcon icon="send" size={20} />
        </button>
      </div>
      {value.length > MAX * 0.9 ? (
        <p className="mt-1 text-right text-[11px] text-on-surface-variant">
          {value.length}/{MAX}
        </p>
      ) : null}
    </div>
  );
}
