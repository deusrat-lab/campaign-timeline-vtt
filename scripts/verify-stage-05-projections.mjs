import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const outDir = resolve(root, 'rebuild-reports/stage-05');
const requiredFiles = [
  'src/domain/projection/types.ts',
  'src/domain/projection/projectCampaign.ts',
  'src/pages/UniversalDiagnosticsPage.tsx',
  'src/config.ts',
  'src/App.tsx',
];

const fileText = new Map(requiredFiles.map((file) => [file, readFileSync(resolve(root, file), 'utf8')]));
const projectionText = `${fileText.get('src/domain/projection/types.ts')}\n${fileText.get('src/domain/projection/projectCampaign.ts')}`;
const diagnosticsPage = fileText.get('src/pages/UniversalDiagnosticsPage.tsx') ?? '';
const config = fileText.get('src/config.ts') ?? '';
const app = fileText.get('src/App.tsx') ?? '';

const checks = [
  {
    name: 'pure projection has no React dependency',
    ok: !/from ['"]react['"]/.test(projectionText) && !/\.tsx\b/.test(projectionText),
  },
  {
    name: 'pure projection has no storage or network side effects',
    ok: !/\blocalStorage\b|\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(projectionText),
  },
  {
    name: 'DM workspace projection exists',
    ok: /projectDMWorkspace/.test(projectionText) && /DMWorkspaceProjection/.test(projectionText),
  },
  {
    name: 'map projection exists',
    ok: /projectMap/.test(projectionText) && /MapProjection/.test(projectionText),
  },
  {
    name: 'entity card projection exists',
    ok: /EntityCardProjection/.test(projectionText) && /entityCard/.test(projectionText),
  },
  {
    name: 'timeline projection exists',
    ok: /projectTimeline/.test(projectionText) && /TimelineProjection/.test(projectionText),
  },
  {
    name: 'travel projection exists',
    ok: /projectTravel/.test(projectionText) && /TravelProjection/.test(projectionText),
  },
  {
    name: 'battle projection exists',
    ok: /projectBattles/.test(projectionText) && /BattleProjection/.test(projectionText),
  },
  {
    name: 'player-safe projection exists',
    ok: /projectPlayerSafe/.test(projectionText) && /PlayerSafeProjection/.test(projectionText),
  },
  {
    name: 'observer projection exists',
    ok: /projectObserver/.test(projectionText) && /ObserverProjection/.test(projectionText),
  },
  {
    name: 'player-safe projection does not expose DM-only notes',
    ok: /includeDm/.test(projectionText) &&
      /\? maybeText\.publicDescription \?\? maybeText\.playerSafeDescription \?\? maybeText\.dmNotes/.test(projectionText) &&
      /: maybeText\.playerSafeDescription \?\? maybeText\.publicDescription/.test(projectionText),
  },
  {
    name: 'diagnostics feature flag is present',
    ok: /VITE_UNIVERSAL_DIAGNOSTICS/.test(config) && /UNIVERSAL_DIAGNOSTICS_ENABLED/.test(diagnosticsPage),
  },
  {
    name: 'diagnostics route is guarded as DM-only',
    ok: /path="\/diagnostics\/universal"/.test(app) && /DmOnlyRoute><UniversalDiagnosticsPage/.test(app),
  },
  {
    name: 'diagnostics page uses real main adapter and direct projections',
    ok: /adaptMainCampaignToUniversal/.test(diagnosticsPage) &&
      /projectDMWorkspace/.test(diagnosticsPage) &&
      /projectPlayerSafe/.test(diagnosticsPage) &&
      /projectObserver/.test(diagnosticsPage),
  },
  {
    name: 'diagnostics page is read-only',
    ok: !/\bset[A-Z]\w+\(|\bpatch[A-Z]\w+\(|\badd[A-Z]\w+\(|\bdelete[A-Z]\w+\(|\bresetOverlay\(|\bimportOverlay\(|\blocalStorage\b/.test(diagnosticsPage),
  },
];

const failed = checks.filter((check) => !check.ok);
const result = {
  ok: failed.length === 0,
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  checks,
  failed: failed.map((check) => check.name),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'RESULTS.json'), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(resolve(outDir, 'SUMMARY.md'), [
  '# Stage 05 Projection Verification',
  '',
  `Verdict: ${result.verdict}`,
  '',
  `Checks: ${checks.length}`,
  `Failed: ${failed.length}`,
  '',
  'Implemented projections: DM workspace, map, entity card, timeline, travel, battle, player-safe, observer.',
  '',
  'Diagnostics route: /diagnostics/universal behind VITE_UNIVERSAL_DIAGNOSTICS and DmOnlyRoute.',
  '',
].join('\n'));

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result));
