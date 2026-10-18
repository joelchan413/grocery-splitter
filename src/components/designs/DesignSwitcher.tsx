'use client';

export type DesignVariant = 'anthropic' | 'taste';

export function DesignSwitcher({ design, onChange }: {
  design: DesignVariant;
  onChange: (design: DesignVariant) => void;
}) {
  return (
    <div className="design-switcher">
      <div className="design-switcher-label">Compare designs <span>Same app, two directions</span></div>
      <div role="group" aria-label="App design" className="design-switcher-options">
        <button type="button" aria-pressed={design === 'anthropic'} onClick={() => onChange('anthropic')}>
          <span>A</span> Anthropic <small>Market day</small>
        </button>
        <button type="button" aria-pressed={design === 'taste'} onClick={() => onChange('taste')}>
          <span>B</span> Taste v2 <small>Quiet instrument</small>
        </button>
      </div>
    </div>
  );
}
