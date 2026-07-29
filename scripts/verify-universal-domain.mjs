import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'src/domain/campaign/ids.ts',
  'src/domain/campaign/capabilities.ts',
  'src/domain/campaign/snapshot.ts',
  'src/domain/entities/types.ts',
  'src/domain/maps/types.ts',
  'src/domain/battles/types.ts',
  'src/domain/visibility/types.ts',
  'src/domain/persistence/serialization.ts',
  'src/domain/validation/validateCampaignSnapshot.ts',
  'src/domain/index.ts',
];

const requiredTerms = [
  'CampaignSnapshot',
  'CampaignDurableData',
  'CampaignRuntime',
  'CampaignCapabilities',
  'VisibilityState',
  'BattleRuntime',
  'UniversalEntity',
  'serializeCampaignSnapshot',
  'validateCampaignSnapshot',
];

const combined = requiredFiles.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
const missingTerms = requiredTerms.filter((term) => !combined.includes(term));
const anyMatches = combined.match(/\bany\b/g) ?? [];
const reactMatches = combined.match(/from ['"]react['"]/g) ?? [];

if (missingTerms.length > 0) {
  console.error(`Missing required domain terms: ${missingTerms.join(', ')}`);
  process.exit(1);
}

if (anyMatches.length > 0) {
  console.error('Universal domain must not use any.');
  process.exit(1);
}

if (reactMatches.length > 0) {
  console.error('Universal domain must not depend on React.');
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  files: requiredFiles.length,
  requiredTerms: requiredTerms.length,
  anyCount: anyMatches.length,
  reactImports: reactMatches.length,
}));
