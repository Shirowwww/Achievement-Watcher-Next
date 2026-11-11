---
title: "Fontes compatíveis"
description: "Todas as fontes de jogos que o Achievement Watcher Next lê - Steam, GOG, Epic, Ubisoft, EA, Xbox PC, emuladores e RetroAchievements - e o que cada uma exige."
---

# Fontes compatíveis

Uma **fonte** é um lugar de onde o AW Next lê conquistas: os dados locais de um launcher, um arquivo de
save compatível com a Steam ou o arquivo de troféus de um emulador de console. Cada fonte tem o próprio
interruptor em **Configurações → Fonte**.

O AW Next lê Steam, GOG Galaxy, Ubisoft Connect, Epic Games, Xbox PC, o registro local de conquistas do
EA Desktop, RetroAchievements, emuladores de console e os arquivos de save de emuladores da Steam como Goldberg,
GBE Fork, CODEX, RUNE e CPY. Ele não precisa de chave da Steam Web API nem de conta.

<div align="center">
<picture><source srcset="../assets/shot/sources-panel-800.webp 800w, ../assets/shot/sources-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/sources-panel.png" width="720" height="529" alt="Configurações - Fontes de jogos"></picture><br>
<sub>Cada fonte é um interruptor separado; o escudo marca as bibliotecas oficiais de desktop</sub>
</div>

Depois de ativar uma fonte, atualize a biblioteca. Só são exibidas as bibliotecas detectadas neste PC.

## Bibliotecas oficiais das plataformas {#official-platform-libraries}

Elas leem os dados locais do próprio launcher e têm um escudo nas Configurações.

| Fonte | O que o AW Next lê | O que ela exige |
|---|---|---|
| **Steam** | O estado local do appcache, os dados do perfil público, os esquemas de conquistas e os metadados dos produtos | Steam instalada; conectar uma conta é opcional |
| **GOG Galaxy** | Os bancos de dados locais do cliente Galaxy, mais saves legados compatíveis e o UniverseLAN | GOG Galaxy instalado, ou um jogo executando o UniverseLAN |
| **Ubisoft Connect** | Dados locais nativos e formatos legados do Uplay | Ubisoft Connect instalado |
| **Epic Games** | As instalações locais, mais os jogos da conta e o estado oficial das conquistas deles depois de conectar | O launcher da Epic Games para as instalações locais; uma conta conectada para o resto |
| **Xbox PC** | As instalações locais do Game Pass e da Microsoft Store, mais os jogos da conta e o estado deles na Xbox Network | O app Xbox para as instalações locais; uma conta conectada para o resto |
| **Rockstar Games Launcher** | Os jogos que ele instalou, com a lista de conquistas da versão Steam | O Rockstar Games Launcher instalado |

**Steam**, **Epic Games** e **Xbox PC** têm cada uma três opções: **Nenhum**, **Instalados** (jogos neste
PC) ou **Na biblioteca** (toda a biblioteca da conta). **Na biblioteca** lista também jogos que não estão
instalados aqui e exige a conta conectada descrita abaixo. A **GOG Galaxy** oferece **Nenhum**, **Instalados**
ou **Jogados**: a Galaxy guarda os dados de jogo de um título mesmo depois de ele ser desinstalado, e **Jogados** ainda
lista esses jogos.

**Bibliotecas Steam**, sob o cartão da conta Steam, lista todas as pastas de biblioteca da Steam neste PC. Desative
uma e os jogos dela saem da lista, todos eles, por exemplo uma unidade que você mantém conectada como
armazenamento. Eles voltam quando você a ativa de novo.

> [!NOTE]
> Os desbloqueios da Steam são lidos das estatísticas que a Steam guarda neste PC. Um perfil privado, ou
> **Detalhes do jogo** privados, funciona para todos os jogos jogados aqui, inclusive os jogos adicionados por SteamTools,
> LuaTools ou GreenLuma, e um cartão é atualizado no momento em que a Steam registra um desbloqueio. Um perfil público só acrescenta o seu
> nome e o seu avatar. Os jogos jogados somente em outro PC exigem a conta conectada descrita abaixo. Esses desbloqueios
> geram uma notificação do AW Next quando **Jogos do cliente Steam** está ativado em Notificação (veja
> [Notificações](notifications.md#games-steam-runs)).

> [!NOTE]
> O **EA Desktop** é diferente: ele lê o registro local de conquistas do EA Desktop para jogos fora das pastas
> gerenciadas pela EA, e não importa a sua biblioteca normal da EA.

> [!NOTE]
> Os jogos do **Rockstar Games Launcher** mostram todas as conquistas bloqueadas. O Social Club guarda quais você desbloqueou em um arquivo criptografado com a chave da sua conta, que o AW Next ainda não consegue ler.

### Contas conectadas {#connected-accounts}

Steam, Epic, Xbox PC e PlayStation podem ser conectadas nas Configurações para ler o que os arquivos locais
não trazem. Cada token é criptografado antes de ser guardado neste PC, e todo o resto funciona
sem nenhuma conta.

| Conta | O que conectar acrescenta |
|---|---|
| **Steam** | Dois interruptores, desativados por padrão e exibidos enquanto a fonte Steam está em **Na biblioteca**: **adicionar os jogos que você possui** e **adicionar os jogos compartilhados com você pela Família Steam**. Eles permitem que um perfil privado, ou um que nunca instalou aqui a maior parte da biblioteca, liste os jogos certos. Cada um deixa a primeira varredura visivelmente mais longa, já que cada jogo adicionado resolve uma vez as suas conquistas e a sua arte. Um jogo sem nada para ler localmente passa então a ser lido do seu perfil Steam, o que exige os detalhes do jogo públicos; a resposta fica em cache por seis horas. **Ocultar jogos que não estão mais na sua biblioteca Steam** remove as sobras, mas nunca um jogo instalado aqui ou compartilhado pela Família Steam. Você faz login na própria página da Valve. |
| **Epic Games** | Suas conquistas desbloqueadas e, com **Na biblioteca**, a biblioteca inteira: cada jogo com a lista completa, o estado de desbloqueio e a raridade. Alguns jogos da conta têm conquistas que os dados da loja da Epic nunca listam (Shadow of the Tomb Raider, Civilization VI). Eles ainda são listados, a partir do games-infos-datas do Nemirtingas, mas sem estado de desbloqueio, que a Epic não compartilha nem com o login feito. Nomes, descrições e raridade de um jogo instalado funcionam sem conta. |
| **Xbox PC** | Estado de desbloqueio e raridade da Xbox Network para a sua biblioteca, em cache local. Com **Na biblioteca**, traz também jogos que a conta só jogou em outro lugar. |
| **PlayStation** | Seus jogos da PlayStation e troféus, com a taxa oficial da Sony para cada troféu, atualizados a cada três dias em segundo plano. Um jogo que você não possui pode ser adicionado pelo nome a partir do catálogo da Sony, e removido da mesma forma. Um jogo de qualquer outra fonte que também saiu na PlayStation mostra a platina real da sua lista e, no modo troféus, as classificações reais e os grupos de DLC (veja [Notificações](notifications.md#trophy-mode)). Você faz login na própria página da Sony. |

Um cartão traz um pequeno selo para o que a conexão estabeleceu: comprado naquela loja, compartilhado pela
Família Steam, ou não está mais na sua biblioteca.

## Saves compatíveis com a Steam {#steam-compatible-saves}

O AW Next lê os arquivos de conquistas e estatísticas que os emuladores da Steam gravam (`achievements.json`,
`achievements.ini`, `achievements.bin`, `stats.ini` e estruturas compatíveis) nos lugares que essas
ferramentas usam. Isso abrange o **Goldberg** e o **GBE Fork** (que o AW Next também pode instalar e reparar),
o **GreenLuma**, o **LumaPlay**, o **SmartSteamEmu**, o **CreamAPI**, os emuladores **Nemirtingas** e releases scene
com estrutura compatível. Para um jogo cujos arquivos estão em outro lugar, adicione a pasta em
**Configurações → Pastas**.

<div align="center">
<picture><source srcset="../assets/shot/folders-panel-800.webp 800w, ../assets/shot/folders-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/folders-panel.png" width="720" height="529" alt="Configurações - Pastas" loading="lazy" decoding="async"></picture><br>
<sub>As pastas que o AW Next verifica sozinho e as que você adiciona - saves de jogos individuais ou bibliotecas inteiras</sub>
</div>

Uma versão portátil de CODEX, RUNE ou CPY normalmente grava em `%PUBLIC%\Documents\Steam\<SOURCE>\<appid>`,
mas uma cópia portátil mantém essa árvore dentro da pasta do jogo, onde nada a procura. Basta adicionar
a pasta do próprio jogo em **Configurações → Pastas**: o `steam_emu.ini` (ou `cpy.ini`) dela informa o
AppID, e a árvore de saves é procurada ao lado dele antes do local compartilhado. Um jogo sem nenhum save ainda
é adicionado mesmo assim, com 0%.

Uma versão sem configuração de emulador, ou cujo ini você apagou, também funciona: a árvore de saves é lida diretamente,
já que `Steam\RUNE\<appid>` traz o AppID no nome da pasta. As mesmas estruturas são verificadas um nível
abaixo da pasta que você adiciona, então você pode apontar o AW para uma biblioteca inteira de jogos.

Quando uma pasta não pode ser usada, o AW diz por quê: ela contém um jogo mas nenhum arquivo de desbloqueios legível,
não contém nada relacionado a conquistas, ou é uma versão do **EA app**. As versões do EA app guardam as conquistas na
conta da EA, não no disco, então são lidas pela fonte EA e nenhuma pasta que você adicione pode fazê-las
aparecer. A mensagem também diz quantas estruturas foram verificadas, o que distingue "nada encontrado" de "não
examinado".

Três casos têm tratamento próprio:

- **Goldberg SocialClub**: a variante da Rockstar e do Social Club, com interruptor próprio.
- **RUNE Ubisoft Connect**: o emulador de Ubisoft do RUNE guarda arquivos `achievements.cfg` em
  `Documents\RUNE\Ubisoft Connect\achievements`. Eles são encontrados sem adicionar uma pasta (adicionar uma
  pasta `RUNE\Ubisoft Connect` em **Configurações → Pastas** também funciona) e seguem o interruptor do
  emulador do Ubisoft Connect. Nomes e ícones vêm da lista do Ubisoft Connect para o jogo; sem ela
  aparecem apenas os números das conquistas.
- **Uplay R2**: o equivalente da Ubisoft ao caminho do Goldberg, para títulos compatíveis. Ele não tem interruptor
  próprio: os saves passam pela fonte de emuladores da Steam, e as ferramentas de reparo e de loader ficam em
  **Configurações → Emuladores → Ubisoft / Uplay R1/R2**. Veja [Configuração do Uplay R2](uplay-r2.md).

Se um jogo que usa um desses não mostrar conquistas, o painel **Estado do jogo** dele aponta a peça que falta.
Veja [Estado do jogo](game-health.md) e [Configuração do Goldberg / GBE](emulator-setup.md).

## Emuladores de console {#console-emulators}

| Emulador | Console | Arquivo de troféus / conquistas |
|---|---|---|
| **RPCS3** | PlayStation 3 | `TROPUSR.DAT` ao lado da lista de troféus |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`, que guarda a lista e o estado conquistado |
| **KytyPS5** | PlayStation 5 | `_Trophies\<title>\trophies_*.json` ao lado do emulador; a lista vem do pacote `sce_sys\trophy2` do jogo |
| **Xenia** | Xbox 360 | `.gpd`, que também guarda ambos |

Cada um é observado em tempo real, então um desbloqueio gera uma notificação como qualquer outro. O RPCS3, o ShadPS4 e o Xenia podem
mover seus dados para fora do caminho padrão, e o AW Next lê as configurações que o emulador lê:

- **RPCS3**: a pasta de troféus segue o `vfs.yml` (inclusive um remapeamento relativo a `$(EmulatorDir)`), uma
  pasta `portable` ao lado do executável e `RPCS3_CONFIG_DIR`.
- **ShadPS4**: reconhecido quer você aponte para o emulador, para a pasta `user` dele, para `game_data` em si ou
  (desde a 0.19) para a pasta `trophy` ou `home\<user>\trophy`. A configuração é lida de qualquer um dos dois lugares
  em que o shadPS4 já a guardou.
- **Xenia**: segue `storage_root` e `content_root` na configuração dele.
- **KytyPS5**: reconhecido quer você aponte para o emulador, para a pasta `_Trophies` ou para a pasta de um único
  jogo. Os jogos são procurados nas pastas de jogos do launcher do KytyPS5 (`Kyty.ini`) e ao lado do
  emulador, descompactados ou como arquivo `.zar`. A lista de troféus fica no próprio jogo, então um jogo
  excluído depois de o AW Next tê-lo visto continua listado como não instalado, a partir da cópia da lista e da arte guardada
  na ocasião. Um jogo do launcher é listado antes do primeiro troféu. Só conta o usuário ativo: o definido
  para o jogo no launcher ou, senão, o usuário global do emulador. Sem nenhuma configuração de usuário, os troféus de
  todos os usuários são adicionados.

Assim, um disco virtual do RPCS3 que foi realocado ou uma pasta de dados do ShadPS4 podem ser adicionados em **Configurações → Pastas**
diretamente, sem nenhum executável do emulador por perto.

## RetroAchievements {#retroachievements}

Os jogos jogados em qualquer emulador que reporte ao RetroAchievements vêm da sua conta, não de um
arquivo. Ative a fonte **RetroAchievements** e preencha o cartão da conta sob ela: seu nome de usuário
e a **chave Web API** de retroachievements.org/settings. A chave é criptografada antes de ser guardada
neste PC.

<div align="center">
<picture><source srcset="../assets/shot/retroachievements-panel-800.webp 800w, ../assets/shot/retroachievements-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/retroachievements-panel.png" width="720" height="529" alt="Configurações, Fontes: o interruptor do RetroAchievements acima dos cartões de contas" loading="lazy" decoding="async"></picture><br>
<sub>O interruptor do RetroAchievements, com os cartões das contas Epic e Steam abaixo dele</sub>
</div>

**Importar biblioteca** adiciona todos os jogos que você jogou, com as conquistas, as datas de desbloqueio, os pontos e a raridade.
Uma segunda importação busca apenas os jogos cujo progresso mudou, e um jogo jogado pela primeira vez é
adicionado sozinho. Novos desbloqueios são anunciados em poucos segundos enquanto um emulador que reporta ao
RetroAchievements está em execução (RetroArch, DuckStation, PCSX2, PPSSPP, Dolphin, BizHawk, Project64 ou qualquer
outra build integrada ao RA, reconhecida pelo nome ou pela dll do RetroAchievements ao lado dela), e em
alguns minutos nos outros casos.

O AW Next lê os desbloqueios de retroachievements.org, então o RetroAchievements precisa continuar ativado no emulador:
desativá-lo ali interrompe o envio dos desbloqueios. Para ver apenas a notificação do AW Next, oculte o
pop-up do próprio emulador. No RetroArch, isso fica em **Configurações → Conquistas → Visibilidade → Notificações de
desbloqueio**. O RetroBat reescreve o `retroarch.cfg` a cada inicialização, então feche o RetroBat e adicione esta linha
a `RetroBat\emulationstation\.emulationstation\es_settings.cfg`:

```xml
<string name="global.retroarch.cheevos_visibility_unlock" value="false" />
```

Use `cheevos_visibility_mastery` da mesma forma para o pop-up de maestria.

## Outras fontes {#other-sources}

| Fonte | O que é |
|---|---|
| **Jogos de Xbox 360 recompilados para PC** | Ports do ReXGlue e semelhantes guardam a lista de conquistas numa pasta `achievements` (`.toml`, `.tsv`) ou em `SaveData\Achievements.json`, na pasta do jogo ou em `Documents\<game>`. A lista vem do `default.xex` do próprio jogo, em todos os idiomas que ele traz, com as conquistas secretas mantidas em segredo. O [dbox.tools](https://dbox.tools) acrescenta as conquistas de DLC e o Exophase a porcentagem de jogadores por conquista. Uma lista em `Documents` é encontrada sozinha; para uma na pasta do jogo, a **Busca inteligente** encontra um port conhecido nas suas bibliotecas de jogos pelo executável, antes da primeira conquista; em qualquer outro lugar, adicione essa pasta em **Configurações → Pastas**. Os desbloqueios são notificados em tempo real, o tempo de jogo é rastreado e Redefinir as conquistas funciona. Mais de oitenta ports conhecidos (Sonic Unleashed, Sonic the Hedgehog pelo Marathon Recompiled, Blue Dragon re:Blue, Lost Odyssey, Perfect Dark Zero, Fable II, Gears of War 2, Forza Motorsport 4, GoldenEye 007, Skate 2, Marvel Ultimate Alliance, Eternal Sonata, a coleção Trials e outros) são listados a partir do executável antes da primeira conquista. Um port que guarda uma lista por perfil conta como um só jogo. A fonte segue o interruptor do Xenia. |
| **Jogos de PS4 portados para PC** | Bloodborne, a coleção Uncharted (uma entrada por jogo), God of War III Remastered, MediEvil e outros ports construídos sobre o runner `run.py`. Também ports sem ele (Dragon's Crown Pro, inFAMOUS Second Son e First Light, The Last Guardian, Gravity Rush 2, Killzone Shadow Fall, Driveclub, Unicorn Overlord, Fist of the North Star: Lost Paradise, UFC 3, PROTOTYPE e PROTOTYPE 2 com uma entrada cada, os jogos UFC da PORTHEON), ports no runtime do BilalReloaded como o port dele da Nathan Drake Collection, Odin Sphere Leifthrasir e 13 Sentinels: Aegis Rim, ReCasted (Ratchet & Clank, cujo `trophies\trophies.log` fica na própria pasta e cuja platina é concedida quando os outros 46 troféus são obtidos), e ports que gravam a própria lista, como Crash Team Racing Nitro-Fueled. A **Busca inteligente** encontra um port nas suas bibliotecas de jogos pelos próprios arquivos (`run.py`, `trophy.key`, `rcps4-probe.exe` do ReCasted) e entre os jogos que o Quiver Launcher instalou; em qualquer outro lugar, adicione a pasta do port em **Configurações → Pastas**. A lista de troféus, as classificações e os ícones vêm do dump original do jogo para o qual o launcher do port aponta (`sce_sys\trophy`, mesmo com um `npbind.dat` criptografado), ou do `user\trophies\<title id>\trophies.tsv` do próprio port. Os desbloqueios vêm de qualquer um destes que o port grave: `trophies.log`, `last_run.log`, `analysis\<name>-user\trophy\trophyNN.txt`, `progress_user<N>.txt`, `<title id>-user<N>.bin`, `trophies.dat` ou `unlocked.txt`, com todos os perfis mesclados, e são notificados em tempo real. A raridade vem das listas de PS4 do Exophase. O interruptor é **PS4 Recomp**. |
| **Games for Windows LIVE** | Instalações do XLiveLessNess. Os registros de desbloqueio de cada perfil são lidos, e a lista, os textos e os ícones vêm do próprio executável do jogo, então nada é baixado. As conquistas de DLC vêm do `spa.bin` de cada pacote de conteúdo na pasta `dlc\<title id>` do XLiveLessNess. Observado em tempo real. |
| **Dead Space 2 MarkerPatch, Alice: Madness Returns MadnessPatch** | Uma cópia da Steam com o mod instalado é encontrada sozinha. Para qualquer outra cópia, adicione a pasta do jogo em **Configurações → Pastas** (uma pasta dentro dela, como `Binaries\Win32`, conta como a pasta do jogo) ou deixe a **Busca inteligente** procurar nas suas bibliotecas. A lista é montada a partir dos textos e imagens do próprio mod, e os desbloqueios que ele salva são notificados em tempo real. Cada um tem o próprio interruptor, e nada é lido enquanto o `AchievementSupport` do mod estiver desativado. |
| **Ports para PC** | *The Legend of Zelda: Link's Awakening DX HD* (LADXHD Updated). Adicione a pasta do jogo em **Configurações → Pastas**. As 110 conquistas, seus textos nos idiomas do jogo e suas imagens vêm da instalação. Os desbloqueios são lidos de `%LOCALAPPDATA%\Zelda_LA\achievements` (ao lado do jogo quando ele tem um `portable.txt`). O arquivo não guarda datas, então um desbloqueio recebe a data em que foi visto. |
| **Ports para PC recompilados** | *Twilight Princess* (Dusklight), *Super Mario 64* (Ghostship), *Diddy Kong Racing* (DKR-R), *Super Mario Bros. Remastered*, *Super Mario Sunshine* com o mod Super Mario Eclipse (SMS Launcher), *Super Mario All-Stars* (o port para PC do Darhkfox), *Road Rash 64 Recompiled*, *F-Zero X* (G-Diffuser), e *Pikmin* e *Pikmin 2* (Open Nectar). Esses ports embutem a lista de conquistas no jogo, então o AW Next traz cada lista, em inglês, extraída do código-fonte do port. As imagens das conquistas vêm da própria pasta do SMS Launcher, ou são baixadas uma vez dos repositórios do Ghostship, do Super Mario Bros. Remastered e do Road Rash 64; os outros ports as desenham no código, então as conquistas deles mostram o ícone do jogo. Um port é encontrado pelo arquivo de desbloqueios em `%APPDATA%` ou `%LOCALAPPDATA%` (`TwilitRealm\Dusklight`, `DKRPort`, `SMB1R`, `sms-launcher`, `RoadRash64Recompiled`), pelos jogos que o Quiver Launcher (versão 3 ou 4) instalou, pela **Busca inteligente** a partir do executável dele nas suas bibliotecas de jogos, ou pela pasta dele em **Configurações → Pastas**. O Ghostship, o Super Mario All-Stars, o G-Diffuser e o Open Nectar guardam seus saves ao lado do jogo, então precisam de uma das três últimas formas; ao adicionar a pasta do Open Nectar, o Pikmin 2 também é encontrado na pasta `pikmin2` dele. Uma instalação portátil (`portable.txt`, ou o `data_location.json` do Dusklight) é lida onde ela grava. O DKR-R, o SMS Launcher, o Super Mario All-Stars e o G-Diffuser guardam a data de cada desbloqueio; nos outros, um desbloqueio recebe a data em que foi visto. No Linux, as builds nativas são lidas de `~/.local/share` e `~/.config`, e as builds do Windows do prefixo Wine ou Proton delas. Elas compartilham o interruptor de ports para PC. |
| **FINAL FANTASY VII (2013)** | Este relançamento é anterior às conquistas da Steamworks e guarda seus 36 desbloqueios num campo de bits de 8 bytes ao lado dos saves, encontrado em Documents sem adicionar a pasta. |
| **Lembrar desbloqueios vistos** | Mantém um jogo listado depois que o save dele some, com os desbloqueios que o rastreador em segundo plano viu. |
| **Jogos adicionados manualmente** | Um jogo adicionado a partir de um título e de um executável, com plataforma e AppID da Steam opcionais. Veja [Ferramentas avançadas](advanced.md#add-a-game-manually). |

## Metadados da Steam, sem chave de API {#steam-metadata-without-an-api-key}

O AW Next não usa chave da Steam Web API nem conta Steam conectada para isso. A lista de cada jogo vem de
uma cadeia sem chave: primeiro o endpoint oficial `GetGameAchievements` (descrições ocultas, ícones, raridade
global e os conjuntos de conquistas da Steam), depois a página de conquistas da SteamCommunity (o mesmo esquema, no
seu idioma), depois o SteamHunters, e uma extração pelo navegador apenas como último recurso.

Como na Steam, uma conquista arquivada pelo desenvolvedor só conta se você a ganhou. Caso contrário, ela fica fora
da lista, da porcentagem e da notificação de platina.

Os resultados ficam em cache por idioma em `%APPDATA%\Achievement Watcher Next\steam_cache\schema`, então fontes
locais e jogos já vistos funcionam offline.

A Steam nunca avisa que uma atualização acrescentou conquistas, então uma lista em cache se reverifica a cada 3
dias e pega as novas sem remover nenhuma. Para verificar na hora, use **Configurações → Avançado →
Reverificar listas de conquistas**. **Atualizações automáticas de dados de conquistas**, no mesmo lugar, desativa a
reverificação periódica para quem mantém o `steam_cache` manualmente. O botão continua funcionando.

As conquistas de DLC e de atualizações trazem o nome do grupo delas (por exemplo *Hearts of Stone*) sob o
título, tirado da mesma consulta.

## Fontes que você não vê {#sources-you-do-not-see}

No modo **Simples**, a lista de Fontes recolhe seis linhas de nicho: GreenLuma, LumaPlay, os dois
emuladores Nemirtingas (os leitores de saves do GOG e da Epic), Goldberg SocialClub e a importação do cache de
notificações. Uma linha só é recolhida enquanto está ativada e nenhum jogo da sua biblioteca veio dela. Desative uma,
ou tenha um jogo que ela detectou, e a linha volta, de modo que o modo da interface nunca oculta o controle que
explicaria um jogo ausente. O modo **Avançado** sempre lista todas as fontes.

---

**Próximo:** [Notificações](notifications.md), para escolher como os desbloqueios são anunciados.

*Configuração específica por fonte: [Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[Estado do jogo](game-health.md)*

<div align="center">

[← Documentação](README.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
