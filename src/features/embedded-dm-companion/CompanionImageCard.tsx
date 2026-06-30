import { useState } from 'react';
import type { DmImageItem } from '../../types/dmCompanion';
import { ImageLightbox } from './ImageLightbox';
import { CompanionLinkRow } from './CompanionLinkRow';

/**
 * NEW component, not a port — dm-companion has no `ImageDetailPage.tsx`;
 * images there are only ever viewed through the `ImageLightbox` overlay
 * launched from gallery grids on other entities' detail pages. There is
 * therefore no source "detail page" field order to follow here. This
 * renders the same metadata dm-companion's gallery views show alongside an
 * image (title, type, DM-only/safeForPlayers flag, linked entities) plus
 * the full lightbox for the image itself, as the entity card for
 * `{type:'image', id}` inside the embedded companion host.
 */
export function CompanionImageCard({
  image,
  locationName,
  npcName,
  enemyName,
  questItems,
  onOpenLocation,
  onOpenNpc,
  onOpenEnemy,
  onOpenQuest,
}: {
  image: DmImageItem;
  locationName?: string;
  npcName?: string;
  enemyName?: string;
  questItems?: { id: string; label: string; subtitle?: string; imageSrc?: string }[];
  onOpenLocation?: () => void;
  onOpenNpc?: () => void;
  onOpenEnemy?: () => void;
  onOpenQuest?: (id: string) => void;
}) {
  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{image.title}</h3>
        <span className="muted">
          {image.type}
          {image.safeForPlayers === false ? ' · DM-ONLY' : ''}
        </span>
      </div>
      <div className="companion-image-card-preview">
        <img src={image.thumbnailSrc ?? image.src} alt={image.title} className="companion-source-hero" />
      </div>
      <ImageLightboxLauncher image={image} />
      {locationName && (
        <>
          <h4>Локация</h4>
          {onOpenLocation ? (
            <CompanionLinkRow items={[{ id: 'location', label: locationName }]} onOpen={() => onOpenLocation()} />
          ) : (
            <p>{locationName}</p>
          )}
        </>
      )}
      {npcName && (
        <>
          <h4>NPC</h4>
          {onOpenNpc ? (
            <CompanionLinkRow items={[{ id: 'npc', label: npcName }]} onOpen={() => onOpenNpc()} />
          ) : (
            <p>{npcName}</p>
          )}
        </>
      )}
      {enemyName && (
        <>
          <h4>Враг</h4>
          {onOpenEnemy ? (
            <CompanionLinkRow items={[{ id: 'enemy', label: enemyName }]} onOpen={() => onOpenEnemy()} />
          ) : (
            <p>{enemyName}</p>
          )}
        </>
      )}
      {!!questItems?.length && (
        <>
          <h4>Связанные квесты</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((item) => item.label).join(', ')}</p>}
        </>
      )}
    </div>
  );
}

/** Small inline launcher so the card itself stays a plain card (no overlay
 * open by default) but offers a one-click full lightbox view, matching how
 * dm-companion always shows a thumbnail/grid first and opens the lightbox
 * on click rather than rendering it inline. */
function ImageLightboxLauncher({ image }: { image: DmImageItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost btn-compact" onClick={() => setOpen(true)}>
        Открыть в полном размере
      </button>
      {open && <ImageLightbox image={image} onClose={() => setOpen(false)} />}
    </>
  );
}
