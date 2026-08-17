type BrandBubblesProps = {
  size?: number;
};

/** The Clean Crew bubble-crew mark: one filled primary bubble, cyan and slate outlined bubbles. */
export function BrandBubbles({ size = 36 }: BrandBubblesProps) {
  return (
    <svg
      aria-hidden="true"
      className="brand-bubbles"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(3 8)">
        <g fill="none" strokeLinecap="round">
          <circle cx="65" cy="44" r="16" stroke="#64748B" strokeWidth="4.5" />
          <path d="M 57.9 36.9 A 10 10 0 0 1 72.1 36.9" stroke="#64748B" strokeWidth="3.4" />
        </g>
        <g fill="none" strokeLinecap="round">
          <circle cx="43" cy="58" r="16" stroke="#FFFFFF" strokeWidth="9" />
          <circle cx="43" cy="58" r="16" stroke="#06B6D4" strokeWidth="4.5" />
          <path d="M 35.9 50.9 A 10 10 0 0 0 35.9 65.1" stroke="#06B6D4" strokeWidth="3.4" />
        </g>
        <g strokeLinecap="round">
          <circle cx="43" cy="30" r="20" fill="none" stroke="#FFFFFF" strokeWidth="9" />
          <circle cx="43" cy="30" r="19" fill="none" stroke="#2563EB" strokeWidth="4.5" />
          <circle cx="43" cy="30" r="13.5" fill="#2563EB" />
          <path d="M 35.2 25.5 A 9 9 0 0 1 46.5 21.4" fill="none" stroke="#FFFFFF" strokeWidth="3.4" />
        </g>
      </g>
    </svg>
  );
}
