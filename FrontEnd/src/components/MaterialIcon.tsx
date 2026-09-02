import type { CSSProperties, HTMLAttributes } from "react";

interface MaterialIconProps extends HTMLAttributes<HTMLSpanElement> {
  icon: string;
  className?: string;
  filled?: boolean;
  size?: number;
}

const MaterialIcon = ({ icon, className = "", filled = false, size, style: customStyle, ...props }: MaterialIconProps) => {
  const style: CSSProperties = {
    fontVariationSettings: filled
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
    ...(size ? { fontSize: `${size}px` } : {}),
    ...customStyle,
  };

  return (
    // O texto do ícone é a ligadura da fonte (ex.: "delete"), que leitores de
    // tela leem literalmente. Por padrão o ícone é decorativo e fica oculto para
    // tecnologia assistiva; quem precisar expô-lo pode sobrescrever via props.
    <span
      className={`material-symbols-outlined ${className}`}
      style={style}
      aria-hidden="true"
      translate="no"
      {...props}
    >
      {icon}
    </span>
  );
};

export default MaterialIcon;
