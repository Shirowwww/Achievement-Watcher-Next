---
title: "Guia do controle"
description: "Use um controle Xbox, PlayStation ou Switch para operar o Achievement Watcher Next e o overlay dentro do jogo, e sinta um desbloqueio pela vibração."
---

# Guia do controle (gamepad)

Um gamepad pode operar dois lugares distintos: a janela principal e o overlay dentro do jogo. Os dois são configurados em
**Configurações → Controle**.

<div align="center">
<picture><source srcset="../assets/shot/controller-panel-800.webp 800w, ../assets/shot/controller-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/controller-panel.png" width="720" height="529" alt="Configurações - Controle"></picture><br>
<sub>Navegação do overlay e do app, layout e atribuições de botões por atalho</sub>
</div>

## Os dois interruptores {#the-two-switches}

| Configuração | Padrão | O que cobre |
|---|---|---|
| **Controlar o app com o controle** | Ativado | A janela principal do AW Next: biblioteca, detalhes dos jogos, configurações e buscas. |
| **Controlar o overlay no jogo com um controle** | Desativado | O overlay dentro do jogo, operado pelo rastreador em segundo plano enquanto você joga. |

A navegação do app é uma entrada comum da janela e não custa nada, então vem ativada por padrão. O controle do overlay carrega
a pilha nativa do controle no rastreador em segundo plano, então é opcional.

## Atalhos num relance {#shortcuts-at-a-glance}

Os nomes dos botões usam o vocabulário do Xbox; o app os mostra no layout que você selecionar.

<div align="center">
<img src="../assets/img/controller-map.svg" width="700" height="422" alt="Um gamepad com os atalhos padrão: LT abre o Estado do jogo, RT inicia o jogo, LB e RB trocam a aba das configurações, o direcional move o foco, A confirma, B cancela, X pesquisa, Y e Start abrem as Configurações, mais as três combinações do overlay" loading="lazy">
</div>

| Atalho | Padrão | Onde |
|---|---|---|
| Abrir / fechar o overlay | **Back + Start + LB** | No jogo |
| Alternar a navegação do overlay | **LB + X** | Overlay aberto |
| Mover e rolar o overlay | **LB + RB** (segurados) | Overlay aberto |
| Confirmar | **A** | App + overlay |
| Voltar / cancelar | **B** | App + overlay |
| Focar a caixa de busca | **X** | App + overlay |
| Abrir as Configurações / as opções do overlay | **Y** | App + overlay |
| Abrir as Configurações | **Start** | App |
| Iniciar o jogo selecionado | **RT** | App, biblioteca |
| Abrir o Estado do jogo do jogo selecionado | **LT** | App, biblioteca |
| Aba anterior / seguinte das configurações | **LB** / **RB** | App, Configurações abertas |
| Rolar a página | **LB** / **RB** | App, Configurações fechadas |

A alternância do overlay usa três botões para não disparar por acidente no meio do jogo. Todo atalho do overlay
é configurável e aceita de um a três botões.

Na biblioteca, o analógico se move entre os cartões e **A** abre o jogo, como um clique. Os dois
controles desenhados num cartão ficam nos gatilhos: **RT** inicia o jogo selecionado e **LT** abre
o painel Estado do jogo dele. Os dois não fazem nada a menos que um cartão da biblioteca esteja selecionado.

## Opções {#options}

- **Layout do controle**: o vocabulário das dicas e dos nomes dos botões. **Automático** segue o controle conectado
  quando ele pode ser identificado; os demais são **Xbox**, **PlayStation** e **Switch**.
- **Backend do controle**: **Automático** escolhe o melhor backend de entrada disponível, **XInput** é o mais
  compatível e **GameInput** serve às versões mais novas do Windows.
- **Atribuições**: de um a três botões por atalho. Os atalhos podem compartilhar um botão (os padrões compartilham:
  **LB + X** e **LB + RB** usam LB), e a camada de entrada garante que segurar uma combinação não
  dispare a outra. Um botão repetido dentro de uma mesma atribuição conta uma vez. A alternância do overlay também aceita
  o botão **Guide**; os dois modos do overlay não, porque a API de gamepad do navegador que os lê
  não o informa de forma confiável.
- **Focar o overlay ao abrir**: dá ao overlay o foco do teclado, o que pausa muitos jogos que
  perdem o foco. Desativado por padrão.
- **Enviar Esc para o jogo ao abrir com o controle**: envia um pressionamento da tecla Esc ao jogo em
  foco logo antes de o overlay abrir, de modo que muitos jogos pausem ou abram o menu. Só vale para aberturas
  disparadas pelo controle enquanto um jogo está em execução, nunca para o atalho de teclado. Desativado por padrão.

## Janela do app {#app-window}

Com a navegação do app ativada, pressionar qualquer botão do gamepad na janela principal exibe um anel de foco. O
direcional ou o analógico esquerdo move entre os controles, e os atalhos acima valem. Dois detalhes:

- **B** primeiro sai de um campo de texto em foco, depois volta ou cancela, de modo que você sai da caixa
  de busca sem o mouse.
- **LB** / **RB** trocam as abas das configurações enquanto as Configurações estão abertas e rolam a página quando estão fechadas.

Mover o mouse ou pressionar uma tecla do teclado devolve o controle ao mouse e ao teclado.

## Overlay dentro do jogo {#in-game-overlay}

**Back + Start + LB** abre ou fecha o overlay sobre o jogo em execução. **LB + X** então alterna o
modo de navegação: o direcional ou o analógico esquerdo move o anel de foco, **A** confirma, **B** cancela, **X**
leva o foco à busca e **Y** abre o painel de opções. Segurar **LB + RB** move o overlay com o
analógico esquerdo e rola a lista com o analógico direito.

Um pequeno selo **UI** aparece no cabeçalho enquanto a navegação está ativa, e a barra de dicas mostra as suas
atribuições e o seu layout. O restante do overlay está no [guia do overlay](overlay.md).

> [!IMPORTANT]
> O Windows não permite que um app de terceiros capture um controle com exclusividade, então o jogo pode continuar
> recebendo a entrada dos botões enquanto o overlay está aberto. Para pausar o jogo, ative **Focar o overlay
> ao abrir** (a maioria dos jogos pausa ao perder o foco) ou **Enviar Esc para o jogo ao abrir
> com o controle**.

## Controles compatíveis {#supported-pads}

Controles Xbox, PlayStation DualShock 4 / DualSense e Switch Pro são compatíveis. Os controles Xbox
passam pelo XInput; os da PlayStation e do Switch são lidos por HID bruto, então não precisam de nenhum
driver do fabricante.

## Quando um controle não é detectado {#when-a-controller-is-not-detected}

1. Confirme que o interruptor certo está ativado: a navegação do app e o controle do overlay são separados.
2. Experimente o backend **XInput** explicitamente; o **Automático** pode escolher o GameInput numa build em que um dado controle
   não é enumerado.
3. Verifique o controle no painel de controladores de jogo do Windows (`joy.cpl`). Se o Windows não o vê, o AW Next
   também não pode vê-lo.
4. Para um relato de bug, adicione `debugLogging = true` à seção `[controller]` de
   `%APPDATA%\Achievement Watcher Next\cfg\options.ini` e reinicie. O rastreador em segundo plano então registra
   diagnósticos no nível dos botões. Não há interruptor na interface porque a saída é extensa; desative-o
   depois.

---

**Próximo:** [Estado do jogo](game-health.md) - o painel de cada jogo que diz por que um jogo está ou não sendo
rastreado.

<div align="center">

[← Documentação](README.md) · [Guia do overlay](overlay.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## No Linux {#on-linux}

No Linux, o AW Next lê os gamepads dos dispositivos de entrada do kernel, e os atalhos acima funcionam da mesma
forma. Enquanto o Steam Input está em execução, ele lê apenas os controles virtuais da Steam, para que um pressionamento não seja contado duas vezes. O
Steam Deck e o plugin Decky são tratados em [Linux e Steam Deck](linux.md#steam-deck).
