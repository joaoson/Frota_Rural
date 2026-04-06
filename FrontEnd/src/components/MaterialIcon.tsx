import type { CSSProperties } from "react";

interface MaterialIconProps {
  icon: string;
  className?: string;
  filled?: boolean;
  size?: number;
}

const MaterialIcon = ({ icon, className = "", filled = false, size }: MaterialIconProps) => {
  const style: CSSProperties = {
    fontVariationSettings: filled
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
    ...(size ? { fontSize: `${size}px` } : {}),
  };

  return (
    <span className={`material-symbols-outlined ${className}`} style={style}>
      {icon}
    </span>
  );
};

export default MaterialIcon;
