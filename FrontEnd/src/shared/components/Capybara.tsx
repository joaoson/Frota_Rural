import "./Capybara.css";

export type CapybaraPose = "welcome" | "happy" | "curious" | "wink";

interface CapybaraProps {
  pose?: CapybaraPose;
  className?: string;
  label?: string;
}

export default function Capybara({ pose = "welcome", className, label }: CapybaraProps) {
  return (
    <span
      className={`frota-capybara${className ? ` ${className}` : ""}`}
      data-pose={pose}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    />
  );
}
