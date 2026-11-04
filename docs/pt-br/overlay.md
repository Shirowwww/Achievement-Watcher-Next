---
title: "Lista de conquistas dentro do jogo (overlay)"
description: "A lista de conquistas dentro do jogo aberta com Ctrl+Shift+K: busca, filtros, raridade, descrições ocultas e personalização."
---

# Lista de conquistas dentro do jogo (overlay)

O overlay dentro do jogo (`Ctrl+Shift+K` por padrão enquanto um jogo compatível está em execução) mostra a lista
de conquistas do jogo em andamento sem sair dele: nomes, descrições, estado de bloqueio, datas de desbloqueio e
progresso. Arraste-o pelo cabeçalho; ele fica por cima do jogo. No Linux, um jogo executado nativamente
no Wayland não repassa o atalho: associe `~/.local/bin/achievement-watcher --toggle-overlay`
a uma tecla, como mostra [Atalho do overlay](linux.md#overlay-shortcut).

<div align="center">
<picture><source srcset="../assets/shot/overlay.webp 569w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/overlay.png" width="360" height="633" alt="Lista de conquistas no overlay dentro do jogo"></picture><br>
<sub>Colunas de estado, raridade e data, com busca e filtros</sub>
</div>

## Como abro a lista de conquistas num jogo? {#how-do-i-open-the-achievement-list-in-a-game}

Pressione `Ctrl+Shift+K` enquanto um jogo compatível está em execução. Esse é o atalho padrão. O overlay lista todas as
conquistas desse jogo com estado, data de desbloqueio, raridade e progresso, e você pode pesquisar nela.
Pressione o atalho de novo para fechá-lo. Num controle, o padrão é **Back + Start + LB**.

No Linux com Wayland, um jogo executado como janela Wayland nativa nunca repassa a tecla ao AW Next.
Associe `~/.local/bin/achievement-watcher --toggle-overlay` a uma tecla nas configurações de teclado
do seu desktop. Veja [Atalho do overlay](linux.md#overlay-shortcut).

## O overlay é o mesmo que o popup de desbloqueio? {#is-the-overlay-the-same-as-the-unlock-popup}

Não. O popup é uma notificação pontual que aparece quando algo é desbloqueado, estilizada por um preset (veja
[Notificações](notifications.md)). O overlay é a lista completa de um jogo, aberta por você, e
fica até você fechá-lo.

## O que ele mostra {#what-it-shows}

- Uma barra de estatísticas com `desbloqueadas / total` e a porcentagem de conclusão.
- Uma linha por conquista com uma pílula de estado colorida (`Desbloqueado` / `Bloqueado`), a data de desbloqueio das
  conquistas obtidas e uma barra de progresso com um rótulo `current / max` para conquistas de progresso.
- Um selo de raridade (`★ 12.3%`) para toda conquista com taxa de desbloqueio conhecida. As conquistas comuns usam
  um selo cinza-escuro; as raras usam ouro, prata e bronze com um halo suave, em 5%, 10% e 15% por
  padrão. **Configurações → Geral → Exibição da raridade** muda os níveis ou passa para as classificações de troféus.

## Conquistas ocultas {#hidden-achievements}

O overlay não entrega o segredo de uma conquista oculta que você não desbloqueou: como na janela principal, a descrição
dela diz *Oculta - clique para revelar*. Clique nela, ou pressione **A** num controle, para revelar
apenas aquela descrição. A busca ignora as descrições ainda mascaradas.

<div align="center">
<picture><source srcset="../assets/shot/overlay-hidden-800.webp 800w, ../assets/shot/overlay-hidden.webp 1162w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/overlay-hidden.png" width="560" height="482" alt="A lista do overlay duas vezes: descrições ocultas mascaradas e depois uma revelada" loading="lazy" decoding="async"></picture><br>
<sub>Antes e depois de um clique em "We've all been there before...": apenas aquela descrição é revelada</sub>
</div>

## Busca e filtros {#search-and-filters}

- A caixa de busca filtra as linhas por nome e descrição da conquista enquanto você digita.
- As pílulas acima da lista alternam entre **Todas**, **Desbloqueadas**, **Bloqueadas** e **Em andamento**.
- Clicar no cabeçalho da coluna **Raridade**, **Data** ou **Estado** ordena de forma crescente, depois decrescente
  e depois volta à ordem natural. Só uma coluna é ordenada por vez.
- `/` leva o foco à caixa de busca. `Esc` a limpa, ou fecha o painel de opções se ele estiver aberto.

## Controle (gamepad) {#controller-gamepad}

Ative **Controlar o overlay no jogo com um controle** em **Configurações → Controle** para operar o
overlay com um gamepad. Com as atribuições padrão:

- **Back + Start + LB** abre ou fecha o overlay.
- **LB + X** alterna o modo de navegação: um anel de foco mostra onde você está e um pequeno selo **UI**
  aparece no cabeçalho do overlay.
- No modo de navegação, o direcional ou o analógico esquerdo move o foco, **A** confirma, **B** cancela, **X**
  leva o foco à busca e **Y** abre o painel de opções.
- Segurar **LB + RB** move o overlay com o analógico esquerdo e rola a lista com o analógico
  direito.

Todo atalho é configurável, os nomes dos botões seguem o layout que você escolher e a barra de dicas do overlay
mostra as suas atribuições. O [guia do controle](controller.md) cobre as configurações, os controles compatíveis
e a ressalva do Windows sobre o jogo continuar vendo os botões que você pressiona.

## Personalização {#customization}

O botão **⚙** no cabeçalho do overlay abre as opções:

- **Destaque**: cinco predefinições de cor, um seletor de cor personalizada ou **Usar o tema do aplicativo** para seguir o tema da
  janela principal (usado em progresso, filtros ativos, anéis de foco e no brilho das linhas desbloqueadas).
- **Densidade**: espaçamento de linhas Compacto, Confortável ou Espaçoso.
- **Tamanho dos ícones**: Pequeno, Médio ou Grande.
- **Zoom**: de 80% a 125% do tamanho do painel.
- **Opacidade**: de 40% a 100% do fundo do painel.
- **Interruptores de exibição** para a barra de estatísticas, as barras de progresso, os selos de raridade e as descrições.

As mudanças são aplicadas na hora e salvas localmente. **Restaurar padrões** devolve o visual original. As
opções funcionam pelo teclado: os menus de zoom e opacidade mostram um anel de foco, os interruptores alternam com
Tab e Espaço, e as animações seguem a configuração de movimento reduzido do sistema.

## Atalhos de teclado (overlay aberto) {#keyboard-shortcuts-overlay-open}

- `Ctrl+Alt+Shift+Setas` - empurra a janela do overlay.
- `Ctrl+Alt+Shift+1` … `5` - encaixa numa posição predefinida.
- `Ctrl+Alt+Shift+C` - alterna o click-through.

## Observações {#notes}

- O overlay segue o idioma da interface selecionado no app.
- Depois da primeira abertura, a janela do overlay é mantida oculta e reutilizada por 5 minutos, então alternar
  de novo é quase instantâneo. Enquanto está oculta, ela pausa a leitura do controle e, depois de 5 minutos de
  inatividade, a janela é liberada para economizar memória.
- O conteúdo das linhas tem os caracteres especiais escapados antes da renderização; os dados das conquistas são apenas exibidos, nunca executados.
- A lista do overlay é separada dos presets de *notificação* pontual do overlay (Configurações →
  Notificação), onde a aparência do popup é configurada.

---

**Próximo:** [Guia do controle](controller.md) - operar o overlay e o app com um gamepad.

<div align="center">

[← Documentação](README.md) · [Guia de notificações](notifications.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
