export type CampaignSourceKind =
  | 'legacy-main'
  | 'legacy-user-campaign'
  | 'dm-companion'
  | 'battle-map-vtt'
  | 'universal'
  | 'synthetic';

export interface SourceMetadata {
  kind: CampaignSourceKind;
  sourceId?: string;
  path?: string;
  sha256?: string;
  schemaVersion?: string;
  importedAt?: string;
}

export interface MigrationFieldClassification {
  path: string;
  state: 'mapped' | 'normalized' | 'preservedAsExtension' | 'unsupported' | 'invalid' | 'ambiguous' | 'dropped';
  message?: string;
}

export interface MigrationMetadata {
  source: SourceMetadata;
  migratedAt: string;
  adapterVersion: string;
  dryRun: boolean;
  aliases: Record<string, string>;
  fieldClassifications: MigrationFieldClassification[];
}
