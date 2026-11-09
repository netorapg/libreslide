# LibreSlide

[Português](README.md) · **English**

Free slides in Markdown, with an editor in the browser. Free and open-source software built with [Astro](https://astro.build): **each folder in `slides/` is a presentation, and each `.md` file inside it is a slide.**

> Independent project, not affiliated with LibreOffice or The Document Foundation.

The editor's interface is in Portuguese. Where this guide mentions a button or menu, the label is shown as it appears on screen, with its meaning in English.

## Getting started

With [Node.js](https://nodejs.org) 22.12 or newer installed, run in a terminal:

```bash
npx libreslide
```

The command asks where to keep your presentations (Enter accepts `~/Apresentacoes`), creates the folder with a sample presentation and opens the editor in the browser. Next time, it suggests the same folder.

```bash
npx libreslide ~/my-talks               # skips the question
npx libreslide ~/my-talks --port 5000
npx libreslide build ~/my-talks         # static site in ~/my-talks/dist
npm install -g libreslide               # installs it for good; after that, just `libreslide`
```

The folder holds only your content (`slides/`, `themes/`, `templates/`, `public/img/`); the program lives apart from it. Clicking the path in the corner of the editor's sidebar opens the folder in your file manager. The first run takes a while (it installs Astro and the editor); later runs use the cache.

## Developing (cloning the repository)

```bash
git clone https://github.com/netorapg/libreslide && cd libreslide
npm install
npm run dev            # opens http://localhost:4321
npm run editor         # editor in the browser: http://localhost:4321/__editor/
npm run nova -- my-talk [theme or template]   # aurora, paper, noir, sunset, one of your themes or a template
npm run build          # generates a static site in dist/
```

## Editor

`npm run editor` opens an editor in the browser: files on the left, the `.md` in the middle and the real slide on the right, updating on every change.

- Saves by itself as you type (<kbd>Ctrl</kbd>+<kbd>S</kbd> forces it right away).
- Creates presentations and slides, renames them (the order follows the name) and deletes them from the sidebar.
- **Layout** selector, **Inserir** (Insert) menu with cards, highlighted number, columns and more, and autocomplete for frontmatter keys.
- Drag or paste an image into the editor: it goes to `public/img/` and the Markdown is inserted.
- Navigating in the preview (arrow keys) opens the matching file; <kbd>Ctrl</kbd>+<kbd>PageUp/PageDown</kbd> does the reverse.
- If the file changes from outside (another editor, git), the editor reloads it.
- Frontmatter errors are underlined on the line, with the explanation below the preview.
- **Exportar** (Export): PDF of the presentation (identical to the screen, one slide per page), PNG of the current slide, or printing through the browser (PDF with selectable text). PDF and PNG use the installed Chrome/Chromium; if it is not found, set `CHROME_PATH`.

On the home page, the **Abrir editor** (Open editor) button takes you straight to it (it only appears under `npm run dev`).

The editor runs locally, alongside `libreslide` / `npm run editor`. When you generate the site for publishing (`libreslide build` / `npm run build`), only the slides go to `dist/`; the editor is left out, since the published site is static and cannot write files.

## Structure

```
slides/
  my-talk/
    01-cover.md       ← the order is the order of the file names
    02-agenda.md
    _draft.md         ← files starting with "_" are ignored
public/img/           ← images (use image: /img/photo.jpg)
themes/               ← your own themes (my-theme.yaml)
templates/            ← institution templates (one folder each)
```

### Your presentations stay out of git

Only `slides/exemplo/` (and its image), the theme `themes/oceano.yaml` and the template `templates/instituicao-exemplo/` are versioned. Any other folder in `slides/`, image in `public/img/`, theme in `themes/` or template in `templates/` is ignored by `.gitignore`, so you can clone the project, write your talks and update the code with `git pull` without mixing in personal content.

Want to version a presentation in your fork? Add to `.gitignore`:

```gitignore
!slides/my-talk/
!public/img/my-photo.jpg
!themes/my-theme.yaml
!templates/my-institution/
```

## A slide

```md
---
layout: split             # cover | default | section | center | statement | quote | split | image | columns
theme: aurora             # aurora | paper | noir | sunset | one of yours (on the 1st slide it applies to the whole presentation)
template: my-institution  # 1st slide only: applies a template from templates/
kicker: Introduction      # small label above the title
title: Hello, *world*     # *text* gets a gradient highlight; <br> breaks the line
subtitle: A short sentence
image: /img/photo.jpg     # for the split and image layouts
imagePosition: left       # split: image on the left
steps: true               # reveals list items one by one
accent: "#22c55e"         # accent color for this slide only
author: Jane Doe          # cover and quote
date: September 2026
notes: |
  Presenter notes (N key).
---

Content in regular **Markdown**: lists, tables, code, images, quotes.
```

| Layout      | What it is for                                                  |
| ----------- | --------------------------------------------------------------- |
| `cover`     | Cover with a large title, author and date                       |
| `default`   | Title + content                                                 |
| `section`   | Section opener (use `kicker: "02"` for the outlined number)     |
| `center`    | Everything centered                                             |
| `statement` | One huge sentence; `**bold**` becomes a gradient                |
| `quote`     | Quotation; `author` becomes the signature                       |
| `split`     | Text + image side by side                                       |
| `image`     | Full-screen image with text on top                              |
| `columns`   | Columns separated by a `***` line                               |

## Themes

There are four built in (`aurora`, `paper`, `noir` and `sunset`), and you can create your own without writing CSS. A theme is a `themes/<name>.yaml` file:

```yaml
mode: dark          # dark | light
background: aurora  # aurora | paper | noir | sunset | plain
font: sans          # sans | serif | mono (font for titles)
colors:
  background: "#04131f"
  text: "#e8f6ff"
  muted: "#8eb1c7"
  accent: "#38bdf8"   # highlight and background lights
  accent2: "#2dd4bf"  # title gradient
  accent3: "#818cf8"
corners: 20         # 0 to 60
grain: 0.06         # 0 to 0.3
```

and you use it with `theme: <name>` on the slide. The easiest way is through the editor: in the **Temas** (Themes) section of the sidebar, click **+** (or the **+** on a built-in theme to start from it), adjust colors, font and background while watching the result live, and click **Usar em …** (Use in …) to apply it to the presentation. `themes/oceano.yaml` is an example; your themes stay out of git, like your presentations.

## Templates (an institution's standard)

Some institutions require every presentation to follow a standard: logo, footer, font size, no animations. A **template** keeps those rules in a folder, and the presentation only needs `template: <name>` on the first slide:

```
templates/my-institution/
  template.yaml     ← the rules
  logo.svg          ← the logo (png, jpg, svg, webp…)
  01-cover.md       ← starter slides (optional): copied into each new presentation
  02-content.md
```

```yaml
name: "Example University"     # displayed name
theme: paper                   # theme (built in or from themes/)
lockTheme: true                # slides cannot change the theme
logo: "logo.svg"               # file in the folder (or /img/...)
logoPosition: top-right        # top-left | top-right | bottom-left | bottom-right
logoSize: 72                   # height in px (1920×1080 slide)
logoOnCover: true              # logo on the cover too
footer: "{title} · Example University"   # {title} = presentation name; "" = no text
slideNumbers: true             # numbering in the footer
textSize: 1                    # text size (0.6 to 1.6)
titleSize: 1                   # title size (0.6 to 1.6)
animations: false              # no transitions and no step-by-step reveals
```

It is easier through the editor: in the **Templates** section of the sidebar, click **+**, upload the logo and adjust the rest while watching the preview. **Usar em …** (Use in …) applies the template to the presentation, and **Usar os slides de …** (Use the slides from …) turns a finished presentation into the template's starter slides. When you create a presentation (in the editor or with `npm run nova -- name my-institution`), choose the template and it starts with those slides.

To share with colleagues, just copy the template's folder. `templates/instituicao-exemplo/` is an example.

### Markdown extras

- `<div class="cards">…</div>`: glass cards side by side (each child is a card; leave blank lines around Markdown inside the HTML).
- `<span class="stat">42%</span>`: a large gradient number.
- `<p class="step">…</p>`: any element with the `step` class appears in steps.
- `==text==` does not exist in standard Markdown; use `<mark>text</mark>` for a highlighter effect.

## Presenting

| Key            | Action                           |
| -------------- | -------------------------------- |
| `→` `Space`    | Next slide / step                |
| `←`            | Back                             |
| `O` / `Esc`    | Overview                         |
| `F`            | Full screen                      |
| `N`            | Presenter notes                  |
| `?`            | Help                             |
| `Ctrl` + `P`   | Export PDF (one slide per page)  |

The address keeps the current slide (`/my-talk/#5`). On a phone, swipe sideways.

## Creating a built-in theme (in the code)

For most cases, a theme in `themes/` is enough (see **Themes**). The four built-in themes are CSS variables in `src/styles/themes.css`; to create another one the same way, copy a block, rename it and add the name to `builtinThemes`, `builtinInfo` and `builtinPresets` (`src/lib/themes.ts`).

## License

[MIT](LICENSE) © 2026 netorapg. Use, modify and distribute freely, keeping the copyright notice.
