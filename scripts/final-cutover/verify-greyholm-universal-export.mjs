// Block K — Greyholm universal export guard.
//
// Contract:
//   - Greyholm export MUST reuse the SAME serializer as Caldran's export
//     (exportUserCampaignDM), not a parallel handcrafted format.
//   - Greyholm export MUST NOT carry a UserCampaignRuntime (no
//     mapViewState/camera to strip in the first place -- Greyholm's own
//     camera key is a separate, never-exported localStorage key per
//     verify-camera-not-exported.mjs; this guard additionally proves the
//     Greyholm export path specifically never smuggles a runtime blob in).
//   - Import target is always explicit: reconstructUserCampaign always
//     rewrites campaignId to a NEW id (never Greyholm's own 'greyholm:main'
//     identity, never a hidden Greyholm fallback).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

// --- exportGreyholmUniversal must call exportUserCampaignDM, not a new format
{
  const file = 'src/domain/portability/userCampaignPortability.ts';
  const text = read(file);
  if (!/export function exportGreyholmUniversal/.test(text)) {
    failed.push(`${file}: exportGreyholmUniversal() missing`);
  }
  const fnMatch = text.match(/export function exportGreyholmUniversal[\s\S]*?\n}/);
  if (!fnMatch || !/return exportUserCampaignDM\(materialized,\s*undefined\)/.test(fnMatch[0])) {
    failed.push(`${file}: exportGreyholmUniversal() must delegate to exportUserCampaignDM (same serializer as Caldran), with no runtime (camera/session state can never be carried)`);
  }
}

// --- materializer must exist and must not fabricate a UserCampaignRuntime
{
  const file = 'src/domain/adapters/greyholmToUserCampaignAdapter.ts';
  const text = read(file);
  if (!/export function materializeGreyholmAsUserCampaign/.test(text)) {
    failed.push(`${file}: materializeGreyholmAsUserCampaign() missing`);
  }
  if (/UserCampaignRuntime/.test(text)) {
    failed.push(`${file}: must not reference UserCampaignRuntime -- Greyholm export this pass never carries a runtime blob (no battle-board/session state smuggled in)`);
  }
  if (!/campaignId: GREYHOLM_EXPORT_SOURCE_ID/.test(text)) {
    failed.push(`${file}: materialized campaignId must be the placeholder GREYHOLM_EXPORT_SOURCE_ID, never Greyholm's real registry id ('greyholm:main') -- import must always rewrite it to a genuinely new id`);
  }
}

// --- explicit-target semantics: reconstructUserCampaign always assigns a
// caller-supplied newCampaignId, never reuses the source id.
{
  const file = 'src/domain/portability/userCampaignPortability.ts';
  const text = read(file);
  if (!/export function reconstructUserCampaign\(text: string, newCampaignId: string\)/.test(text)) {
    failed.push(`${file}: reconstructUserCampaign(text, newCampaignId) signature missing/changed -- import must always take an explicit new campaign id, never infer/reuse the source's`);
  }
  if (!/campaignId: newCampaignId/.test(text)) {
    failed.push(`${file}: reconstructUserCampaign no longer overwrites campaignId with the explicit newCampaignId -- a hidden-fallback regression`);
  }
}

// --- UI: the Greyholm export button must exist and must NOT introduce any
// Greyholm-specific import path (import stays the single shared UC flow).
{
  const file = 'src/features/campaigns/CampaignManagementPanel.tsx';
  const text = read(file);
  if (!/exportGreyholmUniversal/.test(text)) {
    failed.push(`${file}: no UI trigger found for Greyholm export`);
  }
  if (/importGreyholm|greyholmImport/i.test(text)) {
    failed.push(`${file}: found a Greyholm-specific import path -- import must always go through the single shared importUniversalApply (always creates a new campaign, never a hidden Greyholm target)`);
  }
}

if (failed.length) {
  console.error('GREYHOLM_UNIVERSAL_EXPORT_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 3, verdict: 'GREYHOLM_UNIVERSAL_EXPORT_REUSES_CALDRAN_SERIALIZER_NO_HIDDEN_TARGET' }));
