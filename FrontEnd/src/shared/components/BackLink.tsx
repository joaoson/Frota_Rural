import { Link } from "react-router";

import MaterialIcon from "@/components/MaterialIcon";

/** Link de voltar com seta. Estava repetido em 7 páginas, className idêntico. */
interface BackLinkProps {
  to: string;
  children: React.ReactNode;
}

export function BackLink({ to, children }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="text-sm font-bold text-primary hover:underline mb-8 inline-flex items-center gap-1"
    >
      <MaterialIcon icon="arrow_back" size={16} /> {children}
    </Link>
  );
}
