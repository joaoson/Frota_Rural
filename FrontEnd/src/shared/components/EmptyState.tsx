import MaterialIcon from "@/components/MaterialIcon";

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "card" | "bare";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "card",
  className,
}: EmptyStateProps) {
  const content = (
    <>
      <div className="bg-surface-container w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
        <MaterialIcon icon={icon} size={32} className="text-primary" />
      </div>
      <h3 className="text-xl font-bold text-on-surface mb-2">{title}</h3>
      {description && (
        <p className="text-on-surface-variant text-sm max-w-sm mx-auto">{description}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </>
  );

  if (variant === "bare") {
    return <div className={`text-center${className ? ` ${className}` : ""}`}>{content}</div>;
  }

  return (
    <div
      className={`text-center py-20 bg-surface-container-lowest rounded-2xl border border-outline-variant/30${
        className ? ` ${className}` : ""
      }`}
    >
      {content}
    </div>
  );
}
