import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

/**
 * Shell padrão de página pública/autenticada: Navbar + conteúdo + Footer.
 *
 * Estava repetido em 15 páginas. O `<div>` externo era byte a byte idêntico em
 * todas; o wrapper interno é que variava — daí a prop `width`.
 */
export type PageWidth = "narrow" | "medium" | "wide" | "extraWide" | "centered" | "full";

const WIDTHS: Record<PageWidth, string> = {
  narrow: "flex-1 pt-32 pb-20 max-w-2xl mx-auto px-6 w-full",
  medium: "flex-1 pt-32 pb-20 max-w-[1000px] mx-auto px-6 w-full",
  wide: "flex-1 pt-32 pb-20 max-w-[1100px] mx-auto px-6 w-full",
  extraWide: "flex-1 pt-32 pb-20 max-w-[1200px] mx-auto px-6 w-full",
  centered: "flex-1 pt-32 pb-20 flex items-center justify-center px-6",
  full: "flex-1 pt-32 pb-20 px-6 w-full",
};

/** Variante das telas de documento: padding menor no mobile. */
const RESPONSIVE_WIDTH =
  "flex-1 pt-24 sm:pt-32 pb-16 sm:pb-20 max-w-4xl mx-auto px-4 sm:px-6 w-full";

interface PageShellProps {
  children: React.ReactNode;
  width?: PageWidth;
  /** Usa o wrapper com breakpoints das telas de upload de documento. */
  responsive?: boolean;
  className?: string;
}

export function PageShell({
  children,
  width = "narrow",
  responsive = false,
  className,
}: PageShellProps) {
  const inner = responsive ? RESPONSIVE_WIDTH : WIDTHS[width];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className={className ? `${inner} ${className}` : inner}>{children}</div>
      <Footer />
    </div>
  );
}
