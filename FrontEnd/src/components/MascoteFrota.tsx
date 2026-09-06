import type { SVGProps } from "react";

interface MascoteFrotaProps extends Omit<SVGProps<SVGSVGElement>, "viewBox"> {
  size?: number;
  /** Cor do disco de fundo. Use "transparent" para recortar o mascote. */
  bgColor?: string;
  title?: string;
}

const CREME = "#FFFAEB";
const AMBAR = "#FEB734";
const VERDE = "#0A3701";

const MascoteFrota = ({
  size = 96,
  bgColor = VERDE,
  title = "Mascote Frota Rural",
  ...props
}: MascoteFrotaProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    role="img"
    aria-label={title}
    {...props}
  >
    <defs>
      <clipPath id="mascote-frota-badge">
        <circle cx="100" cy="100" r="100" />
      </clipPath>
    </defs>
    <g clipPath="url(#mascote-frota-badge)">
      <circle cx="100" cy="100" r="100" fill={bgColor} />

      {/* corpo */}
      <rect x="50" y="134" width="100" height="80" rx="36" fill={CREME} />
      {/* lenço no pescoço */}
      <path d="M74 134 H126 Q126 158 100 166 Q74 158 74 134 Z" fill={AMBAR} />

      {/* orelhas */}
      <circle cx="56" cy="102" r="10" fill={CREME} />
      <circle cx="144" cy="102" r="10" fill={CREME} />

      {/* rosto */}
      <rect x="58" y="58" width="84" height="82" rx="40" fill={CREME} />

      {/* chapéu */}
      <path d="M70 68 V48 Q70 26 100 26 Q130 26 130 48 V68 Z" fill={AMBAR} />
      <rect x="69" y="45" width="62" height="11" rx="5.5" fill={VERDE} />
      <ellipse cx="100" cy="70" rx="66" ry="13" fill={AMBAR} />

      {/* olhos */}
      <circle cx="86" cy="98" r="6.5" fill={VERDE} />
      <circle cx="114" cy="98" r="6.5" fill={VERDE} />
      {/* bochechas */}
      <circle cx="70" cy="110" r="7" fill={AMBAR} />
      <circle cx="130" cy="110" r="7" fill={AMBAR} />
      {/* sorriso */}
      <path
        d="M89 113 Q100 124 111 113"
        fill="none"
        stroke={VERDE}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

export default MascoteFrota;
