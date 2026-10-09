# Apresentações em Markdown (Astro)

Slides bonitos escritos em `.md`: **cada pasta em `slides/` é uma apresentação e cada arquivo `.md` dentro dela é um slide.**

```bash
npm install
npm run dev            # abre http://localhost:4321
npm run editor         # editor no navegador: http://localhost:4321/__editor/
npm run nova -- minha-palestra [tema]   # aurora, paper, noir, sunset ou um seu
npm run build          # gera um site estático em dist/
```

## Editor (estilo Overleaf)

`npm run editor` abre um editor no navegador: arquivos à esquerda, o `.md` no meio e o slide de verdade à direita, atualizando a cada alteração.

- Salva sozinho enquanto você digita (<kbd>Ctrl</kbd>+<kbd>S</kbd> força na hora).
- Cria apresentações e slides, renomeia (a ordem segue o nome) e exclui pela barra lateral.
- Seletor de **Layout**, menu **Inserir** (cartões, número em destaque, colunas…) e autocompletar das chaves do frontmatter.
- Arraste ou cole uma imagem no editor: ela vai para `public/img/` e o Markdown é inserido.
- Navegar no preview (setas) abre o arquivo correspondente; <kbd>Ctrl</kbd>+<kbd>PageUp/PageDown</kbd> faz o inverso.
- Se o arquivo mudar por fora (outro editor, git), o editor recarrega.
- Erros no frontmatter aparecem sublinhados na linha, com a explicação embaixo do preview.
- **Exportar**: PDF da apresentação (idêntico à tela, um slide por página), PNG do slide atual ou impressão pelo navegador (PDF com texto selecionável). O PDF e o PNG usam o Chrome/Chromium instalado; se ele não for encontrado, defina `CHROME_PATH`.

Na página inicial, o botão **Abrir editor** leva direto para ele (aparece só no `npm run dev`).

O editor só existe no servidor de desenvolvimento (`editor/plugin.mjs`); não vai para o `npm run build`.

## Estrutura

```
slides/
  minha-palestra/
    01-capa.md        ← a ordem é a do nome do arquivo
    02-agenda.md
    _rascunho.md      ← arquivos começando com "_" são ignorados
public/img/           ← imagens (use image: /img/foto.jpg)
```

### Suas apresentações ficam fora do git

Só `slides/exemplo/` (e a imagem dela) e o tema `themes/oceano.yaml` são versionados. Qualquer outra pasta em `slides/`, imagem em `public/img/` ou tema em `themes/` são ignorados pelo `.gitignore`, então você pode clonar o projeto, fazer as suas palestras e atualizar o código com `git pull` sem misturar conteúdo pessoal.

Quer versionar uma apresentação no seu fork? Adicione ao `.gitignore`:

```gitignore
!slides/minha-palestra/
!public/img/minha-foto.jpg
!themes/meu-tema.yaml
```

## Um slide

```md
---
layout: split             # cover | default | section | center | statement | quote | split | image | columns
theme: aurora             # aurora | paper | noir | sunset | um seu (no 1º slide vale para a apresentação toda)
kicker: Introdução        # rótulo pequeno acima do título
title: Olá, *mundo*       # *texto* ganha destaque em gradiente; <br> quebra linha
subtitle: Uma frase curta
image: /img/foto.jpg      # para layouts split e image
imagePosition: left       # split: imagem à esquerda
steps: true               # revela itens de lista um a um
accent: "#22c55e"         # cor de destaque só deste slide
author: Fulano            # cover e quote
date: Setembro 2026
notes: |
  Notas do apresentador (tecla N).
---

Conteúdo em **Markdown** normal: listas, tabelas, código, imagens, citações.
```

| Layout      | Para quê                                                        |
| ----------- | --------------------------------------------------------------- |
| `cover`     | Capa com título grande, autor e data                            |
| `default`   | Título + conteúdo                                               |
| `section`   | Abertura de seção (use `kicker: "02"` para o número vazado)     |
| `center`    | Tudo centralizado                                               |
| `statement` | Uma frase enorme; `**negrito**` vira gradiente                  |
| `quote`     | Citação; o `author` vira a assinatura                           |
| `split`     | Texto + imagem lado a lado                                      |
| `image`     | Imagem em tela cheia com texto por cima                         |
| `columns`   | Colunas separadas por uma linha `***`                           |

## Temas

Há quatro prontos — `aurora`, `paper`, `noir` e `sunset` — e você pode criar os seus sem escrever CSS. Um tema é um arquivo `themes/<nome>.yaml`:

```yaml
mode: dark          # dark | light
background: aurora  # aurora | paper | noir | sunset | plain (liso)
font: sans          # sans | serif | mono — fonte dos títulos
colors:
  background: "#04131f"
  text: "#e8f6ff"
  muted: "#8eb1c7"
  accent: "#38bdf8"   # destaque e luzes do fundo
  accent2: "#2dd4bf"  # gradiente dos títulos
  accent3: "#818cf8"
corners: 20         # 0 a 60
grain: 0.06         # 0 a 0.3
```

e se usa com `theme: <nome>` no slide. O jeito mais fácil é pelo editor: na seção **Temas** da barra lateral, clique em **+** (ou no **+** de um tema pronto para partir dele), ajuste cores, fonte e fundo vendo o resultado ao vivo e clique em **Usar em …** para aplicar à apresentação. `themes/oceano.yaml` é um exemplo; os seus temas ficam fora do git, como as apresentações.

### Extras no Markdown

- `<div class="cards">…</div>` — cartões de vidro lado a lado (cada filho é um cartão; deixe linhas em branco em volta do Markdown dentro do HTML).
- `<span class="stat">42%</span>` — número grande em gradiente.
- `<p class="step">…</p>` — qualquer elemento com a classe `step` aparece em etapas.
- `==texto==` não existe em Markdown padrão; use `<mark>texto</mark>` para marca-texto.

## Apresentando

| Tecla          | Ação                          |
| -------------- | ----------------------------- |
| `→` `Espaço`   | Próximo slide / etapa         |
| `←`            | Voltar                        |
| `O` / `Esc`    | Visão geral                   |
| `F`            | Tela cheia                    |
| `N`            | Notas do apresentador         |
| `?`            | Ajuda                         |
| `Ctrl` + `P`   | Exportar PDF (um slide por página) |

O endereço guarda o slide atual (`/minha-palestra/#5`). No celular, deslize para os lados.

## Criando um tema

Os temas são só variáveis CSS em `src/styles/themes.css`. Copie um bloco, renomeie
e adicione o nome em `themes` dentro de `src/content.config.ts`.
