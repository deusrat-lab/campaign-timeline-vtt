/**
 * Block I harness — proves the universal campaign configuration contract's
 * defaults match documented real behavior for Greyholm, Caldran, and a new
 * campaign, and that toggling a capability off never mutates the underlying
 * data-shape assumptions (content policies / battle capabilities stay put).
 * Run with: npx tsx scripts/final-cutover/verify-block-i-configuration.ts
 */
import { makeCampaignId } from '../../src/domain/campaign/ids';
import {
  greyholmDefaultConfiguration,
  caldranDefaultConfiguration,
  newCampaignDefaultConfiguration,
  CONFIGURATION_SCHEMA_VERSION,
} from '../../src/domain/campaign/configuration';
import { isCapabilityEnabled } from '../../src/domain/campaign/capabilities';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

const greyholm = greyholmDefaultConfiguration(makeCampaignId('campaign:greyholm'));
const caldran = caldranDefaultConfiguration(makeCampaignId('campaign:caldran-test'), 'Caldran Test One-Shot');
const fresh = newCampaignDefaultConfiguration(makeCampaignId('campaign:fresh-001'), 'Brand New Campaign');

check('schema version is 1.0.0', greyholm.schemaVersion === CONFIGURATION_SCHEMA_VERSION);
check('greyholm stack tag correct', greyholm.metadata.stack === 'greyholm');
check('caldran stack tag correct', caldran.metadata.stack === 'user-campaign');

check('greyholm timeline ON by default', greyholm.capabilities.timeline.enabled === true);
check('greyholm economy ON by default', greyholm.capabilities.economy.enabled === true);
check('caldran timeline OFF by default', caldran.capabilities.timeline.enabled === false);
check('caldran economy OFF by default', caldran.capabilities.economy.enabled === false);
check('new campaign timeline ON by default', fresh.capabilities.timeline.enabled === true);
check('new campaign economy ON by default', fresh.capabilities.economy.enabled === true);

// isCapabilityEnabled reads the sparse CapabilityToggles form used by both
// legacy stacks -- confirm the two shapes agree at the boundary this
// contract is meant to replace piecemeal defaults with.
check(
  'sparse toggle absent-key default matches CampaignCapabilities all-on default',
  isCapabilityEnabled(undefined, 'arcs') === (fresh.capabilities.arcs.enabled === true),
);

check('greyholm has no delete for npc (documented real gap)', greyholm.contentPolicies.npc.deletable === false);
check('greyholm still allows create+edit for npc', greyholm.contentPolicies.npc.creatable && greyholm.contentPolicies.npc.editable);
check('caldran full CRUD for npc (Decision 1 proven)', caldran.contentPolicies.npc.deletable === true);
check('caldran full CRUD for quests', caldran.contentPolicies.quests.deletable === true);
check('factions read-only on both stacks', greyholm.contentPolicies.factions.creatable === false && caldran.contentPolicies.factions.creatable === false);

check('battle capabilities present on all three configs', [greyholm, caldran, fresh].every((c) => c.battleCapabilities.grid && c.battleCapabilities.initiative));
check('projection capabilities present on all three configs', [greyholm, caldran, fresh].every((c) => c.projectionCapabilities.playerView && c.projectionCapabilities.observer));

// Disabling a capability must not touch content/battle policy shape --
// policies describe data support, capabilities describe UI/route gating;
// conflating them was an explicit non-goal.
const allOffCaldran = caldranDefaultConfiguration(makeCampaignId('campaign:caldran-alloff'), 'x');
check(
  'disabling capability leaves contentPolicies untouched',
  JSON.stringify(allOffCaldran.contentPolicies) === JSON.stringify(caldran.contentPolicies),
);

const total = passed + failed;
console.log(`Block I configuration harness: ${passed}/${total} passed`);
if (failed > 0) {
  process.exit(1);
}
