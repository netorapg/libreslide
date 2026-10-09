// Cria uma nova apresentação: npm run nova -- nome-da-apresentacao [tema]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [name, theme = 'aurora'] = process.argv.slice(2);
if (!name) {
  console.error('Uso: npm run nova -- nome-da-apresentacao [tema]  (aurora, paper, noir, sunset ou um de themes/)');
  process.exit(1);
}

const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dir = join('slides', slug);
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

for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
console.log(`✓ Criada em ${dir}/ — rode "npm run dev" e abra http://localhost:4321/${slug}/`);
