type Slot = HTMLElement & { frags: HTMLElement[] };

const stage = document.getElementById('stage')!;
const slots = [...stage.querySelectorAll<Slot>('.slot')];
const progress = document.getElementById('progress')!;
const count = document.getElementById('count')!;
const notes = document.getElementById('notes')!;
const help = document.getElementById('help')!;

let cur = 0;
let step = 0;
let overview = false;
let notesOpen = false;

// Modo "embed": preview dentro do editor (editor/). Mostra o slide inteiro,
// sem etapas nem controles, e conversa com o editor via postMessage.
const params = new URLSearchParams(location.search);
const embed = params.has('embed') || params.has('export');
if (embed) document.body.classList.add('embed');
// ?export: captura de tela pelo editor (sem transições nem animações).
if (params.has('export')) document.body.classList.add('export');

// Prepara colunas (layout: columns) e etapas (steps: true).
for (const slot of slots) {
  const slide = slot.querySelector<HTMLElement>('.slide')!;
  const body = slide.querySelector<HTMLElement>('.body')!;

  if (slide.classList.contains('layout-columns')) {
    const cols = document.createElement('div');
    cols.className = 'cols';
    let col = document.createElement('div');
    col.className = 'col';
    for (const node of [...body.childNodes]) {
      if (node instanceof HTMLHRElement) {
        cols.append(col);
        col = document.createElement('div');
        col.className = 'col';
      } else col.append(node);
    }
    cols.append(col);
    body.replaceChildren(cols);
  }

  // Template sem animações (data-static): nada de etapas, tudo aparece de uma vez.
  const animated = !slide.hasAttribute('data-static');
  const frags = animated ? [...body.querySelectorAll<HTMLElement>('.step')] : [];
  if (animated && slide.hasAttribute('data-steps')) {
    frags.push(...body.querySelectorAll<HTMLElement>('li:not(li li), .cards > *, .col'));
  }
  slot.frags = [...new Set(frags)].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  slot.frags.forEach((f) => f.classList.add('frag'));
}

function fit() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (overview) {
    const cols = vw > 1500 ? 4 : vw > 1000 ? 3 : vw > 600 ? 2 : 1;
    const w = (Math.min(vw, 1800) - 80 - 28 * (cols - 1)) / cols;
    stage.style.setProperty('--cols', String(cols));
    stage.style.setProperty('--s', String(w / 1920));
  } else {
    stage.style.setProperty('--s', String(Math.min(vw / 1920, vh / 1080)));
  }
}

function update() {
  slots.forEach((slot, i) => {
    slot.classList.toggle('is-active', i === cur);
    slot.classList.toggle('is-past', i < cur);
    slot.classList.toggle('is-future', i > cur);
    slot.inert = !overview && i !== cur;
    slot.frags.forEach((f, j) => f.classList.toggle('shown', i < cur || (i === cur && j < step)));
  });

  const slide = slots[cur].querySelector<HTMLElement>('.slide')!;
  document.body.dataset.theme = slide.dataset.theme;
  progress.style.width = `${((cur + 1) / slots.length) * 100}%`;
  count.innerHTML = `<b>${cur + 1}</b> / ${slots.length}`;
  notes.textContent = slide.dataset.notes ?? 'Sem notas neste slide.';
  notes.hidden = !notesOpen;
  history.replaceState(null, '', `#${cur + 1}`);
  if (embed) parent.postMessage({ type: 'deck:slide', index: cur }, '*');
}

function go(i: number, atEnd = false) {
  if (i < 0 || i >= slots.length) return;
  cur = i;
  step = atEnd || embed ? slots[i].frags.length : 0;
  update();
}

function next() {
  if (step < slots[cur].frags.length) {
    step++;
    update();
  } else go(cur + 1);
}

function prev() {
  if (step > 0) {
    step--;
    update();
  } else go(cur - 1, true);
}

function toggleOverview(on = !overview) {
  overview = on;
  stage.classList.toggle('overview', on);
  fit();
  update();
  if (on) slots[cur].scrollIntoView({ block: 'center' });
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

const actions: Record<string, () => void> = {
  next,
  prev,
  overview: () => toggleOverview(),
  fullscreen: toggleFullscreen,
  notes: () => { notesOpen = !notesOpen; update(); },
  help: () => { help.hidden = !help.hidden; },
};

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key;
  if (overview) {
    if (key === 'Escape' || key === 'o' || key === 'O' || key === 'Enter') toggleOverview(false);
    else if (key === 'ArrowRight') go(cur + 1);
    else if (key === 'ArrowLeft') go(cur - 1);
    else return;
    e.preventDefault();
    return;
  }
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key)) next();
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) prev();
  else if (key === 'Home') go(0);
  else if (key === 'End') go(slots.length - 1, true);
  else if (key === 'o' || key === 'O' || key === 'Escape') {
    if (!help.hidden) help.hidden = true;
    else toggleOverview(true);
  } else if (key === 'f' || key === 'F') toggleFullscreen();
  else if (key === 'n' || key === 'N') actions.notes();
  else if (key === '?') actions.help();
  else return;
  e.preventDefault();
});

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) =>
  btn.addEventListener('click', () => actions[btn.dataset.action!]()),
);

slots.forEach((slot, i) =>
  slot.addEventListener('click', () => {
    if (!overview) return;
    go(i, true);
    toggleOverview(false);
  }),
);

// Swipe no celular / tablet
let touchX: number | null = null;
stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
stage.addEventListener('touchend', (e) => {
  if (touchX === null || overview) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
  touchX = null;
});

// Mostra os controles quando o mouse se mexe
let idle: number | undefined;
document.addEventListener('mousemove', () => {
  document.body.classList.add('show-ui');
  clearTimeout(idle);
  idle = window.setTimeout(() => document.body.classList.remove('show-ui'), 2200);
});

window.addEventListener('resize', fit);
window.addEventListener('hashchange', () => {
  const n = parseInt(location.hash.slice(1), 10) - 1;
  if (n !== cur) go(n);
});
window.addEventListener('message', (e) => {
  if (!embed) return;
  if (e.data?.type === 'editor:go') go(e.data.index, true);
  // Pré-visualização de um tema sendo editado: aplica em todos os slides.
  if (e.data?.type === 'editor:theme') {
    const { name, css, background, mode } = e.data;
    let style = document.getElementById('live-theme');
    if (!style) document.head.append((style = Object.assign(document.createElement('style'), { id: 'live-theme' })));
    style.textContent = css;
    for (const el of [document.body, ...stage.querySelectorAll<HTMLElement>('.slide')]) {
      Object.assign(el.dataset, { theme: name, bg: background, mode });
    }
  }
});
window.addEventListener('beforeprint', () => slots.forEach((s) => (s.inert = false)));

const start = parseInt(location.hash.slice(1), 10) - 1;
cur = Number.isInteger(start) && start >= 0 && start < slots.length ? start : 0;
if (embed) step = slots[cur].frags.length;
fit();
update();

// ?print: abre a janela de impressão (Salvar como PDF) assim que as fontes carregarem.
if (params.has('print')) document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
