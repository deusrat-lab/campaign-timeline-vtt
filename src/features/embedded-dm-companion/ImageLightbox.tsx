import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import type { DmImageItem } from '../../types/dmCompanion';
import './ImageLightbox.css';

/**
 * Ported/adapted from dm-companion/src/components/ImageLightbox.tsx.
 *
 * This is the NEW "Image" detail view called out in the task spec: dm-companion
 * itself has no detail *page* for images (only this lightbox overlay, opened
 * from gallery grids), so there is no `ImageDetailPage.tsx` to port field
 * order from. This component IS effectively that missing detail view —
 * image viewing in this app's embedded companion host.
 *
 * Adaptations from the source:
 * - Dropped `useOverlayBack` (dm-companion's Android hardware-back-button
 *   integration via Capacitor) — campaign-timeline-vtt is a plain web app
 *   with no native shell, so there's no hardware back button to intercept.
 *   Escape-to-close is preserved via a plain keydown listener, and the
 *   embedded host's own Escape handling (EmbeddedCompanionWindow) still
 *   applies a layer up.
 * - Replaced `shareImage()` (dm-companion's Capacitor-native-file-share +
 *   mobile Web Share API helper, which requires `@capacitor/share`/
 *   `@capacitor/filesystem`, not dependencies of this app) with a plain
 *   browser-only "fetch as blob -> Web Share API if available, otherwise
 *   download fallback" path. Behavior on desktop (the primary target here,
 *   since this is a DM tool run in a browser) is identical either way:
 *   the download/"open in new tab" fallback.
 * - Typed against this app's `DmImageItem` (src/types/dmCompanion.ts)
 *   instead of dm-companion's own `ImageItem`.
 */
type LightboxImage = Pick<DmImageItem, 'src' | 'title'> & Partial<DmImageItem>;

interface ImageLightboxProps {
  image: LightboxImage | null;
  onClose: () => void;
  /** Optional gallery of images for swipe/arrow navigation (e.g. all images linked
   * to the same location/NPC/quest/enemy). */
  images?: LightboxImage[];
  onNavigate?: (image: LightboxImage) => void;
}

async function fetchAsBlob(src: string): Promise<Blob> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Не удалось загрузить изображение (${res.status})`);
  return res.blob();
}

function guessExtension(blob: Blob, src: string): string {
  const fromType = blob.type.split('/')[1];
  if (fromType) return fromType.replace('jpeg', 'jpg');
  const match = /\.([a-z0-9]+)(?:\?|$)/i.exec(src);
  return match ? match[1].toLowerCase() : 'jpg';
}

export function ImageLightbox({ image, onClose, images, onNavigate }: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  const [shareStatus, setShareStatus] = useState<{ blobUrl: string; fileName: string } | null>(null);
  const [shareError, setShareError] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!image) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient UI state when a new image opens, matching dm-companion source
    setZoomed(false);
    setShareStatus(null);
    setShareError(false);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [image, onClose]);

  useEffect(() => {
    return () => {
      if (shareStatus) URL.revokeObjectURL(shareStatus.blobUrl);
    };
  }, [shareStatus]);

  if (!image) return null;

  const gallery = images && images.length > 1 ? images : null;
  const currentIndex = gallery ? gallery.findIndex((img) => img.src === image.src) : -1;

  function goTo(delta: number) {
    if (!gallery || currentIndex < 0 || !onNavigate) return;
    const next = (currentIndex + delta + gallery.length) % gallery.length;
    setZoomed(false);
    setShareStatus(null);
    onNavigate(gallery[next]);
  }

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null || zoomed) {
      touchStartX.current = null;
      return;
    }
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 50) {
      goTo(dx > 0 ? -1 : 1);
    }
  }

  async function handleShare() {
    setShareError(false);
    const title = image!.title ?? 'image';
    try {
      const blob = await fetchAsBlob(image!.src);
      const ext = guessExtension(blob, image!.src);
      const fileName = `${title.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]+/g, '_').slice(0, 60) || 'image'}.${ext}`;
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title, text: title });
            return;
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            // fall through to download fallback
          }
        }
      }
      const blobUrl = URL.createObjectURL(blob);
      setShareStatus({ blobUrl, fileName });
    } catch {
      setShareError(true);
    }
  }

  return (
    <div className="image-lightbox" onClick={onClose}>
      <div className="image-lightbox__content" onClick={(e) => e.stopPropagation()}>
        <button className="image-lightbox__close" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
        {gallery && (
          <>
            <button className="image-lightbox__nav image-lightbox__nav--prev" onClick={() => goTo(-1)} aria-label="Предыдущее изображение">
              ‹
            </button>
            <button className="image-lightbox__nav image-lightbox__nav--next" onClick={() => goTo(1)} aria-label="Следующее изображение">
              ›
            </button>
          </>
        )}
        <div
          className={`image-lightbox__viewport ${zoomed ? 'image-lightbox__viewport--zoomed' : ''}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onDoubleClick={() => setZoomed((z) => !z)}
        >
          <img src={image.src} alt={image.title} />
        </div>
        {image.title && <h3 className="image-lightbox__title">{image.title}</h3>}
        {image.type && (
          <p className="image-lightbox__counter">
            {image.type}
            {image.safeForPlayers === false ? ' · DM-ONLY' : ''}
          </p>
        )}
        {gallery && currentIndex >= 0 && (
          <p className="image-lightbox__counter">
            {currentIndex + 1} / {gallery.length}
          </p>
        )}
        <div className="image-lightbox__actions">
          <button className="btn btn--small" onClick={handleShare}>
            Отправить
          </button>
          {shareStatus && (
            <>
              <a className="btn btn--small" href={shareStatus.blobUrl} download={shareStatus.fileName}>
                Скачать
              </a>
              <a className="btn btn--small" href={image.src} target="_blank" rel="noreferrer">
                Открыть изображение
              </a>
            </>
          )}
        </div>
        {shareStatus && (
          <p className="image-lightbox__hint">После открытия изображения можно отправить его в Telegram вручную.</p>
        )}
        {shareError && <p className="image-lightbox__hint">Не удалось отправить изображение.</p>}
        <p className="image-lightbox__hint image-lightbox__hint--muted">
          Двойной клик — увеличить/уменьшить{gallery ? ', свайп — следующая карточка' : ''}.
        </p>
      </div>
    </div>
  );
}
