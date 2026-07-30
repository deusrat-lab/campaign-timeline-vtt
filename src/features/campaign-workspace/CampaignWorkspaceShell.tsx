import type { ReactNode } from 'react';
import type {
  CampaignWorkspaceDescriptor,
  CampaignWorkspaceModuleSlot,
} from '../../domain';
import './campaignWorkspaceShell.css';

/**
 * Stage 12 — the ONE shared Campaign Workspace shell used by BOTH legacy stacks
 * (Greyholm entity library + user-campaign library). It is a pure composition /
 * layout layer:
 *   - it renders campaign identity (from the descriptor) + an optional legacy
 *     identity/header region supplied by the host (so visual parity is exact);
 *   - a shared navigation view model (audience-filtered upstream in the builder);
 *   - a non-secret status region;
 *   - ordered module slots — the host supplies the render node per slot id via
 *     `slotContent`, and the shell mounts ONLY the slots present in the
 *     descriptor (already audience/kind filtered in buildCampaignWorkspaceDescriptor).
 *
 * The shell owns NO store, NO snapshot, NO write handler. A legacy-owned slot
 * (e.g. the entity-library body) is mounted verbatim as a slot child; the shell
 * never routes its writes anywhere. Because privacy is applied in the descriptor
 * builder, a DM-only slot is simply absent from a player descriptor — the shell
 * cannot mount it even by mistake.
 */
export function CampaignWorkspaceShell({
  descriptor,
  legacyHeader,
  slotContent,
}: {
  descriptor: CampaignWorkspaceDescriptor;
  /** Host-supplied legacy identity/header region, rendered for exact parity. */
  legacyHeader?: ReactNode;
  /** Render node per composed module slot, keyed by moduleId. */
  slotContent: Partial<Record<CampaignWorkspaceModuleSlot['moduleId'], ReactNode>>;
}) {
  return (
    <div
      className="cws-shell"
      data-campaign-kind={descriptor.campaignKind}
      data-audience={descriptor.audience}
      data-campaign-id={descriptor.campaignId}
    >
      <header className="cws-header">
        {legacyHeader ?? (
          <div className="cws-identity">
            <h1>{descriptor.title}</h1>
            {descriptor.subtitle && <p className="muted">{descriptor.subtitle}</p>}
          </div>
        )}
      </header>

      {descriptor.navigationItems.length > 0 && (
        <nav className="cws-nav" aria-label="Навигация кампании">
          {descriptor.navigationItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.path}`}
              className={`cws-nav-item${item.active ? ' cws-nav-item--active' : ''}`}
              data-nav-id={item.id}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}

      <div className="cws-status" data-fallback={descriptor.status.usingLegacyFallback ? '1' : '0'}>
        <span className={`cws-status-dot${descriptor.status.hydrated ? ' cws-status-dot--ready' : ''}`} />
        <span className="cws-status-text">
          {descriptor.status.hydrated ? 'Кампания загружена' : 'Загрузка…'}
          {descriptor.status.usingLegacyFallback ? ' · legacy fallback' : ''}
          {descriptor.status.note ? ` · ${descriptor.status.note}` : ''}
        </span>
      </div>

      <div className="cws-modules">
        {descriptor.moduleSlots.map((slot) => {
          const content = slotContent[slot.moduleId];
          if (content == null) return null;
          return (
            <section
              key={slot.moduleId}
              className={`cws-slot cws-slot--${slot.classification}`}
              data-module-id={slot.moduleId}
              data-classification={slot.classification}
              data-write-owner={slot.writeOwner ?? ''}
            >
              {content}
            </section>
          );
        })}
      </div>
    </div>
  );
}
