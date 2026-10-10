# LibreSlide

Slides livres em Markdown, com editor no navegador. Software livre, gratuito e feito com [Astro](https://astro.build): **cada pasta em `slides/` é uma apresentação e cada arquivo `.md` dentro dela é um slide.**

> Projeto independente, sem ligação com o LibreOffice ou a The Document Foundation.

## Começar

Com o [Node.js](https://nodejs.org) 22.12 ou mais novo instalado, rode no terminal:

```bash
npx libreslide
```

O comando pergunta onde guardar suas apresentações (Enter aceita `~/Apresentacoes`), cria a pasta com uma apresentação de exemplo e abre o editor no navegador. Da próxima vez, ele sugere a mesma pasta.

```bash
npx libreslide ~/minhas-palestras               # pula a pergunta
npx libreslide ~/minhas-palestras --port 5000
npx libreslide build ~/minhas-palestras         # site estático em ~/minhas-palestras/dist
npm install -g libreslide                       # instala de vez; depois é só `libreslide`
```

A pasta contém só o seu conteúdo (`slides/`, `themes/`, `templates/`, `public/img/`); o programa fica separado dela. O clique no caminho, no canto da barra lateral do editor, abre a pasta no gerenciador de arquivos. A primeira execução demora um pouco (instala o Astro e o editor); as seguintes usam o cache.

## Desenvolvendo (clonando o repositório)

```bash
git clone https://github.com/netorapg/libreslide && cd libreslide
npm install
npm run dev            # abre http://localhost:4321
npm run editor         # editor no navegador: http://localhost:4321/__editor/
npm run nova -- minha-palestra [tema ou template]   # aurora, paper, noir, sunset, um tema seu ou um template
npm run build          # gera um site estático em dist/
```

## Editor

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

O editor roda localmente, junto com o `libreslide` / `npm run editor`. Ao gerar o site para publicar (`libreslide build` / `npm run build`), só os slides vão para `dist/`; o editor fica de fora, já que o site publicado é estático e não pode gravar arquivos.

## Estrutura

```
slides/
  minha-palestra/
    01-capa.md        ← a ordem é a do nome do arquivo
    02-agenda.md
    _rascunho.md      ← arquivos começando com "_" são ignorados
public/img/           ← imagens (use image: /img/foto.jpg)
themes/               ← temas seus (meu-tema.yaml)
templates/            ← templates de instituição (uma pasta cada)
```

### Suas apresentações ficam fora do git

Só `slides/exemplo/` (e a imagem dela), o tema `themes/oceano.yaml` e o template `templates/instituicao-exemplo/` são versionados. Qualquer outra pasta em `slides/`, imagem em `public/img/`, tema em `themes/` ou template em `templates/` é ignorado pelo `.gitignore`, então você pode clonar o projeto, fazer as suas palestras e atualizar o código com `git pull` sem misturar conteúdo pessoal.

Quer versionar uma apresentação no seu fork? Adicione ao `.gitignore`:

```gitignore
!slides/minha-palestra/
!public/img/minha-foto.jpg
!themes/meu-tema.yaml
!templates/minha-instituicao/
```

## Um slide

```md
---
layout: split             # cover | default | section | center | statement | quote | split | image | columns
theme: aurora             # aurora | paper | noir | sunset | um seu (no 1º slide vale para a apresentação toda)
template: minha-instituicao  # só no 1º slide: aplica um template de templates/
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

## Templates (padrão de uma instituição)

Algumas instituições exigem que toda apresentação siga um padrão: logo, rodapé, tamanho de letra, sem animações. Um **template** guarda essas regras numa pasta, e a apresentação só precisa de `template: <nome>` no primeiro slide:

```
templates/minha-instituicao/
  template.yaml     ← as regras
  logo.svg          ← a logo (png, jpg, svg, webp…)
  01-capa.md        ← slides iniciais (opcionais): copiados para cada apresentação nova
  02-conteudo.md
```

```yaml
name: "Universidade Exemplo"   # nome exibido
theme: paper                   # tema (pronto ou de themes/)
lockTheme: true                # os slides não podem trocar o tema
logo: "logo.svg"               # arquivo da pasta (ou /img/...)
logoPosition: top-right        # top-left | top-right | bottom-left | bottom-right
logoSize: 72                   # altura em px (slide de 1920×1080)
logoOnCover: true              # logo também na capa
footer: "{title} · Universidade Exemplo"   # {title} = nome da apresentação; "" = sem texto
slideNumbers: true             # numeração no rodapé
textSize: 1                    # tamanho do texto (0.6 a 1.6)
titleSize: 1                   # tamanho dos títulos (0.6 a 1.6)
animations: false              # sem transições e sem itens revelados aos poucos
```

Pelo editor é mais fácil: na seção **Templates** da barra lateral, clique em **+**, envie a logo e ajuste o resto vendo a prévia. **Usar em …** aplica o template à apresentação, e **Usar os slides de …** transforma uma apresentação pronta nos slides iniciais do template. Ao criar uma apresentação (no editor ou com `npm run nova -- nome minha-instituicao`), escolha o template e ela já começa com esses slides.

Para compartilhar com colegas, basta copiar a pasta do template. `templates/instituicao-exemplo/` é um exemplo.

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

## Criando um tema pronto (no código)

Para a maioria dos casos, um tema em `themes/` basta (veja **Temas**). Os quatro temas prontos
são variáveis CSS em `src/styles/themes.css`; para criar outro do mesmo jeito, copie um bloco,
renomeie e adicione o nome em `builtinThemes`, `builtinInfo` e `builtinPresets` (`src/lib/themes.ts`).

## Licença

[MIT](LICENSE) © 2026 netorapg. Use, modifique e distribua à vontade, mantendo o aviso de copyright.
