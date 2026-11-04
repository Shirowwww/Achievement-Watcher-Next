---
title: "Rastreador de conquistas para Linux e Steam Deck"
description: "Instale o AppImage e mantenha-o atualizado, associe o overlay a uma tecla no GNOME ou KDE e execute jogos pela Steam, Proton, Lutris, Heroic ou Bottles."
---

# Rastreador de conquistas para Linux e Steam Deck

O AW Next roda no Linux (x64) como app nativo, nunca pelo Wine. Ele acompanha jogos executados pela Steam
e Proton, Wine, Lutris, Heroic ou Bottles, jogos nativos de Linux e os emuladores compatíveis, com a
mesma biblioteca, os mesmos popups, o mesmo overlay e o mesmo tempo de jogo do Windows.

A versão para Linux é um **beta**. Ela foi testada no GNOME e no KDE Plasma, em prefixos do Wine e do Proton e
com jogos de teste, mas não em muitas máquinas reais: um Steam Deck de verdade, gamepads de verdade, todos os launchers e
todas as releases scene. Se algo não funcionar, uma
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) com a sua distribuição, o desktop
e os logs ajuda mais.

## Instalação {#install}

1. Abra a [versão mais recente](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
   e baixe `Achievement.Watcher.<version>.AppImage`.
2. Coloque-o numa pasta sua, como `~/Applications`, e torne-o executável: no gerenciador de
   arquivos, **Propriedades → Permitir execução do arquivo como programa**, ou num terminal:

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. Inicie-o e siga o guia da primeira execução como no Windows (veja [Primeiros passos](getting-started.md)).

Um AppImage precisa do FUSE 2, que algumas distribuições, o Ubuntu 24.04 entre elas, não instalam mais por
padrão. Se o arquivo não iniciar, instale-o: `libfuse2t64` no Ubuntu 24.04 e posteriores, `libfuse2` no
Ubuntu e Debian mais antigos, `fuse-libs` no Fedora, `fuse2` no Arch.

Na primeira inicialização, o AW Next se adiciona ao menu de aplicativos. **Configurações → Geral → Iniciar com o sistema** o inicia, oculto na bandeja, a cada login. Configurações, caches, tempo de jogo e logs ficam em
`~/.config/Achievement Watcher Next`.

## Atualizações {#updates}

O AppImage se atualiza sozinho a partir das mesmas versões do GitHub do app para Windows. Uma nova versão é
anunciada por uma notificação do desktop e pelo selo na barra de título, e pede permissão antes de baixar. Depois
confere o arquivo com o digest SHA-512 publicado com a versão (`latest-linux.yml`), substitui
o AppImage antigo e reinicia. Se um jogo estiver em execução, a atualização espera ele fechar. Seus dados ficam
onde estavam.

O novo arquivo tem a nova versão no nome. A entrada **Iniciar com o sistema** e o
comando `~/.local/bin/achievement-watcher` o acompanham. Um launcher criado por você que cita o
arquivo do AppImage ainda aponta para o nome antigo, então aponte-o para esse comando.

## Desktops compatíveis {#supported-desktops}

O AW Next é testado no GNOME e no KDE Plasma, no Wayland e no X11 (Ubuntu 24.04 com GNOME 46 e
Plasma 5.27), e no Fedora 44 com GNOME 50, Plasma 6.7, Hyprland 0.56 e COSMIC 1.0, numa máquina
virtual. Outros desktops podem funcionar, mas não foram testados.

- **Wayland.** O AW Next reinicia a si mesmo uma vez pelo XWayland na inicialização para que os popups e o overlay
  fiquem acima dos jogos, que rodam como janelas X11 no Wine e no Proton. O Hyprland e o COSMIC iniciam o XWayland
  por padrão. Sem ele (`xwayland.enabled = false` no Hyprland), o AW Next continua sendo um app Wayland nativo:
  a biblioteca, a bandeja e as notificações funcionam, mas o compositor posiciona os popups e o overlay como
  qualquer janela, e um popup tira o teclado do jogo enquanto aparece.
- **Bandeja.** O KDE e o COSMIC mostram o ícone da bandeja como está. O GNOME precisa da extensão AppIndicator, que
  o Ubuntu traz ativada. O Hyprland precisa de uma barra com bandeja, como a Waybar com o módulo `tray`.
  Sem bandeja, fechar a janela minimiza o AW Next em vez de ocultá-lo; o Hyprland não tem janelas
  minimizadas, então lá ele oculta, e iniciar o AW Next de novo traz a janela de volta.
- As **notificações** são as do próprio desktop. O Não Perturbe as oculta, a menos que **Configurações → Notificação →
  Notificações prioritárias** esteja ativado, caso em que os desbloqueios ainda aparecem no GNOME e no KDE. O Hyprland não tem
  nada próprio: execute um daemon de notificações como mako, dunst ou SwayNC. O mako desenha sob um jogo em tela
  cheia, a menos que a configuração dele defina `layer=overlay`, e mantém cada notificação até você clicar, a menos que
  defina `default-timeout` (em milissegundos). O COSMIC retém as notificações enquanto um jogo está em tela
  cheia. O popup do próprio AW Next aparece acima do jogo de qualquer forma.
- As opções que existem somente no Windows são marcadas como tal nas Configurações.

## Capturas de tela e clipes {#screenshots-and-clips}

Capturas de tela e clipes de cada desbloqueio funcionam no X11 e no Wayland. Os clipes são gravados pelo
gpu-screen-recorder com a placa de vídeo quando ele está instalado. Se você o escolher nas Configurações, o gravador
por software do próprio AW Next salva arquivos WebM e mostra quanto isso custou.

No Wayland, a primeira captura de tela faz o desktop perguntar se os apps podem fazer capturas (GNOME 47
e posteriores, KDE Plasma 6, COSMIC e Hyprland). O AW Next espera alguns segundos pela resposta e depois ignora
essa captura, e as dos desbloqueios que chegam enquanto a pergunta está aberta. Clique em **Permitir**, pois Enter
escolhe **Negar** no GNOME e no Hyprland, e as capturas seguintes são feitas sem uma palavra. Se você negar,
o AW Next não faz capturas e não pergunta de novo. Para ser perguntado de novo na próxima captura,
execute:

```bash
flatpak permission-remove screenshot screenshot
```

O gravador por software captura a tela pela caixa de diálogo de compartilhamento de tela do desktop, que
volta a cada vez que um jogo inicia e, no COSMIC e no Hyprland, tira o jogo da tela cheia.
O gpu-screen-recorder pergunta uma vez.

## Atalho do overlay {#overlay-shortcut}

`Ctrl+Shift+K` abre o overlay enquanto um jogo do Wine ou do Proton tem o foco. No Wayland, o AW Next não consegue
ver uma tecla pressionada enquanto uma **janela Wayland nativa** tem o foco, como um jogo Linux em modo Wayland ou
o Proton com o driver Wayland. Não há atalho dentro do jogo para esses jogos.

Um atalho das configurações de teclado do desktop não depende disso. Faça-o executar este comando,
com `you` substituído pelo seu nome de usuário (o GNOME não expande `~`, então escreva o caminho completo):

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

Ele abre ou fecha o overlay da cópia já em execução e não inicia mais nada. O comando existe
desde a primeira inicialização do AppImage, e o AW Next o atualiza a cada inicialização, então ele acompanha as atualizações.

- **GNOME:** **Configurações → Teclado → Ver e personalizar atalhos → Atalhos personalizados → Adicionar atalho**.
  Dê um nome, cole o comando e pressione as teclas que quiser.
- **KDE Plasma 6:** **Configurações do sistema → Teclado → Atalhos → Adicionar novo → Comando ou script**, cole
  o comando e defina o atalho.
- **KDE Plasma 5:** **Configurações do sistema → Atalhos → Atalhos personalizados → Editar → Novo → Atalho global →
  Comando/URL**. Defina as teclas em **Gatilho** e o comando em **Ação**.
- **Hyprland** 0.55 e posteriores, em `~/.config/hypr/hyprland.lua`:

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  Num `hyprland.conf` mais antigo, a mesma linha fica
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`.
  O Hyprland recebe as teclas antes de qualquer janela, então um pressionamento abre ou fecha o overlay uma vez,
  seja qual for o jogo.
- **COSMIC:** **Configurações → Dispositivos de entrada → Teclado → Atalhos de teclado → Atalhos personalizados → Adicionar
  atalho**. Preencha **Nome do atalho** e **Comando** e depois digite as teclas. Funciona também sobre um jogo
  Wayland nativo. A opção do COSMIC **Atalhos globais em aplicativos X11** não ajuda: o AW Next
  continua sem ver as teclas ali.

No Hyprland e no COSMIC, o overlay aparece acima de um jogo em tela cheia, Wine ou Wayland nativo. Com
**Focar o overlay ao abrir** ativado (veja o [guia do Controle](controller.md)), ambos tiram o jogo
da tela cheia para exibi-lo. No Hyprland, esta regra de janela mantém o jogo em tela cheia e o overlay
acima dele:

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

Um controle também funciona. O AW Next lê os gamepads diretamente, então os atalhos de controle do
[guia do Controle](controller.md) abrem e operam o overlay sem tirar nada do jogo.
Enquanto o Steam Input está em execução, o AW Next lê apenas os controles virtuais da Steam, para que um pressionamento não seja contado duas vezes.

## Pedido do chaveiro {#keyring-prompt}

Os poucos segredos que o AW Next guarda (os tokens de login da Steam, Epic, Xbox e PlayStation, a chave do RetroAchievements,
uma senha Steam de emulador) são criptografados com uma chave guardada pelo chaveiro do desktop: GNOME Keyring
ou KDE Wallet. O Hyprland não tem um próprio e usa o instalado, que inicia quando o AW Next o
pede pela primeira vez.

Com o **login automático**, o chaveiro não é desbloqueado quando a sessão começa. Na primeira vez que o AW Next
precisa dele, o desktop pede para você desbloqueá-lo, ou criar um se não houver; o KDE abre o assistente do KDE
Wallet. Responda e o AW Next segue em frente. Se você cancelar, o AW Next continua funcionando, avisa uma vez que
suas conexões não estão protegidas, e o desktop pergunta de novo na próxima inicialização. O pedido nunca
bloqueia o app: rastreamento e notificações funcionam enquanto ele está aberto.

## Steam e Proton {#steam-and-proton}

O AW Next encontra o cliente da Steam venha ele da sua distribuição (`steam-installer`, `steam`),
do Flathub ou como Snap, junto com as pastas de biblioteca em outros discos e o prefixo do Proton de cada jogo.
Com dois clientes Steam instalados, ele segue o que foi iniciado por último.

Os desbloqueios dos jogos que a própria Steam executa são lidos dos arquivos da Steam, como no Windows. O AW Next os exibe
apenas quando **Configurações → Notificação → Jogos do cliente Steam** está ativado, já que a Steam mostra um popup próprio para
eles.

## Wine, Lutris, Heroic e Bottles {#wine-lutris-heroic-and-bottles}

Toda fonte é lida dentro do prefixo do jogo, o registro do Windows incluído: um jogo com um emulador da Steam
(Goldberg, GBE Fork e os demais em [Fontes compatíveis](sources.md)), um save da Ubisoft ou da GOG,
e assim por diante. A **Busca inteligente** pesquisa a sua pasta pessoal, seus outros discos e todos os prefixos que conhece.

- **Lutris** e **Bottles**: os jogos e programas que instalaram são listados com o prefixo deles.
- **Heroic**: os jogos da Epic instalados pelo Heroic são reconhecidos como jogos da Epic.
- **Wine puro**: o prefixo padrão `~/.wine` e qualquer pasta de prefixo que você adicionar.
- **Jogos nativos de Linux** com Goldberg ou GBE Fork (`libsteam_api.so`) são lidos das pastas de save
  deles no Linux.

**Jogar** inicia um jogo pelo launcher a que ele pertence (Steam, Lutris, Heroic), e o tempo de jogo é
contado a partir do processo do jogo. Os reparos de emulador do [Estado do jogo](game-health.md) funcionam a partir do
AppImage e gravam dentro do prefixo do jogo, com um backup como sempre.

## Emuladores {#emulators}

RPCS3, shadPS4, RetroArch e Xenia são encontrados nas pastas deles no Linux; RPCS3 e shadPS4 também quando
vêm do Flathub. Os desbloqueios do RetroAchievements são anunciados seja qual for o emulador, depois que a fonte é
conectada.

## Steam Deck {#steam-deck}

O suporte ao Steam Deck é novo e **não foi verificado num Deck de verdade**. O que ele pretende fazer:

- No **Modo Desktop**, o AW Next é o mesmo AppImage de qualquer desktop Linux. A primeira janela se ajusta à tela de
  1280x800 do Deck, e os jogos no cartão microSD são encontrados.
- Com **Iniciar com o sistema** ativado, o AW Next também roda no **Modo Jogo**: ele inicia como serviço em segundo plano
  assim que a Steam está no ar.
- O Modo Jogo não mostra notificações do desktop, então o AW Next desenha cada desbloqueio como um popup próprio sobre o
  jogo, a partir do canto superior esquerdo. O overlay de desempenho do SteamOS pode ocultar esse popup.
- O **plugin Decky** na pasta `decky/` do repositório envia cada desbloqueio às notificações da própria Steam,
  que o Modo Jogo sempre desenha. Enquanto ele escuta, o AW Next mantém o próprio popup desligado, para que
  você veja uma só notificação. Sem o plugin, o popup é a alternativa. Por enquanto você o instala
  à mão: compile-o (`npm install` e depois `npm run build`) e copie-o para
  `~/homebrew/plugins/achievement-watcher/`, como explica o
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md) dele.
  Ele precisa do AW Next em execução com o feed websocket ativado, que é o padrão.

O popup foi verificado numa sessão de Modo Jogo reproduzida num PC, e o plugin Decky tem apenas testes
unitários. Se você experimentar qualquer um dos dois num Deck de verdade, uma
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) dizendo o que viu ajuda.

## Relatar um problema {#reporting-a-problem}

Inclua a sua distribuição, o desktop (GNOME ou KDE, Wayland ou X11), como o jogo roda (Steam com Proton,
Lutris, Heroic, Bottles, Wine) e os arquivos em `~/.config/Achievement Watcher Next/logs`.

---

**Próximo:** [Solução de problemas](troubleshooting.md), para problemas de detecção, progresso, notificações e tempo
de jogo.

<div align="center">

[← Documentação](README.md) · [Primeiros passos](getting-started.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
