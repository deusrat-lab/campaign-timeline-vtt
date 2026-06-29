import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: npm run snapshot:promote -- /path/to/campaign-timeline-vtt-export.json');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
} catch (err) {
  console.error(`Failed to read overlay JSON: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  console.error('Overlay snapshot must be a JSON object.');
  process.exit(1);
}

const outputPath = resolve('src/data/campaignOverlaySnapshot.json');
await writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`Promoted overlay snapshot to ${outputPath}`);
