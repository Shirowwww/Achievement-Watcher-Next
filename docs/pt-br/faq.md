---
title: "Perguntas frequentes sobre o rastreador de conquistas"
description: "Respostas curtas sobre contas, fontes, notificações, segurança, backups e plataformas compatíveis com o Achievement Watcher Next."
---

# Perguntas frequentes sobre o rastreador de conquistas

Respostas curtas para as dúvidas mais comuns. Cada uma leva ao guia que trata do assunto.

## Como começar {#getting-set-up}

### Preciso de uma chave da Steam Web API ou de entrar na Steam? {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
Não. As listas de conquistas vêm de uma cadeia de endpoints públicos que não exige chave, e nada exige uma
conta. Seus desbloqueios da Steam são lidos das estatísticas que a Steam guarda neste PC, então um perfil privado
funciona para todos os jogos jogados aqui. Conectar a Steam é opcional: acrescenta jogos jogados apenas em
outros PCs seus e a Família Steam. Veja [Contas conectadas](sources.md#connected-accounts).

### Em quais plataformas ele funciona? {#which-platforms-does-it-run-on}
Windows 10 e 11, e Linux (x64). As versões incluem o próprio runtime. O Node.js só é necessário para
compilar a partir do código-fonte.

### Funciona no Linux ou no Steam Deck? {#does-it-run-on-linux-or-the-steam-deck}
No Linux, sim, como beta: um AppImage nativo (nunca executado pelo Wine) para GNOME e KDE Plasma, no
Wayland ou no X11. Ele encontra jogos executados com Steam e Proton, Wine, Lutris, Heroic ou Bottles, e se atualiza
sozinho a partir das mesmas versões do app para Windows. No Steam Deck, o suporte é novo e não foi
verificado num Deck de verdade. Veja [Linux e Steam Deck](linux.md).

### Ele é compatível com o RetroAchievements? {#does-it-support-retroachievements}
Sim. Ative a fonte **RetroAchievements**, conecte sua conta com o nome de usuário e a chave Web API,
e **Importar biblioteca** traz todos os jogos que você jogou. Os novos desbloqueios são anunciados enquanto qualquer
emulador compatível com o RetroAchievements está em execução. Veja [RetroAchievements](sources.md#retroachievements).

### Ele mostra os troféus da PlayStation? {#does-it-show-playstation-trophies}
Sim. Conecte sua conta da PlayStation em **Configurações → Fonte** (você faz login na página da Sony) e seus
jogos e troféus são importados, com a taxa da Sony para cada troféu. Um jogo de outra fonte que
também saiu na PlayStation mostra a platina real da sua lista. Veja
[Contas conectadas](sources.md#connected-accounts).

### Preciso conectar uma conta? {#do-i-have-to-connect-an-account}
Não. Steam, Epic, Xbox PC e PlayStation podem ser conectadas para ler o que os arquivos locais não trazem,
e o RetroAchievements pede seu nome de usuário e a chave Web API. Todo token e chave é criptografado antes de
ser guardado neste PC. Todo o resto funciona sem conta.

### Funciona offline? {#does-it-work-offline}
Sim, para fontes locais e tudo o que já está em cache. Nomes, descrições e arte das conquistas são
buscados uma vez e depois reutilizados de `%APPDATA%\Achievement Watcher Next\steam_cache`
(`~/.config/Achievement Watcher Next/steam_cache` no Linux).

### Perco alguma coisa ao escolher o modo Simples? {#do-i-lose-anything-by-choosing-simple-mode}
Não. O Simples oculta controles e nunca desativa um recurso. Nada do que varre, observa ou é guardado
muda, e voltar restaura cada controle com o valor dele. Veja
[Primeiros passos](getting-started.md#simple-and-advanced).

### Ele pode mostrar jogos que tenho mas nunca instalei, ou desbloqueios de outro PC? {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
Sim. Com a fonte Steam definida como **Na biblioteca**, dois interruptores no cartão da conta Steam, **Adicionar os jogos
que você possui** e **Adicionar os jogos compartilhados com você pela Família Steam**, listam sua biblioteca inteira. Os dois
vêm desativados por padrão porque uma biblioteca grande alonga muito a primeira varredura. Com uma conta Steam
conectada, um jogo sem nada para ler localmente é lido do seu perfil Steam (os detalhes do jogo
precisam ser públicos) e a resposta fica em cache por seis horas. Veja
[Contas conectadas](sources.md#connected-accounts).

## A biblioteca {#the-library}

### Um jogo está ausente {#a-game-is-missing}
Verifique se a fonte dele está ativada em **Configurações → Fonte**, execute a **Busca inteligente** em **Configurações →
Pastas** e desative **Mostrar apenas os jogos instalados** para ver se o jogo é conhecido mas não está mais
instalado. A lista completa de verificações está em [Solução de problemas](troubleshooting.md#a-game-is-missing).

### Um jogo mostra "Sem conquistas" {#a-game-shows-no-achievements}
Esse jogo não tem um conjunto de conquistas. Ele continua podendo ser iniciado e rastreia o tempo de jogo, e fica de fora
das estatísticas de conclusão em vez de contar como 0%. O cartão dele mostra a arte onde estaria a barra de progresso.
**Configurações → Aparência → Cartões da biblioteca → Barra de jogos sem conquistas** traz a
barra de volta.

### Um jogo mostra 0% embora eu tenha desbloqueado conquistas {#a-game-shows-0-although-i-have-unlocked-achievements}
O jogo tem um esquema, mas nenhum arquivo de desbloqueio em execução. Abra o painel [Estado do jogo](game-health.md) dele: ele
aponta a peça que falta e oferece apenas os reparos que se aplicam.

### Por que o mesmo jogo aparece duas vezes? {#why-does-the-same-game-appear-twice}
Ele foi encontrado por duas fontes. **Mesclar duplicados** em Configurações → Geral os combina. Se uma
entrada é uma pasta de saves antiga de um jogo que você agora tem em outro lugar, coloque-a na lista negra.

### Uma atualização do jogo adicionou conquistas e não as vejo {#a-game-update-added-achievements-and-i-do-not-see-them}
Uma lista em cache se reverifica a cada 3 dias. Para pegar as novas agora, use **Configurações → Avançado →
Reverificar listas de conquistas**, que funciona mesmo com **Atualizações automáticas de dados de conquistas** desativadas. Nenhuma das
verificações remove nada que já esteja em cache.

### Um jogo foi associado à versão errada da Steam {#a-game-was-matched-to-the-wrong-steam-release}
Clique com o botão direito e escolha **Definir o AppID manualmente...**. O AppID é gravado em `steam_appid.txt` e
lembrado para aquela pasta de instalação. Veja [Definir o AppID de um jogo manualmente](advanced.md#set-a-games-appid-by-hand).

## Notificações {#notifications}

### Nada aparece quando desbloqueio algo {#nothing-appears-when-i-unlock-something}
Comece pela linha Notificações do painel [Estado do jogo](game-health.md) desse jogo, que indica o
meio que entregou por último e por quê. Depois siga
[Se um teste ou desbloqueio não aparecer](notifications.md#if-a-test-or-unlock-does-not-appear).

### O popup do overlay não aparece em um jogo específico {#the-overlay-popup-does-not-show-in-one-particular-game}
Esse jogo provavelmente está em tela cheia exclusiva, onde um popup sempre visível não pode ser desenhado. No
**Automático**, o AW Next envia esse desbloqueio como uma notificação do Windows exibida sobre o jogo. Um jogo em
modo exclusivo legado não deixa passar nada: mude-o para sem bordas. Veja
[como o Automático decide](notifications.md#how-automatic-decides).

### As notificações ficam ocultas enquanto jogo {#notifications-are-hidden-while-i-play}
Isso é o Não Perturbe do Windows. Ative as **Notificações prioritárias** e aprove o pedido único do Windows. Veja [Notificações prioritárias do Windows](notifications.md#priority-windows-notifications).

### Posso mudar o visual do popup ou compartilhar um design? {#can-i-change-how-the-popup-looks-or-share-a-design}
Sim. Dez presets acompanham o app, o **Preset Designer** cria os seus com controles comuns,
e qualquer preset é exportado para um único arquivo `.awpreset`. Veja [Presets e o Preset Designer](presets.md).

### Posso mostrar os desbloqueios na minha transmissão? {#can-i-put-unlocks-on-my-stream}
Sim, com uma fonte Navegador no OBS. Capturar o popup como janela não funciona, já que ele existe para
um desbloqueio e some antes de o OBS listá-lo, então o AW Next serve o mesmo popup como uma página. O endereço está
em Configurações → Notificação → **Fonte de navegador do OBS**. Veja
[Mostrar desbloqueios na transmissão (OBS)](notifications.md#show-unlocks-on-stream-obs).

### O overlay é a mesma coisa que o popup? {#is-the-overlay-the-same-thing-as-the-popup}
Não. O popup é uma notificação pontual estilizada por um preset. O **overlay** é a lista completa de conquistas
que você abre com `Ctrl+Shift+K` enquanto um jogo está em execução. Veja o [guia do Overlay](overlay.md).

### No Linux, Ctrl+Shift+K não faz nada no meu jogo {#on-linux-ctrlshiftk-does-nothing-in-my-game}
No Wayland, o AW Next não consegue ver as teclas pressionadas enquanto uma janela Wayland nativa tem o foco, como um
jogo Linux em modo Wayland ou o Proton com o driver Wayland. Associe uma tecla nas configurações de teclado do desktop
a `/home/you/.local/bin/achievement-watcher --toggle-overlay`, com o seu nome de usuário no lugar
de `you`. O AW Next mantém esse comando apontando para o AppImage atual, então o atalho sobrevive às
atualizações. Veja [Atalho do overlay](linux.md#overlay-shortcut).

## Segurança e dados {#safety-and-data}

### O AW Next modifica meus jogos ou envia algo para fora do meu PC? {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
Só quando você pede. Ler conquistas é somente leitura. As ferramentas de reparo de emuladores (o submenu
**Emulador e ferramentas** do botão direito de um jogo e **Configurações → Emuladores**) gravam numa pasta de jogo, sempre
após uma confirmação e com um backup. Use-as apenas com jogos que você possui. Além das consultas somente leitura
e do que uma conta conectada devolve, nada sai deste PC. Veja
[O que sai deste PC](README.md#what-leaves-this-pc).

### Meu antivírus sinalizou ou removeu um arquivo {#my-antivirus-flagged-or-removed-a-file}
É quase certamente o emulador da Steam ou um loader da Ubisoft, e um falso positivo: esses arquivos substituem
a biblioteca Steam ou Ubisoft de um jogo, que é o comportamento que os mecanismos de detecção procuram. Nada é
gravado a menos que você tenha executado um reparo, aberto **Configurações → Emuladores** ou ativado o reparo automático. Permita
o arquivo que o antivírus citou, ou exclua `%APPDATA%\Achievement Watcher Next\cache`. Nunca desative
a proteção. Veja [Solução de problemas → Antivírus](troubleshooting.md#antivirus-or-smartscreen-warning).

### O Windows SmartScreen avisa sobre o instalador {#windows-smartscreen-warns-about-the-installer}
As versões são assinadas com o certificado do próprio projeto, fixado pela impressão digital, e não com um comercial,
então o SmartScreen pode pedir confirmação. Você nunca precisa instalar esse certificado: o atualizador do app
verifica o signatário, a impressão digital fixada e se o arquivo foi modificado depois da assinatura
antes de instalar qualquer coisa. Baixe somente da
[página oficial de releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases). Para conferir um
instalador por conta própria, execute `Get-FileHash <installer> -Algorithm SHA256` e abra
`https://www.virustotal.com/gui/file/<hash>`. A versão atual é a
[3.12.7](https://www.virustotal.com/gui/file/183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96).
Veja [Solução de problemas → Conferir uma versão por conta própria](troubleshooting.md#checking-a-release-yourself).

### No Linux, por que aparece um pedido do chaveiro? {#on-linux-why-does-a-keyring-prompt-appear}
O AW Next criptografa seus tokens de login com uma chave guardada pelo chaveiro do desktop (GNOME Keyring ou KDE
Wallet). Com o login automático, o chaveiro continua bloqueado, então o desktop pede para você desbloquear ou criar
um quando o AW Next inicia. Cancelar é seguro: o app continua funcionando e o pedido volta na próxima
inicialização. Veja [Pedido do chaveiro](linux.md#keyring-prompt).

### Onde estão meus dados, atualizar os perde e qual o tamanho das atualizações? {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
Tudo fica em `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next` no Linux),
e instalar uma build mais nova os mantém. A primeira execução após a atualização importa uma pasta antiga do Achievement
Watcher sem modificá-la nem excluí-la. As atualizações baixam apenas o que mudou desde a versão
instalada e voltam sozinhas a um download completo se isso falhar. Veja
[Atualizações e dados existentes](getting-started.md#updates-and-existing-data).

### Como me mudo para um PC novo ou faço backup da minha configuração? {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**Configurações → Avançado → Backup do perfil → Exportar perfil…** grava suas configurações, escolhas de biblioteca,
presets, temas, capas e tempo de jogo num único arquivo `.awbackup`. Instale o AW Next no PC novo, escolha
**Restaurar perfil…**, e ele é aplicado na próxima inicialização; os arquivos que ele substitui são mantidos. Os logins
nunca são salvos, então conecte de novo Steam, Epic, Xbox, PlayStation e RetroAchievements. Veja
[Backup do perfil](advanced.md#profile-backup).

### Existe uma versão portátil? {#is-there-a-portable-version}
Sim. O ZIP portátil mantém o app e os dados dele numa só pasta e consulta o mesmo feed de releases do app
instalado. Ele nunca baixa nem executa o instalador: oferece a página da versão quando uma mais nova
sai, e extrair o novo arquivo sobre a pasta antiga mantém seus dados.

### Como saio completamente? {#how-do-i-quit-completely}
Fechar a janela mantém o AW Next na bandeja do sistema, e o rastreamento continua. Use o menu da bandeja para sair.

## O projeto {#the-project}

### Funciona com jogos Goldberg, GBE Fork e CODEX? {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
Sim. O AW Next lê os arquivos de conquistas que Goldberg, GBE Fork, CODEX, RUNE e CPY gravam, e pode
instalar e reparar o runtime do GBE Fork para um jogo. Veja [Fontes compatíveis](sources.md) e
[Configuração do Goldberg e GBE Fork](emulator-setup.md).

### É o mesmo app que o Achievement Watcher do Xan105? {#is-this-the-same-app-as-xan105s-achievement-watcher}
Não, é uma continuação. O AW Next continua o Achievement Watcher do Xan105 e o ramo 2.x do darktakayanagi,
num runtime Electron atual, com suporte ao Linux, mais fontes e um relatório de estado por jogo
com reparos guiados. Veja a [Comparação](comparison.md).

### É seguro usar com jogos crackeados? {#is-it-safe-to-use-with-cracked-games}
Ler conquistas é somente leitura. As ferramentas de reparo gravam numa pasta de jogo apenas após uma confirmação e
com um backup, e o reparo automático vem desativado por padrão. Use-as apenas com jogos que você possui. Um antivírus
pode sinalizar um arquivo de emulador como falso positivo. Veja
[Solução de problemas → Antivírus](troubleshooting.md#antivirus-or-smartscreen-warning).

### Em que ele difere do Achievement Watcher 2.x? {#how-does-this-differ-from-achievement-watcher-2x}
O AW Next o continua com um runtime moderno e uma grande revisão de compatibilidade, confiabilidade e
recursos. Veja a [Comparação](comparison.md).

### Ele pode me arranjar jogos, chaves ou contas? {#can-it-get-me-games-keys-or-accounts}
Não, e o rastreador de issues também não pode ajudar com isso. O AW Next não contém arquivos de jogos e não
contorna verificações online de propriedade.

### Encontrei um bug ou tenho uma ideia {#i-found-a-bug-or-have-an-idea}
[Abra uma issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) com a versão do app,
a versão do seu Windows (ou a distribuição e o desktop Linux), a fonte envolvida e os logs relevantes.
Relate uma suspeita de vulnerabilidade em particular pela
[política de segurança](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md). Para uma
dúvida, ou ajuda antes de saber se é um bug, pergunte no [servidor do Discord](https://discord.gg/DjTMrDsXTh).

---

**Ainda travado?** A [Solução de problemas](troubleshooting.md) percorre cada sintoma em ordem.

<div align="center">

[← Documentação](README.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
