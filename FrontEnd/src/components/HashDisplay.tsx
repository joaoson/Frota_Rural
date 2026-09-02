import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";

interface HashDisplayProps {
  /** Rótulo descritivo exibido acima do hash. */
  label: string;
  /** Valor do hash a ser exibido. */
  value: string;
  /** Tamanho dos blocos de agrupamento visual. */
  groupSize?: number;
}

/**
 * Exibe um hash criptográfico de forma legível.
 *
 * O valor é quebrado em grupos curtos separados por espaço, de modo que a
 * conferência visual caractere a caractere não dependa de acompanhar uma
 * sequência contínua e longa. A quebra de linha ocorre apenas entre grupos,
 * nunca no meio de um deles, e o tamanho de fonte segue o corpo de texto em
 * vez do menor tamanho da interface.
 */
export default function HashDisplay({
  label,
  value,
  groupSize = 8,
}: HashDisplayProps) {
  const [copiado, setCopiado] = useState(false);

  const grupos = value ? value.match(new RegExp(`.{1,${groupSize}}`, "g")) ?? [] : [];

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="text-xs font-bold text-outline uppercase tracking-wide">
          {label}
        </div>
        <button
          type="button"
          onClick={copiar}
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-tertiary hover:bg-surface-container transition-colors"
          aria-label={`Copiar ${label}`}
        >
          <MaterialIcon icon={copiado ? "check" : "content_copy"} size={16} />
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div
        className="font-mono text-sm text-tertiary leading-relaxed tracking-wide break-words"
        title={value}
      >
        {grupos.map((g, i) => (
          <span key={i} className="inline-block mr-2">
            {g}
          </span>
        ))}
      </div>
    </div>
  );
}
