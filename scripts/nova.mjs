// Cria uma nova apresentação: npm run nova -- nome-da-apresentacao [tema ou template]
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ws } from '../workspace.mjs';

const [name, theme = 'aurora'] = process.argv.slice(2);
if (!name) {
  console.error('Uso: npm run nova -- nome-da-apresentacao [tema ou template]  (aurora, paper, noir, sunset, um de themes/ ou de templates/)');
  process.exit(1);
}

const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dir = ws('slides', slug);
if (existsSync(dir)) {
  console.error(`A pasta ${dir} já existe.`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

const title = name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const today = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

const files = {
  '01-capa.md': `---
layout: cover
theme: ${theme}
kicker: Apresentação
title: ${title}
subtitle: Um subtítulo que explica a ideia em uma frase.
author: Seu Nome
date: ${today}
---
`,
  '02-agenda.md': `---
kicker: Agenda
title: O que vamos *ver*
steps: true
---

- Primeiro tópico
- Segundo tópico
- Terceiro tópico
`,
  '03-fim.md': `---
layout: center
title: Obrigado!
subtitle: Perguntas?
---
`,
};

// Template (templates/<nome>/): copia os slides iniciais dele, se houver.
const tplDir = ws('templates', theme);
if (existsSync(join(tplDir, 'template.yaml')) || existsSync(join(tplDir, 'template.yml'))) {
  const starters = readdirSync(tplDir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
  for (const k of Object.keys(files)) delete files[k];
  if (!starters.length) starters.push(null);
  starters.forEach((f, i) => {
    let text = f ? readFileSync(join(tplDir, f), 'utf8') : `---\nlayout: cover\ntitle: x\n---\n`;
    if (i === 0) {
      text = text.replace(/^---\r?\n/, `---\ntemplate: ${theme}\n`);
      text = /^title:.*$/m.test(text) ? text.replace(/^title:.*$/m, `title: ${JSON.stringify(title)}`) : text;
    }
    files[f ?? '01-capa.md'] = text;
  });
}

for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
console.log(`✓ Criada em ${dir}/ — rode "npm run dev" e abra http://localhost:4321/${slug}/`);
