/**
 * Trimmed mirror of the relevant interfaces from `dm-companion/src/types/index.ts`.
 * Copied (not imported) because campaign-timeline-vtt is a fully standalone app —
 * do not point this at the dm-companion source tree.
 *
 * Only fields actually consumed by this app are kept; the original files have
 * more fields than this.
 */

export type ControlStatus =
  | 'kaldran'
  | 'auroleon'
  | 'neutral'
  | 'grey_zone'
  | 'contested';

export interface SessionScene {
  title: string;
  description: string;
}

export interface DmLocation {
  id: string;
  arcId?: string;
  name: string;
  type: string;
  region: string;
  description: string;
  atmosphere?: string;
  lore?: string;
  playerView?: string;
  rumors?: string[];
  quickScenes?: SessionScene[];
  npcs: string[];
  shops?: string[];
  quests: string[];
  dmSecrets?: string;
  images: string[];
  notes?: string;
  tags?: string[];
  controlStatus?: ControlStatus;
  aliases?: string[];
  parentLocationId?: string;
  childLocationIds?: string[];
}

export interface DmNpc {
  id: string;
  arcId?: string;
  name: string;
  race: string;
  role: string;
  location: string;
  personality?: string;
  goals?: string;
  secrets?: string;
  relatedQuests?: string[];
  image?: string;
  tags?: string[];
  /** Stage 6C.5 Phase 2G — real fields already present on every
   * dm-companion seed NPC (`public/data/dm-companion/npcs.json`), confirmed
   * directly against the raw JSON; never added to this trimmed type
   * before, so no component could read them even though `fetchJson<T>`
   * already carried them at runtime. */
  speechStyle?: string;
  knowledge?: string;
  /** Raw dm-companion "notes" field — distinct from `dmNotes` below, which
   * is a Campaign-Map-only field for NPCs created in this app. */
  notes?: string;
  /**
   * Stage 6B.1 — optional fields so existing dm-companion-sourced NPC JSON
   * needs no migration. Only populated for NPCs created via "Create NPC
   * here" in the Campaign Map Workspace (`isCustom: true`) or manually
   * edited afterward.
   */
  faction?: string;
  /** Player-safe description. Falls back to `personality` (pre-existing
   * field, already shown to both DM and players) when unset. */
  publicDescription?: string;
  /** DM-only freeform notes — what they know, what they want, relationship
   * to the party, availability/time-of-day, anything else not for player
   * eyes. Stripped by getPlayerSafeNpcs() the same way `secrets` already
   * is at every existing render site. */
  dmNotes?: string;
  /** When explicitly false, hides this NPC from players/Observer entirely
   * (absent/true means visible, matching every other visibility flag in
   * this codebase). */
  visibleToPlayers?: boolean;
  /** True for NPCs created entirely in this app (not derived from
   * dm-companion seed JSON). */
  isCustom?: boolean;
}

export type QuestStatus = 'active' | 'completed' | 'failed' | 'hidden';

export interface DmQuest {
  id: string;
  arcId?: string;
  title: string;
  image?: string;
  location: string;
  giver?: string;
  goal?: string;
  description?: string;
  enemies?: string[];
  reward?: string;
  status: QuestStatus;
  tags?: string[];
  /** Stage 6C.5 Phase 2H — confirmed against `public/data/dm-companion/
   * quests.json`: `proof` is free text, `solutions` is a string ARRAY (not
   * a single string — verified against real data, not guessed), `notes`
   * is the DM-only field rendered as "Заметки" by DM Companion's own
   * `QuestDetailPage.tsx`. */
  proof?: string;
  solutions?: string[];
  consequences?: string;
  notes?: string;
}

export interface DmAttack {
  name: string;
  toHit?: string;
  range?: string;
  damage?: string;
  description?: string;
}

export interface DmFeature {
  name: string;
  description?: string;
  damage?: string;
  condition?: string;
  recharge?: string;
}

/** Stage 6C.5 Phase 2H — extended to carry the full statblock. Confirmed
 * directly against `public/data/dm-companion/custom-enemies.json` (real
 * field names, not guessed) and against DM Companion's own
 * `pages/enemies/EnemyDetailPage.tsx`, which is the field-order/visual
 * reference for `CompanionEnemyCard`. */
export interface DmCustomEnemy {
  id: string;
  arcId?: string;
  name: string;
  role?: string;
  faction?: string;
  locationIds: string[];
  questIds: string[];
  image?: string;
  cr?: string;
  ac?: number;
  hp?: number;
  tags?: string[];
  baseMonsterId?: string;
  baseMonsterName?: string;
  baseMonsterSourceBook?: string;
  baseMonsterSourcePage?: string;
  baseMonsterCr?: string;
  customVersion?: boolean;
  isCustom?: boolean;
  lore?: string;
  xp?: number;
  hitDice?: string;
  speed?: string;
  abilityScores?: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number };
  savingThrows?: string[];
  skills?: string[];
  vulnerabilities?: string[];
  resistances?: string[];
  immunities?: string[];
  conditionImmunities?: string[];
  senses?: string;
  passivePerception?: number;
  languages?: string;
  attacks?: DmAttack[];
  features?: DmFeature[];
  reactions?: DmFeature[];
  legendaryActions?: DmFeature[];
  tactics?: string;
  dmNotes?: string;
  importedFromBestiaryAt?: string;
}

export type ImageType = 'npc' | 'location' | 'enemy' | 'item' | 'map' | 'other' | 'battle_map';

export interface DmImageItem {
  id: string;
  arcId?: string;
  title: string;
  src: string;
  thumbnailSrc?: string;
  type: ImageType;
  safeForPlayers: boolean;
  linkedQuestIds?: string[];
  linkedLocationIds?: string[];
  linkedEnemyIds?: string[];
  /** Free-form entity id this image is attached to (location/npc/enemy id) — the
   * field actually populated for most images.json entries (see loadCampaignData.ts). */
  relatedEntity?: string;
}

export interface DmTavernMenuItem {
  name: string;
  price?: string;
  description?: string;
}

export interface DmTavernRoom {
  name: string;
  price?: string;
  description?: string;
}

export interface DmTavern {
  id: string;
  name: string;
  description?: string;
  ownerNpcId?: string;
  ownerName?: string;
  staff?: string[];
  menu?: DmTavernMenuItem[];
  rooms?: DmTavernRoom[];
  services?: string[];
  rumors?: string[];
  relatedNpcs?: string[];
  relatedQuests?: string[];
  relatedImages?: string[];
  /** dm-companion location id this tavern sits inside. */
  location: string;
  atmosphere?: string;
  notes?: string;
  tags?: string[];
  /** Stage 6C.4D — DM-chosen images.json id shown for this tavern's card/
   * preview. The source model has no native image field (taverns rely on
   * `relatedImages` matching instead); this is a card-view-only override,
   * never written by the seed loader, only ever set via tavernPatches. */
  imageOverrideId?: string;
}

export interface DmFaction {
  id: string;
  name: string;
  subtype?: string;
  description?: string;
}

/** economy.json — lore/reference text about the economy, not a price list. */
export interface DmEconomyEntry {
  id: string;
  title: string;
  category: string;
  text: string;
  prices?: string;
  wages?: string;
  goods?: string;
  tags?: string[];
  sourceDraftId?: string;
}

/** economy-reference.json — the real priced-goods list (700 entries). */
export interface DmEconomyReferenceItem {
  id: string;
  category: string;
  name: string;
  price: string | number;
  currency: string;
  availability?: string;
  quality?: string;
  source?: string;
  notes?: string;
}

export interface DmLaw {
  id: string;
  title: string;
  category: string;
  text: string;
  crimes?: string[];
  punishments?: string[];
  notes?: string;
  tags?: string[];
  sourceDraftId?: string;
}

/** shops.json — items are already structured with prices (not bare strings). */
export interface DmShopItem {
  id: string;
  name: string;
  category?: string;
  price?: string | number;
  currency?: string;
  description?: string;
  availability?: string;
  quality?: string;
  notes?: string;
  priceSource?: string;
}

export interface DmShop {
  id: string;
  name: string;
  type?: string;
  /** dm-companion location id this shop sits inside — exact link, use directly. */
  location: string;
  ownerNpcId?: string;
  description?: string;
  image?: string;
  services?: string[];
  items?: DmShopItem[];
  notes?: string;
  tags?: string[];
  relationToPlayers?: string;
  discounts?: string;
  rumors?: string[];
}

export const ARC_1_ID = 'arc-1';
export const ARC_2_ID = 'arc-2';
