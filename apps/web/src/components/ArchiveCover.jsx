import { useState } from 'react';
import { coverUrl } from '../api.js';
import { paletteFor, hashString } from '../utils.js';

export function ContourArt({ seed = '', title = '', className = '' }) {
  const [light, mid, accent] = paletteFor(seed);
  const variant = hashString(seed) % 3;
  const curves = [
    'M-20 250 C 110 214, 170 292, 300 250 S 500 198, 640 242',
    'M-20 292 C 100 256, 190 330, 320 288 S 510 238, 640 280',
    'M-20 334 C 120 300, 210 370, 350 326 S 540 280, 640 322',
    'M-20 376 C 130 344, 230 408, 380 364 S 560 322, 640 360',
  ];
  return (
    <div
      className={`contour-art ${className}`.trim()}
      style={{
        '--art-light': light,
        '--art-mid': mid,
        '--art-accent': accent,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 620 420" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`art-bg-${variant}-${hashString(seed)}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="0.65" stopColor={mid} />
            <stop offset="1" stopColor={light} />
          </linearGradient>
          <radialGradient id={`art-sun-${hashString(seed)}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={accent} stopOpacity="0.9" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="620" height="420" fill={`url(#art-bg-${variant}-${hashString(seed)})`} />
        <circle cx="470" cy="126" r="118" fill={`url(#art-sun-${hashString(seed)})`} />
        <circle cx="470" cy="126" r="26" fill={accent} opacity="0.75" />
        {curves.map((d, index) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#eaf5f1"
            strokeOpacity={0.16 - index * 0.022}
            strokeWidth={index === 0 ? 1.6 : 1.1}
          />
        ))}
        <g opacity="0.16" stroke="#eaf5f1" strokeWidth="0.8" fill="none">
          <path d="M60 0 C 70 90, 150 120, 140 210 S 80 330, 120 420" />
          <path d="M560 0 C 545 96, 485 130, 500 220 S 555 344, 530 420" />
        </g>
      </svg>
      <span className="contour-initial">{String(title || '·').slice(0, 1)}</span>
    </div>
  );
}

export default function ArchiveCover({ archive, path, alt, className = '', priority = false }) {
  const [failed, setFailed] = useState(false);
  const source = path ? coverUrl(archive.slug, path) : null;
  if (!source || failed) {
    return (
      <ContourArt
        seed={archive.slug || archive.title || ''}
        title={archive.title || ''}
        className={className}
      />
    );
  }
  return (
    <img
      src={source}
      alt={alt || `Cover of ${archive.title}`}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
