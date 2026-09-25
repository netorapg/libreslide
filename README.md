# Apresentações em Markdown (Astro)

Slides bonitos escritos em `.md`: **cada pasta em `slides/` é uma apresentação e cada arquivo `.md` dentro dela é um slide.**

```bash
npm install
npm run dev            # abre http://localhost:4321
npm run nova -- minha-palestra [aurora|paper|noir|sunset]
npm run build          # gera um site estático em dist/
```

## Estrutura

```
slides/
  minha-palestra/
    01-capa.md        ← a ordem é a do nome do arquivo
    02-agenda.md
    _rascunho.md      ← arquivos começando com "_" são ignorados
public/img/           ← imagens (use image: /img/foto.jpg)
```

## Um slide

```md
---
layout: split             # cover | default | section | center | statement | quote | split | image | columns
theme: aurora             # aurora | paper | noir | sunset (no 1º slide vale para a apresentação toda)
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
