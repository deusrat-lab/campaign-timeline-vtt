/**
 * Shared clickable-chip row used by every ported entity card in this
 * directory to render a linked-entity list (NPCs/quests/enemies/locations/
 * shops) as individually clickable chips that call `onOpen`, instead of
 * plain joined text. Moved out of MapWorkspacePage.tsx unchanged as part of
 * porting the real dm-companion components into this dedicated feature
 * directory (see ../../pages/MapWorkspacePage.tsx for the call sites that
 * now import this instead of defining it locally).
 */
export function CompanionLinkRow({
  items,
  onOpen,
}: {
  items: { id: string; label: string }[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="companion-link-row">
      {items.map((item) => (
        <button key={item.id} type="button" className="companion-link-chip" onClick={() => onOpen(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
