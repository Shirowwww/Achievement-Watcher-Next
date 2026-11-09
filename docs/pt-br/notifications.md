---
title: "Notificações e popups de conquistas"
description: "Popups do overlay ou notificações do Windows: modos de entrega, Automático, sons, posição, modo troféus, OBS, capturas de tela de lembrança e videoclipes."
---

# Notificações e popups de conquistas

O AW Next anuncia um desbloqueio com uma notificação nativa do Windows (toast), um popup do overlay dentro do jogo
ou ambos. Escolha como em **Configurações → Notificação**.

No Linux, a notificação é a do próprio desktop (GNOME ou KDE) e o overlay funciona da mesma forma.
O Não Perturbe e o interruptor de Notificações prioritárias são tratados em [Desktops compatíveis](linux.md#supported-desktops).

<div align="center">
<picture><source srcset="../assets/shot/notifications-panel-800.webp 800w, ../assets/shot/notifications-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notifications-panel.png" width="720" height="529" alt="Configurações - Notificação"></picture><br>
<sub>Um modo de entrega, um preset - o Automático cuida do resto</sub>
</div>

## Escolha um modo de entrega {#choose-a-delivery-mode}

| Modo | Comportamento |
|---|---|
| **Automático** (padrão) | O overlay do jogo quando ele puder ser exibido, uma notificação do Windows quando não puder. |
| **Overlay no jogo** | Sempre o popup estilizado sobre o jogo em execução, mesmo em tela cheia exclusiva, onde pode não ficar visível. Se o overlay não puder ser exibido de jeito nenhum, essa notificação chega como notificação do Windows. |
| **Notificação do Windows** | Sempre a notificação de sistema do Windows. As notificações de conquista e de progresso usam o ícone da conquista; as de tempo de jogo podem incluir a arte do jogo e uma barra de progresso. |
| **Ambos** | O mesmo evento nos dois meios. |

O AW Next publica as notificações do Windows por conta própria e não inicia nenhum outro programa, o PowerShell inclusive, então elas
aparecem na hora. Um app id personalizado definido em `options.ini` (`[notification_advanced] appID`) continua
passando pelo antigo caminho do PowerShell.

A janela da biblioteca pode ficar fechada em qualquer modo: o rastreador em segundo plano cuida da entrega.

<div align="center">
<picture><source srcset="../assets/shot/notification-popup.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup.png" width="440" height="126" alt="Um popup de desbloqueio" loading="lazy" decoding="async"></picture><br>
<sub>O popup do overlay, desenhado pelo preset selecionado com a arte do próprio jogo</sub>
</div>

Seja qual for o modo, o **Websocket @localhost:8082** transmite cada evento de notificação como JSON num
websocket local, para overlays de transmissão e outras ferramentas. Ele vem ativado por padrão, escuta somente em `127.0.0.1`
e não mostra nada por si só. Desative-o se não o usar. O mesmo endereço serve um overlay de transmissão pronto:
veja [Mostrar desbloqueios na transmissão (OBS)](#show-unlocks-on-stream-obs).

> [!TIP]
> Use os botões de teste depois de mudar o modo. Um teste bem-sucedido confirma o caminho de exibição; um
> desbloqueio real ainda depende de a fonte do jogo estar sendo observada corretamente.

### Como o Automático decide {#how-automatic-decides}

Cada notificação é roteada uma única vez, a partir do que o AW Next consegue observar naquele momento:

| Situação | O que acontece |
|---|---|
| Nada cobrindo a tela | Overlay no jogo. |
| O jogo está em **tela cheia** (Direct3D com as otimizações de tela cheia do Windows, que a maioria dos jogos tem) | Notificação do Windows, exibida sobre o jogo sem tirar o foco dele: uma notificação prioritária quando elas estão ativadas, caso contrário um lembrete que o AW Next fecha após o tempo usual de notificação. Jogos em janela sem bordas ou em janela mantêm o overlay. |
| O jogo ocupa a tela em **modo exclusivo legado** (jogos mais antigos, muitos jogos OpenGL ou otimizações de tela cheia desativadas) | Nada de outro app é desenhado nessa tela. A notificação vai para a Central de Notificações; o som e a vibração do controle ainda tocam. O modo sem bordas no jogo a traz de volta à tela. |
| O app não consegue exibir o popup (nenhum preset utilizável, renderer indisponível) | Uma notificação do Windows. |
| O overlay falha ao exibir | Notificações do Windows por dez minutos e, depois, o overlay é tentado de novo. |
| O overlay foi solicitado mas nunca respondeu | Nenhuma segunda notificação, para evitar duplicata. O próximo desbloqueio usa uma notificação do Windows. |

O AW Next lembra qual meio entregou por último para cada jogo e o usa apenas como critério de desempate quando o
Windows não consegue dizer se um jogo está em tela cheia exclusiva. Uma alternativa só entra em ação após uma falha definitiva, então
o mesmo desbloqueio nunca é anunciado duas vezes. O AW Next não se injeta nos jogos nem força mudanças
de modo de exibição.

### Onde o estado atual aparece {#where-the-current-state-is-shown}

O painel **Estado do jogo** de um jogo tem uma linha Notificações que indica o meio que entregou a última
notificação e por quê, por exemplo *Funcionando - alternativa do Windows ativa* (modo Simples). Sem nenhuma
notificação ainda, mostra o modo configurado. Se o Windows manteve uma notificação na Central de Notificações
porque o jogo estava em tela cheia ou o Não Perturbe estava ativado, a linha informa. Veja
[Estado do jogo](game-health.md).

## Notificações prioritárias do Windows {#priority-windows-notifications}

Jogos em tela cheia e outras regras automáticas do Windows podem ativar o **Não Perturbe**, que envia
os toasts comuns para a Central de Notificações sem exibi-los. **Configurações → Notificação → Notificações
prioritárias** marca os desbloqueios de conquistas como importantes. O Windows pergunta uma vez se o AW Next pode enviá-las;
mude a resposta nas configurações de notificação do Windows.

Vem desativado por padrão e cobre apenas desbloqueios de conquistas e de conclusão, nunca progresso ou tempo de jogo.
O toast usa o cenário `urgent`, que exige o Windows 11 (build 22546) ou posterior; no Windows 10
a opção não faz nada. Veja [a documentação da Microsoft sobre notificações de aplicativos](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content).

## Jogos executados pela Steam {#games-steam-runs}

A Steam mostra o próprio pop-up para os jogos que executa, então o AW Next fica quieto para eles por padrão. Ative
**Configurações → Notificação → Jogos do cliente Steam** para receber também a notificação do AW Next, com o som,
o overlay, a raridade e a captura de tela de lembrança. Isso cobre jogos da conta e jogos adicionados por SteamTools,
LuaTools ou GreenLuma: o AW Next acompanha o arquivo de estatísticas que a Steam reescreve em `appcache\stats`. Para manter
só a notificação do AW Next, desative **Steam → Configurações → Notificações → Eu desbloqueio uma conquista**.

## Como o popup aparece {#how-the-popup-looks}

O visual do popup dentro do jogo é um **preset**: dez acompanham o app, você pode criar o seu, e um
preset pode ser compartilhado como um único arquivo `.awpreset`. Veja [Presets e o Preset Designer](presets.md).
**Opacidade** (de 30% a 100%) nas mesmas configurações define o quanto o popup é transparente.

## Sons, volume e duração {#sounds-volume-and-duration}

- Importe arquivos `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a` ou `.aac` pelas configurações de Notificação.
- **Aleatório** na lista de sons toca um arquivo diferente dos seus a cada notificação e a cada
  prévia ou teste.
- **Som de conquista rara** e **Som de 100% de conclusão** (modo Avançado) dão a esses popups um som
  próprio, para o overlay e para as notificações do Windows. Os dois começam em "Igual aos desbloqueios"; "Nenhum" deixa
  esse tipo de popup silencioso. Um som escolhido para um jogo no painel dele ainda prevalece.
- **Som do progresso** (modo Avançado) faz o mesmo para os popups de progresso. Ele prevalece sobre o som
  do próprio jogo, exceto para um jogo configurado sem som. Para silenciar os popups de progresso de um jogo, clique nele com o botão direito e
  silencie o progresso dele.
- **Emuladores** (modo Avançado) dá a cada console o próprio preset e som: Xenia, RPCS3, shadPS4 e
  Kyty são listados. Os jogos de Xbox 360 recompilados seguem a escolha do Xenia, os ports de PS4 seguem a do shadPS4, e
  **Igual à principal** mantém as configurações principais.
- O volume do overlay vai de 0% a 200%; acima de 100% o overlay amplifica o som. A reprodução das notificações do
  Windows é limitada pelo caminho de áudio do sistema.
- A duração segue o preset ou usa um limite fixo.
- As notificações de tempo de jogo são silenciosas.

Um preset compartilhado pode trazer o próprio som, que substitui o selecionado aqui. Veja
[Compartilhar um preset](presets.md#share-a-preset).

## Posição e escala {#position-and-scale}

Escolha uma posição em canto, na borda ou centralizada nas configurações de Notificação. As posições são medidas
em relação à tela inteira, então uma âncora inferior fica na borda de baixo, não acima da barra de tarefas, e o
cartão encosta nas bordas escolhidas, qualquer que seja o espaço para sombra ou brilho que o preset deixe ao redor. O AW
mede cada preset uma vez por posição, em segundo plano depois do primeiro popup dele, então esse primeiro popup
aparece no lugar antigo. Um preset cujo cartão acompanha o comprimento do texto (PS5 Steam, Slim)
é medido a cada popup, o que o atrasa cerca de meio segundo.

**Reposicionar** move a posição personalizada, usada exatamente como você a deixou; uma salva num monitor que
não existe mais é trazida de volta à vista. Com várias telas, o popup aparece na tela do jogo
que você está jogando, não na que está sob o mouse, e uma posição personalizada mantém o lugar em relação a essa
tela. As notificações do Windows sempre aparecem na tela principal.

A configuração de escala redimensiona o popup inteiro sem mudar o layout dele, e **Reposicionar** mostra
a prévia nessa escala.

### Popups de progresso {#progress-popups}

Conquistas de contador (derrote 50 inimigos, percorra 100 km) podem gerar um popup de progresso a cada passo. No
modo Avançado, **Posição do progresso** e **Tamanho do progresso** dão a esses popups lugar e
tamanho próprios. **Igual aos desbloqueios**, o padrão, segue a posição do próprio jogo quando ele tem uma; qualquer outra
escolha vale para os popups de progresso de todos os jogos. A mira ao lado de **Posição do progresso** define
uma âncora personalizada só para o progresso. Essas configurações movem apenas o popup dentro do jogo.

**Marcos de progresso**, nas configurações comuns de notificação, mostra uma notificação de progresso apenas quando
um contador cruza mais 10, 25 ou 50% da meta. Vale para o popup e para a notificação do
Windows. O desbloqueio em si é sempre mostrado.

A lista do overlay tem atalhos de teclado próprios (veja o
[guia do Overlay](overlay.md#keyboard-shortcuts-overlay-open)) e controle opcional por gamepad (veja o
[guia do Controle](controller.md)).

## Comportamento por jogo {#per-game-behavior}

Abra o painel de ferramentas de um jogo e escolha **Notificação** para dar a esse jogo o próprio preset de popup,
posição, som ou escala. Todo campo herda a configuração global, e apenas os valores que você muda são
guardados; o som também oferece silêncio e aleatório. A mira ao lado de Posição arrasta uma prévia até onde o
popup desse jogo deve aparecer. Os cinco botões de teste mostram uma prévia desse jogo e da arte dele sem
mudar o progresso das conquistas. Um preset ou som removido volta ao valor global, e renomear
um preset de usuário mantém as atribuições aos jogos.

Clique com o botão direito num jogo para silenciar as notificações de progresso dele mantendo as de desbloqueio e de
conclusão.

Uma conquista com taxa global de desbloqueio igual ou inferior ao limite de raridade imprime a porcentagem e recebe
o estilo raro do preset: **ouro** com 5% ou menos, **prata** até 10%, **bronze** até 15%. Mude
esses limites em **Configurações → Geral → Limites de raridade** definido como Personalizado (modo Avançado).

### Modo troféus {#trophy-mode}

**Configurações → Geral → Exibição da raridade** muda para o **Modo troféus**: cada conquista é classificada pela
taxa global de desbloqueio (ouro abaixo de 20%, prata abaixo de 50%, bronze nos demais casos ou quando a taxa é
desconhecida) na janela do jogo, no overlay, nos troféus do perfil e na notificação. Os **Limites de
raridade** movem os limites. As três classificações usam o estilo raro do preset (`state-rare` mais
`tier-gold`, `tier-silver` ou `tier-bronze`); a platina continua sendo o estado separado de conclusão. O app
dá ao preset a classificação em `rarityTier` (com `rarityMode` e o `rarityGrade` localizado); um preset
sem o campo volta à porcentagem.

Com uma conta PlayStation conectada (**Configurações → Fonte**), um jogo que também saiu na
PlayStation usa a lista real de troféus, de onde quer que venham as conquistas dele: cada conquista recebe a
classificação e o grupo de DLC do troféu com o mesmo nome ou descrição. A platina real aparece em todos os
modos de raridade (página do jogo, estatísticas, popup de 100%) com nome, descrição e ícone, e conta assim que esse
troféu é conquistado, mesmo com troféus de DLC pendentes. Os emuladores de PlayStation mantêm os próprios troféus. O AW
encontra a lista pelo nome original do jogo, então renomear um jogo não muda nada.

Toda fonte exibe o popup de 100%, as de tempo real inclusive (Xenia, ports recompilados, GOG Galaxy,
Ubisoft Connect, Xbox PC). Quando o jogo tem uma platina, a conquista ligada a ela aparece como
platina.

<div align="center">
<picture><source srcset="../assets/shot/trophy-profile.webp 640w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/trophy-profile.png" width="440" height="148" alt="O cabeçalho do perfil com as contagens de troféus de platina, ouro, prata, bronze e comuns" loading="lazy" decoding="async"></picture><br>
<sub>O perfil conta cada desbloqueio por classificação, com a platina para os jogos concluídos</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/trophy-game-panel.webp 800w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/trophy-game-panel.png" width="560" height="672" alt="A página de um jogo em que cada conquista é classificada como ouro, prata ou bronze" loading="lazy" decoding="async"></picture><br>
<sub>Na página de um jogo, cada conquista traz a classificação e a parcela de jogadores que a possuem</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/notification-popup-trophy.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup-trophy.png" width="440" height="126" alt="Um popup de desbloqueio desenhado no estilo ouro" loading="lazy" decoding="async"></picture><br>
<sub>Um desbloqueio de ouro no preset do AW Next</sub>
</div>

## Mostrar desbloqueios na transmissão (OBS) {#show-unlocks-on-stream-obs}

Capturar o popup como janela não funciona: a janela do popup vive alguns segundos, então o OBS nunca
a pega. Use uma fonte **Navegador**, que o OBS mantém carregada durante toda a transmissão.

1. **Configurações -> Notificação -> Fonte de navegador do OBS.** **Pré-visualizar** abre a página no seu navegador
   com um desbloqueio de exemplo a cada dez segundos, a forma mais rápida de conferir se a cadeia funciona. **Copiar link**
   copia o endereço.
2. No OBS: **+ -> Navegador**, cole o endereço em **URL**.
3. Defina qualquer **Largura** e **Altura**. O cartão se ajusta para preencher a caixa.

A fonte mostra o mesmo preset, a mesma arte e o mesmo estilo de raridade do popup dentro do jogo e segue o
preset que você escolhe nas Configurações. Os botões de teste em **Configurações -> Notificação** também disparam nela,
seja qual for o modo de entrega.

> [!TIP]
> **Uma fonte maior dá um cartão mais nítido.** O cartão é montado no tamanho da fonte, não esticado.
> Dê à fonte aproximadamente o dobro da caixa do próprio preset e posicione-a na metade do tamanho na sua cena:
> `http://127.0.0.1:8082/obs/_config` informa os dois números. Só o ícone da conquista continua suave,
> já que a Steam o publica em 64x64.

### Opções {#options}

Acrescente-as ao endereço, `?first=x&then=y`:

| Opção | Efeito |
|---|---|
| `?test=1` | Repete um desbloqueio de exemplo a cada dez segundos, para posicionar a fonte. Remova depois. |
| `?scale=2` | Fixa o cartão nesse zoom em vez de ajustá-lo à fonte. `?scale=app` segue a escala definida nas Configurações. |
| `?duration=8000` | Mantém cada cartão por essa quantidade de milissegundos em vez da duração configurada. |
| `?sound=1` | Toca o som da notificação pela fonte de navegador, para que chegue à transmissão sem capturar o áudio do desktop. Desativado por padrão, já que o app já o toca nos seus alto-falantes. Marque **Controlar áudio via OBS** na fonte para colocá-lo na mixagem. |
| `/obs/preset/Xbox/` | Usa um preset nomeado na transmissão, seja qual for o definido no desktop. Qualquer nome de preset instalado funciona, inclusive os seus. |

### Observações {#notes}

- A página fica em branco entre os desbloqueios de propósito: nada é desenhado, então não gasta CPU até que uma
  conquista apareça.
- É somente local. A página e o feed escutam em `127.0.0.1`, então nada mais na sua rede pode
  alcançá-los.
- Os ícones das conquistas são servidos por esta máquina para as fontes que guardam a arte localmente
  (Goldberg, emuladores, a arte da sua própria biblioteca), e só para imagens que uma notificação anunciou.
- Uma só cópia do AW Next serve o endereço: a que iniciou primeiro. Uma segunda instância, ou qualquer outra coisa
  na porta 8082, deixa a fonte sem nada a que se conectar. Feche a cópia extra e a fonte
  se reconecta em poucos segundos.
- Se a fonte continuar em branco num desbloqueio real, verifique se os botões de teste funcionam e depois se a linha
  **Websocket** está ativada.

## Conquistas nas páginas da biblioteca da Steam {#achievements-on-steams-library-pages}

A Steam não mostra conquistas na página de um atalho que não é da Steam. Um plugin da Steam (Millennium no
desktop, Decky no Modo Jogo) pode pedir ao AW Next as conquistas desse atalho no mesmo feed local,
`ws://127.0.0.1:8082`, e desenhá-las por conta própria. O AW Next responde por um jogo de cada vez: o plugin precisa
nomeá-lo, e a resposta não traz pasta, conta nem nome de fonte.

O plugin Millennium do próprio AW Next, na pasta `millennium/` do repositório, faz isso para cada
atalho que o AW Next reconhece: a página do jogo então mostra a seção Conquistas da própria Steam, o contador
na barra de jogo, a lista completa e a aba "Suas coisas" do Big Picture. Um atalho é associado melhor quando
inicia o mesmo exe do **Executável** do jogo no AW Next. O README dele cobre a instalação, o que
verificar quando uma página fica vazia e como ele convive com Steam Cartridges, NativeGameLink e Game
Data Linker. A extensão do Playnite em `playnite/` pede da mesma forma, para qualquer jogo de uma biblioteca
do Playnite, e o README dela cobre a instalação e os painéis que um tema pode posicionar. A requisição abaixo é
para quem escreve outro plugin.

O plugin envia:

```json
{ "cmd": "bridge-game", "id": "r1", "exe": "D:\\Games\\Pinyon Shift\\pinyon_shift.exe", "launchOptions": "", "steamAppId": 0, "name": "Forza Horizon" }
```

Todos os campos, exceto `cmd`, são opcionais, e cada um que ele acrescenta ajuda. O AW Next os tenta nesta ordem: o
exe que a biblioteca encontrou para um jogo, uma pasta de jogo ou ROM citada nas opções de inicialização (um
atalho de emulador), um AppID da Steam, um launcher na pasta do jogo, o nome de arquivo do exe e, por fim, o título exato.
Quando uma etapa corresponde a mais de um jogo, o AW Next responde "não encontrado".

A resposta:

```json
{ "cmd": "bridge-game", "id": "r1", "bridge": 1, "found": true,
  "game": { "id": "x360-4D5309C9", "name": "Forza Horizon", "total": 50, "unlocked": 12,
    "achievements": [{ "id": "1", "name": "...", "description": "...", "icon": "https://...", "iconLocked": "https://...",
      "hidden": false, "rarity": 12.5, "unlocked": true, "unlockedAt": 1790000000 }] } }
```

- `unlockedAt` está em segundos Unix. `rarity` e `progress` (`{ "current": 6, "max": 50 }` numa
  conquista bloqueada parcialmente concluída) só existem quando o AW Next os conhece.
- Um ícone guardado neste PC chega como um endereço `http://127.0.0.1:8082/bridge/icon/...`.
- A lista é a biblioteca como a última varredura a viu, mais os desbloqueios anunciados desde então. Os desbloqueios
  continuam chegando no feed: quando um traz o `id` do jogo em `appID`, peça de novo para atualizar a página.
- O plugin se conecta a partir das próprias páginas da Steam (`https://steamloopback.host`) ou de um processo nativo;
  sites da web são recusados. Com uma senha de websocket definida, ele precisa da mesma senha.
- Ele não deve se conectar como `?client=decky`: esse nome avisa o AW Next de que a Steam mostra as próprias
  notificações, e o AW Next então mantém o próprio popup desligado.

## Capturas de tela de lembrança {#screenshot-souvenirs}

**Captura ao desbloquear** salva uma imagem da tela um instante depois que uma conquista aparece, quando o
popup já terminou de surgir, de modo que a notificação saia na foto. Os arquivos vão para
`<folder>\<game>\<achievement> - <date>.png`, com a data na hora local do PC. **Abrir pasta** na mesma linha a abre, criando-a
antes se necessário. A pasta padrão é `Pictures\Achievement Watcher Next` e pode ser alterada.

As conquistas desbloqueadas no mesmo segundo mantêm cada uma o próprio arquivo, e um jogo cujo título o Windows
recusa como nome de pasta ainda recebe as capturas. Em configurações com vários monitores, a lembrança captura
o monitor em que o jogo está, como os videoclipes; sem nenhuma janela de jogo visível, usa o monitor
da janela em primeiro plano e depois o principal.

### Jogando com o HDR do Windows ativado {#playing-with-windows-hdr-on}

**Capturas HDR** vem por padrão em **Automático**. No momento da captura, o AW Next verifica se o HDR está ativo
na tela que mostra o jogo. Se estiver, um auxiliar de execução única captura um quadro FP16 pelo Windows
Graphics Capture e aplica tone mapping aos realces num PNG SDR/sRGB, e então encerra. Com o HDR desativado,
**Automático** e **Desativado** usam a captura padrão. Qualquer falha do auxiliar (falta de suporte do Windows, uma
captura bloqueada, um tempo esgotado) também volta à captura de tela padrão, de modo que a lembrança e a
notificação não se perdem.

## Videoclipes {#video-clips}

**Videoclipe ao desbloquear** funciona como o vídeo de troféu de um console. Enquanto um jogo que o AW Next rastreia está em execução,
os últimos segundos de jogo ficam na memória, já comprimidos pelo codificador de vídeo da placa de vídeo.
Quando uma conquista aparece, o trecho em torno dela é salvo como MP4 em
`<folder>\<game>\<achievement> - <date>.mp4`, com o popup no meio. A pasta é
`Videos\Achievement Watcher Next`, a menos que você escolha outra. As conquistas desbloqueadas em sequência próxima
compartilham um só clipe.

| Configuração | Opções | Padrão |
|---|---|---|
| Duração do clipe | De 10 a 60 segundos | 20 s |
| Antes do desbloqueio | De 0 segundo ao clipe inteiro. Aumente quando as notificações chegam atrasadas em jogos pesados | Metade do clipe |
| Formato | H.264, HEVC ou AV1, salvo como MP4 | H.264 |
| Resolução | Tela, 2160p, 1440p, 1080p ou 720p, nunca acima da tela | 1080p |
| Taxa de quadros | 30 FPS, 60 FPS ou Ilimitada, que acompanha a sua tela (120, 144, 240 Hz) | 30 FPS |
| Qualidade | Baixa, Média ou Alta | Média |
| Som | Somente o jogo, ou o PC inteiro | Somente o jogo |

<div align="center">
<picture><source srcset="../assets/shot/video-clip-panel-800.webp 800w, ../assets/shot/video-clip-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/video-clip-panel.png" width="720" height="529" alt="Configurações, Notificação: a seção Videoclipe com o interruptor de ativar/desativar" loading="lazy" decoding="async"></picture><br>
<sub>A seção Videoclipe fica no fim da aba Notificação e permanece desativada até você ativá-la</sub>
</div>

A linha sob a tabela estima o tamanho de um clipe para a sua tela. É um teto: o codificador
trabalha com taxa de bits constante e uma cena calma resulta num arquivo menor.

- **Custo.** Nada roda enquanto não houver um jogo em execução. A captura, o redimensionamento e a codificação ficam na GPU, num
  bloco de codificação separado do que renderiza o jogo. O gravador usa bem menos de 1 % da CPU
  e cerca de 70 a 110 MB de memória mais um clipe. Nada é gravado no disco até uma conquista
  ser desbloqueada.
- **Formato.** O H.264 toca em qualquer lugar, Discord e celulares inclusive. HEVC e AV1 geram arquivos menores.
  O AV1 exige uma GeForce RTX 40, Radeon RX 7000, Intel Arc ou mais nova; sem o formato escolhido, o clipe
  é gravado em H.264. Uma placa sem codificador H.264 por hardware usa o codificador por software do Windows, no
  processador, a no máximo 1080p e 30 FPS.
- **Taxa de quadros.** **Ilimitada** grava na taxa de atualização do monitor que mostra o jogo e
  a acompanha quando ela muda. Se o codificador recusar uma taxa, o gravador desce para 60 e depois para 30
  FPS, e registra isso no log. A estimativa de tamanho presume o dobro da taxa de bits de 30 FPS para Ilimitada.
- **Se o gravador parar de responder.** O AW Next o reinicia após uma espera que dobra a cada vez, e
  desiste de um jogo após cinco reinícios fracassados. Um clipe cuja gravação falha no meio é mantido se o que
  foi gravado toca, caso contrário é removido. Um clipe deixado pela metade por um PC que caiu é limpo
  da próxima vez que um jogo for gravado.
- **HDR.** Com o HDR do Windows ativado, os clipes recebem tone mapping como as capturas HDR; **Capturas HDR** definido como
  **Desativado** vale também para os clipes.
- **Som.** **Somente o jogo** deixa de fora o chat de voz e a música. Se o som do jogo não puder ser gravado
  sozinho, o PC inteiro é gravado.
- **O que é capturado.** O monitor que mostra o jogo, notificações incluídas. Um jogo muito antigo em tela cheia
  exclusiva pode gravar quadros pretos.

## Rever uma lembrança {#seeing-a-souvenir-again}

Clique com o botão direito em uma conquista desbloqueada no app e escolha **Ver captura** ou **Ver clipe** para
abri-la em um visualizador, com os outros arquivos da mesma conquista a um clique e **Mostrar na pasta** para
achar o arquivo. No overlay dentro do jogo, os botões pequenos sob **Desbloqueado** abrem o mesmo visualizador;
com um controle, esquerda e direita navegam, A reproduz um clipe e B o fecha.

O AW Next anota qual arquivo pertence a qual conquista quando o recebe, então renomear o jogo ou mudar o idioma do
app não perde o vínculo. As capturas e os clipes feitos antes desta versão são encontrados pelo nome do arquivo,
nas pastas definidas acima.

## Se um teste ou desbloqueio não aparecer {#if-a-test-or-unlock-does-not-appear}

1. Confirme que as notificações estão ativadas e leia a linha Notificações do painel
   **[Estado do jogo](game-health.md)** do jogo.
2. Verifique se o rastreador em segundo plano está em execução.
3. Para overlays, selecione um preset válido e teste de novo fora de um jogo em tela cheia exclusiva.
   O **Automático** já cuida dos dois casos.
4. Se um jogo em tela cheia ou o Não Perturbe ocultar as notificações do Windows, ative **Notificações
   prioritárias** e aprove o pedido único do Windows.
5. Verifique as configurações de notificação do Windows para o AW Next.
6. Abra **Configurações → Avançado → Diagnóstico** e inspecione os logs.

Se o problema continuar, siga para [Solução de problemas](troubleshooting.md#notifications-do-not-appear).

---

**Próximo:** [Presets e o Preset Designer](presets.md) - o visual do popup e como criar o
seu.

<div align="center">

[← Documentação](README.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
