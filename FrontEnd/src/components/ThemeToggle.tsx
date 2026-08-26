import { useCallback } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import MaterialIcon from "@/components/MaterialIcon";

type ThemeToggleVariant = "icon" | "segmented";

interface ThemeToggleProps {
  /**
   * `icon`      — botão circular compacto (navbar, headers).
   * `segmented` — controle segmentado Claro / Auto / Escuro (sidebars).
   */
  variant?: ThemeToggleVariant;
  className?: string;
}

/**
 * Ativa a transição suave de cores apenas durante a troca de tema.
 * Sem isso, ou a troca é seca, ou todo hover da aplicação fica lento.
 */
const runWithTransition = (apply: () => void) => {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  apply();
  window.setTimeout(() => root.classList.remove("theme-switching"), 360);
};

const segments = [
  { value: "light", label: "Claro", icon: "light_mode" },
  { value: "system", label: "Auto", icon: "computer" },
  { value: "dark", label: "Escuro", icon: "dark_mode" },
] as const;

const ThemeToggle = ({ variant = "icon", className = "" }: ThemeToggleProps) => {
  // App puramente client-side (Vite, sem SSR): o next-themes lê localStorage
  // e matchMedia de forma síncrona no inicializador do próprio estado, então
  // `theme` e `resolvedTheme` já chegam corretos na primeira renderização.
  // O guard de montagem usado em apps com SSR seria desnecessário aqui.
  const { theme, resolvedTheme, setTheme } = useTheme();

  const applyTheme = useCallback(
    (next: string) => runWithTransition(() => setTheme(next)),
    [setTheme],
  );

  if (variant === "segmented") {
    return (
      <div
        role="radiogroup"
        aria-label="Tema da interface"
        className={`flex items-center gap-1 p-1 rounded-xl bg-surface-container border border-outline-variant/30 ${className}`}
      >
        {segments.map((segment) => {
          const isActive = (theme ?? "system") === segment.value;
          return (
            <button
              key={segment.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`Tema ${segment.label.toLowerCase()}`}
              title={`Tema ${segment.label.toLowerCase()}`}
              onClick={() => applyTheme(segment.value)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container ${
                isActive
                  ? "text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="theme-segment-active"
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                  className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <MaterialIcon icon={segment.icon} size={15} filled={isActive} />
                <span className="hidden sm:inline">{segment.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(nextTheme)}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      className={`group relative w-10 h-10 shrink-0 rounded-full flex items-center justify-center overflow-hidden text-on-surface-variant border border-outline-variant/40 bg-surface-container/60 hover:bg-surface-container-high hover:text-primary hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      {/* Brilho sutil que aparece no hover, remetendo ao nascer/pôr do sol */}
      <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-secondary-container/25 to-transparent" />

      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "dark" : "light"}
          initial={{ opacity: 0, rotate: -70, scale: 0.5 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 70, scale: 0.5 }}
          transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          className="relative z-10 flex items-center justify-center"
        >
          <MaterialIcon icon={isDark ? "dark_mode" : "light_mode"} size={20} filled={isDark} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
};

export default ThemeToggle;
