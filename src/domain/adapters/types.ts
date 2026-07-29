import type { CampaignSnapshot } from '../campaign/snapshot';
import type { MigrationFieldClassification, SourceMetadata } from '../campaign/source';

export interface AdapterDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  path: string;
  message: string;
}

export interface AdapterResult {
  snapshot: CampaignSnapshot | null;
  source: SourceMetadata;
  classifications: MigrationFieldClassification[];
  diagnostics: AdapterDiagnostic[];
}

export function classification(
  path: string,
  state: MigrationFieldClassification['state'],
  message?: string,
): MigrationFieldClassification {
  return { path, state, message };
}

export function adapterError(path: string, code: string, message: string): AdapterDiagnostic {
  return { severity: 'error', code, path, message };
}

export function adapterWarning(path: string, code: string, message: string): AdapterDiagnostic {
  return { severity: 'warning', code, path, message };
}

export function hasAdapterErrors(result: AdapterResult): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
