import MaterialIcon from "@/components/MaterialIcon";

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  icon?: string;
  align?: "left" | "center";
  compact?: boolean;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  align = "left",
  compact = false,
  action,
  className,
}: PageHeaderProps) {
  const centered = align === "center";

  const heading = (
    <div className={centered ? "text-center" : undefined}>
      {icon && (
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
          <MaterialIcon icon={icon} size={32} />
        </div>
      )}
      <h1
        className={`font-headline text-3xl font-bold text-primary${compact || centered ? "" : " mb-1"}`}
      >
        {title}
      </h1>
      <div
        className={
          centered
            ? "h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2"
            : compact
              ? "h-1 w-16 bg-secondary-container mt-2"
              : "h-1 w-16 bg-secondary-container mb-3"
        }
      />
      {subtitle && (
        <p
          className={`text-on-surface-variant text-sm${compact ? " mt-3" : ""}`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );

  if (!action) {
    return <div className={className}>{heading}</div>;
  }

  return (
    <div className={`flex justify-between items-start${className ? ` ${className}` : ""}`}>
      {heading}
      {action}
    </div>
  );
}
