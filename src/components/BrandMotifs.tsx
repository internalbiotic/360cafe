import React, { useState } from 'react';

interface CafeLogoProps {
  variant?: 'purple' | 'white';
  className?: string;
  logoUrl?: string;
  name?: string;
}

export const CafeLogo: React.FC<CafeLogoProps> = ({
  variant = 'purple',
  className = 'h-10 w-auto',
  logoUrl = '/360-logo.png',
  name = '360 Café',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed || !logoUrl) {
    return (
      <span
        className={`inline-flex items-center gap-2 font-display font-black tracking-tight ${
          variant === 'white' ? 'text-white' : 'text-[#947ABD]'
        } ${className}`}
      >
        <svg viewBox="0 0 40 40" className="h-full w-auto" fill="none" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r="17"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeDasharray="82 14"
            strokeLinecap="round"
          />
          <text
            x="20"
            y="24"
            textAnchor="middle"
            fill="currentColor"
            fontSize="12"
            fontWeight="800"
            fontFamily="Outfit, sans-serif"
          >
            360
          </text>
        </svg>
        <span className="text-xl uppercase tracking-tight">{name}</span>
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${className} object-contain select-none ${
        variant === 'white' ? 'brightness-0 invert' : ''
      }`}
    />
  );
};

/** Repeating circular pattern band inspired by 360 Café graphic identity */
export const CircularPatternStrip: React.FC<{
  fill?: string;
  bg?: string;
  flip?: boolean;
}> = ({ fill = '#947ABD', bg = '#FFFFFF', flip = false }) => {
  return (
    <div
      className={`w-full overflow-hidden leading-none select-none ${
        flip ? 'rotate-180' : ''
      }`}
      style={{ backgroundColor: bg }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1200 36"
        preserveAspectRatio="none"
        className="w-full h-6 md:h-8 block"
      >
        <defs>
          <pattern
            id={`circle-scallop-${fill.replace('#', '')}-${flip ? 'f' : 'n'}`}
            width="48"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="24" cy="36" r="22" fill={fill} />
          </pattern>
        </defs>
        <rect
          width="1200"
          height="36"
          fill={`url(#circle-scallop-${fill.replace('#', '')}-${flip ? 'f' : 'n'})`}
        />
      </svg>
    </div>
  );
};

/** Hand-drawn white line-art café illustrations (coffee cup, iced drink, croissant) */
export const CafeLineArtCup: React.FC<{ className?: string }> = ({
  className = 'w-20 h-20 text-white/25',
}) => (
  <svg
    viewBox="0 0 96 96"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M24 38h40v24a18 18 0 0 1-18 18h-4a18 18 0 0 1-18-18V38Z" />
    <path d="M64 44h8a8 8 0 0 1 0 16h-8" />
    <path d="M18 82h52" />
    <path d="M35 28c0-6 5-7 5-13" />
    <path d="M46 26c0-5 5-7 5-12" />
    <path d="M56 28c0-5 4-7 4-11" />
  </svg>
);

export const CafeLineArtIced: React.FC<{ className?: string }> = ({
  className = 'w-20 h-20 text-white/25',
}) => (
  <svg
    viewBox="0 0 96 96"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M30 34h36l-5 48H35L30 34Z" />
    <path d="M27 34c0-10 9-16 21-16s21 6 21 16" />
    <path d="M52 10l-7 32" />
    <rect x="39" y="45" width="10" height="10" rx="2" transform="rotate(12 39 45)" />
    <rect x="47" y="59" width="10" height="10" rx="2" transform="rotate(-14 47 59)" />
  </svg>
);

export const CafeLineArtCroissant: React.FC<{ className?: string }> = ({
  className = 'w-20 h-20 text-white/25',
}) => (
  <svg
    viewBox="0 0 96 96"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M18 56c-4-12 6-26 30-26s34 14 30 26c-3 8-12 10-18 5-6 4-18 4-24 0-6 5-15 3-18-5Z" />
    <path d="M36 33l4 28" />
    <path d="M60 33l-4 28" />
    <path d="M25 41l7 18" />
    <path d="M71 41l-7 18" />
  </svg>
);
