/**
 * Neutral entity view-models for shared, campaign-agnostic UI.
 *
 * These types carry ONLY presentational data + callbacks. Shared components
 * (EntityImage, RichEntityLibrary, RichEntityDetail, …) never read any
 * campaign store, localStorage, arc, or Greyholm-specific data — each campaign
 * maps its own data into these shapes and passes them as props. This is the
 * "single UI contract, per-campaign data" boundary: the main campaign will
 * later provide its own mapper (Phase 7), while new campaigns provide theirs
 * now (userCampaignEntityVM.ts).
 */

export type EntityKind = 'location' | 'npc' | 'quest' | 'enemy' | 'faction' | 'party' | 'image';

export interface EntityRelationLink {
  id: string;
  label: string;
  onOpen?: () => void;
}

export interface EntityRelationSection {
  key: string;
  label: string;
  items: EntityRelationLink[];
  /** DM-only: place a related entity on the map. */
  onAdd?: () => void;
  addLabel?: string;
}

export interface EntityCounter {
  key: string;
  label: string;
  value: number | string;
}

export interface EntityField {
  label: string;
  value: string;
}

/** Rich detail (right panel / modal). */
export interface EntityDetailVM {
  id: string;
  kind: EntityKind;
  kindLabel: string;
  title: string;
  subtitle?: string;      // role / type / status line
  imageUrl?: string;
  description?: string;
  /** DM-only fields — the shared component hides these in player mode. */
  dmNotes?: string;
  tags?: string[];
  fields?: EntityField[]; // AC / HP / Раса / Регион …
  counters?: EntityCounter[];
  relations?: EntityRelationSection[];
}

/** Compact row for the library list. */
export interface EntityListItemVM {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  placed?: boolean;
  revealed?: boolean;
}

/** Actions available on a selected entity (all optional; hidden when absent). */
export interface EntityActionsVM {
  onEdit?: () => void;
  onPlace?: () => void;      // place on map
  onToggleReveal?: () => void;
  revealed?: boolean;
  placed?: boolean;
  onDelete?: () => void;
}

export interface FilterConfig {
  key: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}
