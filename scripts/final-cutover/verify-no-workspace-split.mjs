// Block G anti-split guard: fails if a route element mounts a legacy page tree
// directly (bypassing the shared CampaignWorkspace shell) or if either of the
// two flag-gated Stage 12 composition sites regresses back to a conditional
// branch instead of unconditional use.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

// --- App.tsx: no <Route element={...}> may directly mount a legacy page tree
// that has a workspace-wrapped equivalent. They may only be referenced inside
// the GreyholmMapRoute/CaldranMapRoute/CaldranBattleRoute wrapper functions
// (which themselves always mount GreyholmWorkspace/UserCampaignWorkspace) or
// inside a comment. ---
{
  const file = 'src/App.tsx';
  const text = read(file);

  const routeElementLines = text
    .split('\n')
    .filter((line) => /<Route\s/.test(line) && /element=/.test(line));

  const bypassPatterns = [
    { name: 'MapWorkspacePage', regex: /element=\{<MapWorkspacePage/ },
    { name: 'IsolatedCampaignMapWorkspace', regex: /element=\{[^}]*<IsolatedCampaignMapWorkspace/ },
    { name: 'CampaignBattlePage', regex: /element=\{[^}]*<CampaignBattlePage/ },
    { name: 'EconomyPage', regex: /element=\{[^}]*<EconomyPage(?!\s*\/>\s*\}\s*page=)/ },
    { name: 'ServicesPage', regex: /element=\{[^}]*<ServicesPage(?![^}]*page=)/ },
  ];
  for (const line of routeElementLines) {
    for (const { name, regex } of bypassPatterns) {
      // EconomyPage/ServicesPage are allowed when passed as the `page` prop of
      // GreyholmEconomyRoute (i.e. the line also contains GreyholmEconomyRoute) --
      // only a bare direct mount is a bypass.
      if (regex.test(line) && !/GreyholmEconomyRoute/.test(line)) {
        failed.push(`${file}: a <Route element={...}> mounts ${name} directly, bypassing the shared workspace: ${line.trim()}`);
      }
    }
  }

  // The Block G wrapper components must exist and must mount the shared
  // workspace, not just re-export the legacy component under a new name.
  const wrappers = [
    { fn: 'GreyholmMapRoute', workspace: 'GreyholmWorkspace' },
    { fn: 'CaldranMapRoute', workspace: 'UserCampaignWorkspace' },
    { fn: 'CaldranBattleRoute', workspace: 'UserCampaignWorkspace' },
    { fn: 'GreyholmEconomyRoute', workspace: 'GreyholmWorkspace' },
  ];
  for (const { fn, workspace } of wrappers) {
    const fnMatch = text.match(new RegExp(`function ${fn}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!fnMatch) {
      failed.push(`${file}: expected wrapper function ${fn} not found`);
      continue;
    }
    if (!fnMatch[1].includes(workspace)) {
      failed.push(`${file}: ${fn} does not mount ${workspace} -- route may bypass the shared workspace`);
    }
  }
}

// --- EntityLibraryPage.tsx / CampaignLibraryPage.tsx: must use the shared
// workspace unconditionally (no flag branch back to a legacy-only path). ---
{
  const pages = [
    { file: 'src/pages/EntityLibraryPage.tsx', workspace: 'GreyholmWorkspace' },
    { file: 'src/features/campaigns/CampaignLibraryPage.tsx', workspace: 'UserCampaignWorkspace' },
  ];
  for (const { file, workspace } of pages) {
    const text = read(file);
    if (/isSharedWorkspaceEnabledForKind/.test(text)) {
      failed.push(`${file}: still branches on isSharedWorkspaceEnabledForKind -- the shared workspace must be unconditional, not flag-gated, for this route to count as converged`);
    }
    if (!text.includes(`<${workspace}`)) {
      failed.push(`${file}: does not mount ${workspace}`);
    }
  }
}

// --- moduleRegistry.ts: visibilityPresentation must have an explicit,
// documented "folded in, not a separate module" classification -- Block G's
// final open moduleStatus item. Fails if the documented decision regresses. ---
{
  const file = 'src/domain/workspace/moduleRegistry.ts';
  const text = read(file);
  if (!/FOLDED_IN_WORKSPACE_CONCERNS/.test(text)) {
    failed.push(`${file}: missing FOLDED_IN_WORKSPACE_CONCERNS -- visibilityPresentation must have a documented module classification`);
  } else if (!/concern:\s*'visibilityPresentation'/.test(text)) {
    failed.push(`${file}: FOLDED_IN_WORKSPACE_CONCERNS exists but no longer documents 'visibilityPresentation'`);
  }
}

if (failed.length) {
  console.error('WORKSPACE_SPLIT_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, verdict: 'NO_WORKSPACE_ROUTE_SPLIT_FOUND' }));
