import type { AdventureModule } from '../types/worldAtlas';

/**
 * No pre-seeded one-shots / campaigns. The app ships only the protected main
 * campaign; everything else is created by the DM via the New Campaign wizard
 * (see userCampaignStore + regionPresets). This array is intentionally empty —
 * kept so existing imports/types stay valid.
 */
export const ADVENTURE_MODULES: AdventureModule[] = [];

export function getModuleById(id: string): AdventureModule | undefined {
  return ADVENTURE_MODULES.find((m) => m.id === id);
}
