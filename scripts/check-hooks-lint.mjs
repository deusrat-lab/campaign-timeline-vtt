#!/usr/bin/env node
/**
 * Reads ESLint's JSON output from stdin and fails only on
 * `react-hooks/rules-of-hooks` violations — the one lint category that can
 * actually crash the app to a blank screen at runtime (see
 * docs/CAMPAIGN_MAP_WORKSPACE_SMOKE_CHECKLIST.md and docs/TECH_DEBT.md for
 * why this is split out from `npm run lint`).
 *
 * Used by `npm run lint:hooks` — intentionally ignores every other rule
 * (including other genuinely-real-but-lower-severity findings tracked in
 * docs/TECH_DEBT.md), so this script must never be treated as "lint passed",
 * only as "no known crash-causing hook-order bug exists right now".
 */
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  let results;
  try {
    results = JSON.parse(input);
  } catch {
    console.error('lint:hooks — could not parse eslint --format json output; treating as failure.');
    process.exit(1);
  }
  const violations = results.flatMap((file) =>
    file.messages
      .filter((m) => m.ruleId === 'react-hooks/rules-of-hooks')
      .map((m) => `${file.filePath}:${m.line}:${m.column} — ${m.message}`),
  );
  if (violations.length > 0) {
    console.error(`lint:hooks — ${violations.length} react-hooks/rules-of-hooks violation(s) found:\n`);
    for (const v of violations) console.error('  ' + v);
    process.exit(1);
  }
  console.log('lint:hooks — react-hooks/rules-of-hooks is clean.');
});
