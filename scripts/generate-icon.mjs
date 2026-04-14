import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sourcePng = path.join(repoRoot, 'assets', 'Sleek Wrytica AI Digital Logo Concept.png');
const buildDir = path.join(repoRoot, 'build');
const targetIco = path.join(buildDir, 'icon.ico');

async function main() {
  await mkdir(buildDir, { recursive: true });

  const input = await readFile(sourcePng);
  const icoBuffer = await pngToIco(input);

  await writeFile(targetIco, icoBuffer);
  console.log(`[icon] Generated: ${targetIco}`);
}

main().catch((error) => {
  console.error('[icon] Failed to generate icon:', error);
  process.exitCode = 1;
});
