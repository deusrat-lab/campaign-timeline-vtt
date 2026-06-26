import { BATTLE_MAP_VTT_ORIGIN } from '../../config';

/**
 * Extracted from MapWorkspacePage.tsx (Etap D decomposition) — fully self-
 * contained, no closures over the page's own state, so this was a safe lift.
 * Renders a battle-map-vtt preview image (or a graceful fallback) for either
 * the small entity-card thumbnail or the larger drawer preview.
 */
export function BattleMapThumbnail({
  variant,
  title,
  size,
}: {
  variant: { url?: string; fileName?: string } | undefined;
  title: string;
  size: 'small' | 'large';
}) {
  const src = variant?.url ? `${BATTLE_MAP_VTT_ORIGIN}${variant.url}` : undefined;
  return (
    <div className={`battle-map-thumb battle-map-thumb-${size}`}>
      {src ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      ) : null}
      <div className="battle-map-thumb-fallback" style={{ display: src ? 'none' : 'flex' }}>
        🗺️ <span>Превью недоступно — запустите Battle Map VTT</span>
      </div>
    </div>
  );
}
