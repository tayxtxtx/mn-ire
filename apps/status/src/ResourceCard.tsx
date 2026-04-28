import type { ResourceStatus } from './types.js';
import { deriveCardConfig } from './types.js';

interface Props {
  resource: ResourceStatus;
  apiDown:  boolean;
}

export default function ResourceCard({ resource, apiDown }: Props) {
  const cfg = deriveCardConfig(resource, apiDown);

  return (
    <div
      style={{
        background:    cfg.background,
        color:         cfg.foreground,
        borderRadius:  '0.25rem',
        padding:       'clamp(1.5rem, 3vw, 3rem)',
        display:       'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight:     '12rem',
        transition:    'background 0.4s ease, color 0.4s ease',
      }}
    >
      {/* Resource name */}
      <div
        style={{
          fontSize:   'clamp(0.75rem, 1.5vw, 1rem)',
          fontWeight: 400,
          opacity:    0.85,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {resource.name}
      </div>

      {/* State headline */}
      <div
        style={{
          fontSize:   'clamp(1.5rem, 3.5vw, 2.75rem)',
          fontWeight: 700,
          lineHeight: 1.1,
          marginTop:  '1rem',
        }}
      >
        {cfg.headline}
      </div>

      {/* Sub-line (time remaining / starts in) */}
      {cfg.subline && (
        <div
          style={{
            fontSize:   'clamp(1rem, 2vw, 1.5rem)',
            fontWeight: 400,
            marginTop:  '0.5rem',
            opacity:    0.9,
          }}
        >
          {cfg.subline}
        </div>
      )}
    </div>
  );
}
