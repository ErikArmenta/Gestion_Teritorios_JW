// Icono de exhibidor (anaquel de publicaciones: cartel arriba, repisas con folletos y patas).
// Misma API que los iconos de lucide-react para poder usarlo en su lugar.

const ExhibidorIcon = ({ size = 24, color = 'currentColor', strokeWidth = 2, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <rect x="6" y="2" width="12" height="18" rx="1.5" />
    <path d="M9 5.5h6" />
    <path d="M6 9h12" />
    <path d="M6 13.5h12" />
    <path d="M9 11.25h2M13 11.25h2" />
    <path d="M9 15.75h2M13 15.75h2" />
    <path d="M8.5 20v2M15.5 20v2" />
  </svg>
);

export default ExhibidorIcon;
