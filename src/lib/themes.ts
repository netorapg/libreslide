// Temas: os 4 prontos (src/styles/themes.css) + os criados pelo usuário em themes/*.yaml.
// Este arquivo não importa nada do Node: é usado também no editor (navegador).

export const builtinThemes = ['aurora', 'paper', 'noir', 'sunset'] as const;
export const backgrounds = ['aurora', 'paper', 'noir', 'sunset', 'plain'] as const;
export const fonts = ['sans', 'serif', 'mono'] as const;
export const modes = ['dark', 'light'] as const;

export interface ThemeFile {
  mode: (typeof modes)[number];
  background: (typeof backgrounds)[number];
  font: (typeof fonts)[number];
  colors: {
    background: string;
    text: string;
    muted: string;
    accent: string;
    accent2: string;
    accent3: string;
  };
  corners: number;
  grain: number;
}

export interface ThemeInfo {
  name: string;
  mode: ThemeFile['mode'];
  background: ThemeFile['background'];
  builtin: boolean;
}

/** Modo e fundo dos temas prontos (as cores estão em themes.css). */
export const builtinInfo: Record<string, ThemeInfo> = {
  aurora: { name: 'aurora', mode: 'dark', background: 'aurora', builtin: true },
  paper: { name: 'paper', mode: 'light', background: 'paper', builtin: true },
  noir: { name: 'noir', mode: 'dark', background: 'noir', builtin: true },
  sunset: { name: 'sunset', mode: 'dark', background: 'sunset', builtin: true },
};

/** Valores dos temas prontos no formato de arquivo — ponto de partida para um tema novo. */
export const builtinPresets: Record<(typeof builtinThemes)[number], ThemeFile> = {
  aurora: {
    mode: 'dark', background: 'aurora', font: 'sans', corners: 28, grain: 0.07,
    colors: { background: '#07081a', text: '#f4f3ff', muted: '#a5a8cc', accent: '#a78bfa', accent2: '#22d3ee', accent3: '#f472b6' },
  },
  paper: {
    mode: 'light', background: 'paper', font: 'serif', corners: 28, grain: 0.12,
    colors: { background: '#f3ede2', text: '#1d1a16', muted: '#6f665b', accent: '#c2410c', accent2: '#b45309', accent3: '#9a3412' },
  },
  noir: {
    mode: 'dark', background: 'noir', font: 'sans', corners: 6, grain: 0.07,
    colors: { background: '#0a0a0a', text: '#fafafa', muted: '#8a8a8a', accent: '#d9f99d', accent2: '#a3e635', accent3: '#d9f99d' },
  },
  sunset: {
    mode: 'dark', background: 'sunset', font: 'serif', corners: 28, grain: 0.07,
    colors: { background: '#2a0b3d', text: '#fff7f0', muted: '#f3c9d6', accent: '#fde68a', accent2: '#fb923c', accent3: '#f472b6' },
  },
};

const FONT_VARS: Record<ThemeFile['font'], string> = {
  sans: `--font-display: 'Inter Variable', system-ui, sans-serif; --title-weight: 700; --title-tracking: -0.035em;`,
  serif: `--font-display: 'Fraunces Variable', Georgia, serif; --title-weight: 560; --title-tracking: -0.025em; --em-style: italic;`,
  mono: `--font-display: 'JetBrains Mono Variable', ui-monospace, monospace; --title-weight: 650; --title-tracking: -0.04em;`,
};

const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/** Gera o CSS de um tema do usuário. `name` e as cores já vêm validados pelo schema. */
export function themeCss(name: string, t: ThemeFile) {
  const c = t.colors;
  const dark = t.mode === 'dark';
  return `[data-theme='${name}'] {
  --bg: ${c.background};
  --fg: ${c.text};
  --muted: ${c.muted};
  --accent: ${c.accent};
  --accent-2: ${c.accent2};
  --accent-3: ${c.accent3};
  --glow-1: ${c.accent};
  --glow-2: ${c.accent2};
  --glow-3: ${c.accent3};
  --bg-2: ${mix(c.background, c.accent3, 55)};
  --bg-3: ${mix(c.background, c.accent2, 25)};
  --surface: ${dark ? 'rgb(255 255 255 / 0.06)' : 'rgb(255 255 255 / 0.55)'};
  --border: ${mix(c.text, 'transparent', dark ? 12 : 14)};
  --code-bg: ${dark ? mix(c.background, '#000', 70) : mix(c.background, '#fff', 40)};
  --radius: ${t.corners}px;
  --grain: ${t.grain};
  ${FONT_VARS[t.font]}
}`;
}
