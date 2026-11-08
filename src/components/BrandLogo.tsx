import React, { useState } from 'react';

interface BrandLogoProps {
  variant?: 'full' | 'compact' | 'admin' | 'emblem';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);

  const heights = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-16',
    xl: 'h-24',
  };

  if (variant === 'compact') {
    return (
      <div
        onClick={onClick}
        className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0 ${
          onClick ? 'cursor-pointer' : ''
        } ${className}`}
      >
        {!imgError ? (
          <img
            src="/assets/aistudio/mito_logo_transparent_6cf48f46.png"
            alt="MITO"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className={`${heights[size]} w-auto object-contain`}
          />
        ) : (
          <svg viewBox="0 0 48 48" className={`${heights[size]} w-auto`} fill="none">
            <path
              d="M8 40L14 14L20 14V10H28V14L34 14L40 40H32L30 24C28 20 20 20 18 24L16 40H8Z"
              fill="#641C2B"
              stroke="#C8A66A"
              strokeWidth="2"
            />
            <polygon points="21,22 21,32 30,27" fill="#C8A66A" />
          </svg>
        )}
        <span className="font-serif-heritage font-bold tracking-wider text-[#F4F0E8] text-xl">
          MITO
        </span>
      </div>
    );
  }

  if (variant === 'admin') {
    return (
      <div className={`inline-flex items-center gap-3 select-none whitespace-nowrap shrink-0 ${className}`}>
        {!imgError ? (
          <img
            src="/assets/aistudio/mito_logo_transparent_6cf48f46.png"
            alt="MITO Admin"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-9 w-auto object-contain"
          />
        ) : null}
        <div className="flex flex-col">
          <span className="font-serif-heritage font-bold tracking-widest text-[#F4F0E8] text-lg leading-none">
            MITO
          </span>
          <span className="text-[11px] text-[#C8A66A] tracking-wider mt-0.5">
            Paneli i Administrimit
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      {!imgError ? (
        <img
          src="/assets/aistudio/mito_logo_transparent_6cf48f46.png"
          alt="MITO — Legjenda · Histori · Lojëra"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${heights[size]} w-auto object-contain drop-shadow-[0_6px_24px_rgba(100,28,43,0.45)]`}
        />
      ) : (
        <div className="flex flex-col items-center">
          <span className="font-serif-heritage text-4xl font-bold tracking-widest text-[#C8A66A]">
            MITO
          </span>
          <span className="text-xs tracking-widest text-[#F4F0E8]/80 mt-1">
            LEGJENDA · HISTORI · LOJËRA
          </span>
        </div>
      )}
    </div>
  );
};
