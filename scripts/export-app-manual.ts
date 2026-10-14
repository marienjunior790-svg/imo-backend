/**
 * Génère le guide lisible de l'application à partir de la source utilisée par l'assistant IA.
 * Usage : npx tsx scripts/export-app-manual.ts [chemin de sortie]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { APP_MANUAL, MANUAL_CATEGORIES } from '../src/modules/ai/ai.app-manual.js';

const output = resolve(process.argv[2] ?? 'docs/ITC-guide-application.md');

const anchor = (id: string) => `fiche-${id}`;

const lines: string[] = [
  '# ITC — Guide complet de l’application',
  '',
  'Ce document décrit chaque onglet, écran, section, bouton, statut et couleur de l’application mobile ITC, avec le but précis de chacun.',
  'Il est généré automatiquement depuis le guide intégré à l’assistant IA d’ITC (`src/modules/ai/ai.app-manual.ts`) : l’IA répond aux clients avec exactement ces informations.',
  '',
  '## Sommaire',
  '',
];

for (const category of MANUAL_CATEGORIES) {
  const sections = APP_MANUAL.filter((s) => s.category === category);
  if (!sections.length) continue;
  lines.push(`**${category}**`, '');
  for (const s of sections) lines.push(`- [${s.title}](#${anchor(s.id)})`);
  lines.push('');
}

for (const category of MANUAL_CATEGORIES) {
  const sections = APP_MANUAL.filter((s) => s.category === category);
  if (!sections.length) continue;
  lines.push('---', '', `## ${category}`, '');
  for (const s of sections) {
    lines.push(`<a id="${anchor(s.id)}"></a>`, '', `### ${s.title}`, '');
    lines.push(s.body.replace(/\n/g, '  \n'), '');
    const keywords = s.keywords.map((k) => k.replace(/^~/, ''));
    lines.push(`*Questions reconnues par l’IA : ${keywords.slice(0, 12).join(', ')}${keywords.length > 12 ? '…' : ''}*`, '');
  }
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join('\n'), 'utf8');
console.log(`Guide écrit : ${output} (${APP_MANUAL.length} fiches)`);
