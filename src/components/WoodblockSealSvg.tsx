import React from 'react';

interface WoodblockSealProps {
  topText?: string;
  middleText?: string;
  bottomText?: string;
  subText?: string;
  size?: number;
  animateStamp?: boolean;
  className?: string;
}

export const WoodblockSealSvg: React.FC<WoodblockSealProps> = ({
  topText = 'LÊN NÚI',
  middleText = 'ĐẮC ĐẠO',
  bottomText = 'ẤN CHỨNG',
  subText,
  size = 116,
  animateStamp = false,
  className = '',
}) => {
  const filterId = React.useId().replace(/:/g, '');

  return (
    <div
      className={`woodblock-seal-wrapper ${animateStamp ? 'seal-stamp-anim' : ''} ${className}`}
      style={{ width: size, height: size, display: 'inline-block', position: 'relative' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 140 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Woodblock uneven cinnabar ink texture filter */}
          <filter id={`cinnabar-${filterId}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.09"
              numOctaves="3"
              seed="12"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="2.6"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
          </filter>
        </defs>

        <g filter={`url(#cinnabar-${filterId})`} transform="rotate(-5 70 70)">
          {/* Outer heavy woodblock border */}
          <rect
            x="8"
            y="8"
            width="124"
            height="124"
            rx="4"
            stroke="#9E2A2B"
            strokeWidth="6.5"
            fill="rgba(158, 42, 43, 0.11)"
          />
          {/* Inner seal hairline */}
          <rect
            x="17"
            y="17"
            width="106"
            height="106"
            rx="2"
            stroke="#9E2A2B"
            strokeWidth="2.2"
            strokeDasharray="28 3 45 2"
          />

          {/* Decorative vertical divider lines like classical Chinese/Vietnamese woodblock seals */}
          <line x1="17" y1="52" x2="123" y2="52" stroke="#9E2A2B" strokeWidth="1.6" strokeOpacity="0.7" />
          <line x1="17" y1="88" x2="123" y2="88" stroke="#9E2A2B" strokeWidth="1.6" strokeOpacity="0.7" />

          {/* Seal Inscriptions */}
          <text
            x="70"
            y="41"
            textAnchor="middle"
            fill="#9E2A2B"
            fontFamily="'Noto Serif', 'Cormorant Garamond', serif"
            fontWeight="800"
            fontSize="19"
            letterSpacing="3"
          >
            {topText}
          </text>
          <text
            x="70"
            y="76"
            textAnchor="middle"
            fill="#9E2A2B"
            fontFamily="'Noto Serif', 'Cormorant Garamond', serif"
            fontWeight="900"
            fontSize="21"
            letterSpacing="2"
          >
            {middleText}
          </text>
          <text
            x="70"
            y="111"
            textAnchor="middle"
            fill="#9E2A2B"
            fontFamily="'Noto Serif', 'Cormorant Garamond', serif"
            fontWeight="800"
            fontSize="16"
            letterSpacing="2"
          >
            {bottomText}
          </text>
          {subText && (
            <text
              x="70"
              y="121"
              textAnchor="middle"
              fill="#9E2A2B"
              fontFamily="'JetBrains Mono', monospace"
              fontWeight="700"
              fontSize="8.5"
            >
              {subText}
            </text>
          )}
        </g>
      </svg>
    </div>
  );
};
