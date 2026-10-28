import MaterialIcon from "@/components/MaterialIcon";

type ButtonSize = "sm" | "md" | "lg";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-5 py-2.5 text-sm",
  md: "py-3.5",
  lg: "py-4 text-base",
};

const RESPONSIVE_SIZE = "py-3.5 sm:py-4 text-base";

interface GradientButtonProps extends React.ComponentProps<"button"> {
  size?: ButtonSize;
  responsive?: boolean;
  fullWidth?: boolean;
  icon?: string;
  pending?: boolean;
  pendingLabel?: string;
}

export function GradientButton({
  size = "md",
  responsive = false,
  fullWidth = true,
  icon,
  pending = false,
  pendingLabel = "Carregando...",
  children,
  className,
  disabled,
  ...buttonProps
}: GradientButtonProps) {
  const dimensions = responsive ? RESPONSIVE_SIZE : SIZES[size];

  return (
    <button
      {...buttonProps}
      disabled={disabled ?? pending}
      className={`${fullWidth ? "w-full " : ""}bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold ${dimensions} rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed${
        className ? ` ${className}` : ""
      }`}
    >
      {pending ? (
        pendingLabel
      ) : (
        <>
          {icon && <MaterialIcon icon={icon} size={20} />} {children}
        </>
      )}
    </button>
  );
}
