export type VisibilityLevel =
  | 'dmOnly'
  | 'hidden'
  | 'revealed'
  | 'playerSafe'
  | 'observerVisible'
  | 'public'
  | 'presented';

export interface FieldVisibility {
  field: string;
  level: VisibilityLevel;
}

export interface VisibilityState {
  level: VisibilityLevel;
  fieldOverrides?: FieldVisibility[];
  presented?: boolean;
  observerVisible?: boolean;
  reason?: string;
}

export const DM_ONLY_VISIBILITY: VisibilityState = { level: 'dmOnly' };
export const PUBLIC_VISIBILITY: VisibilityState = { level: 'public' };
export const HIDDEN_VISIBILITY: VisibilityState = { level: 'hidden' };
