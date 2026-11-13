---
title: "Solução de problemas"
description: "Soluções para jogos ausentes, progresso errado, notificações que não aparecem, tempo de jogo e avisos do antivírus ou do SmartScreen."
---

# Solução de problemas

## Por onde começar {#start-here}

Se o problema envolve **um único jogo**, abra primeiro o painel **[Estado do jogo](game-health.md)** dele.
Ele informa se o AW Next consegue ver o jogo, ler as conquistas dele e anunciar os desbloqueios, e
oferece apenas os reparos que se aplicam. A maioria dos problemas de um só jogo termina ali.

Use o resto desta página para problemas que afetam o app inteiro. **Configurações → Ajuda** tem uma
versão curta das primeiras verificações em *Algo não está funcionando* (Estado do jogo e Solução de problemas), e a linha
*Sua configuração atual* mostra o tema, o modo de notificação, o controle, o atalho do overlay e quantas
fontes estão ativadas. Para uma dúvida antes de ter certeza de que é um bug, pergunte no
[servidor do Discord](https://discord.gg/DjTMrDsXTh). Num relato de bug, inclua a versão do app, a versão do
Windows, a fonte envolvida, os passos exatos e os logs relevantes.

## No Linux {#on-linux}

O app para Linux tem problemas que esta página não cobre. O AppImage não inicia sem o FUSE 2
(`libfuse2t64` no Ubuntu 24.04). O chaveiro só pede a senha com login automático. O
atalho do overlay no Wayland é um que você associa nas configurações de teclado do desktop. Cada um tem a solução
em [Linux e Steam Deck](linux.md#install). O resto desta página descreve o Windows; no Linux
os logs ficam em `~/.config/Achievement Watcher Next/logs`.

## Abrir logs e dados locais {#open-logs-and-local-data}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Configurações - Avançado, diagnóstico"></picture><br>
<sub>Versões do app e do runtime e acesso rápido a logs, dados e verificações de atualização</sub>
</div>

A aba **Avançado** existe apenas no modo Avançado. Se você não a vir, mude o controle **Interface**
no topo de **Configurações** de Simples para Avançado; nada se perde ao voltar (veja
[getting-started.md](getting-started.md#simple-and-advanced)).

**Configurações → Avançado → Diagnóstico** abre a pasta de logs ou de dados. O caminho padrão dos logs é:

```text
%APPDATA%\Achievement Watcher Next\logs
```

Os arquivos mais úteis costumam ser `Achievement Watcher.log`, `renderer.log`, `parser.log` e os logs
do Watchdog da fonte afetada. Uma falha que atravessa varredura, interface e notificações exige
vários deles, então use **Exportar logs (.zip)** no mesmo cartão em vez de copiar os arquivos à mão:
os processos que gravam os logs nunca param, então uma cópia manual pode pegar uma linha gravada pela metade. A
exportação funciona com o app em execução e acrescenta um `about.txt` com as versões do app, do Electron, do Node e do Chrome.

O arquivo é pensado para uma issue pública, então as cópias dele são mascaradas: seu nome de usuário do Windows em todo
caminho vira `[username]`, e chaves, tokens e senhas viram `[redacted]`, `[token]` ou
`[apikey]`. Os logs no seu disco não mudam, e um arquivo que não pode ser mascarado fica de fora.
O mascaramento atua sobre formatos conhecidos, então leia os arquivos antes de publicá-los; uma pasta de jogo com o seu nome,
por exemplo, permanece como está.

Os logs são acrescentados, nunca truncados, para que uma falha sobreviva à próxima inicialização. Cada execução começa com um
marcador, seguido de um bloco `[diag]` com o que um relato de bug precisa: versões, caminhos de instalação e de dados,
como o app foi iniciado, o idioma e o tema, e a geometria de cada tela:

```text
===== session 2026-08-11T00:53:31.890Z pid=19276 =====
[diag] app: Achievement Watcher 3.10.0 (packaged)
[diag] runtime: electron 43.4.0 · chrome 150.0.7871.224 · node 24.18.1 · v8 15.0
[diag] display: 3056414223 1080x1920 @1x work=1080x1872 rotation=270
[diag] display: 3933707034 (primary) 2048x1152 @1.25x work=2048x1104 rotation=0
```

Cole esse bloco numa issue. Problemas de tamanho e posição da janela são quase sempre de escala de tela
ou de vários monitores, e as linhas `[MainWindow]` que vêm a seguir registram os limites da janela e a tela
toda vez que ela é exibida, movida, redimensionada ou fechada.

Cada arquivo de log é rotacionado para `<name>.log.1` acima de 2 MB, então uma geração mais antiga é mantida.

## Um jogo está ausente {#a-game-is-missing}

1. Abra **Configurações → Fonte** e confirme que a integração relevante está ativada.
2. Abra **Configurações → Pastas**, execute a **Busca inteligente** e depois use **Gerar configurações** para uma varredura completa.
3. Adicione manualmente a biblioteca de jogos ou a raiz de saves se ela usa um local personalizado.
4. Desative **Mostrar apenas os jogos instalados** para ver se o jogo é conhecido, mas não é mais considerado
   instalado.
5. Para saves de emuladores, inicie o jogo uma vez para que ele crie uma pasta de runtime.

Se restam apenas resíduos de saves antigos e os arquivos do jogo sumiram, o filtro de somente instalados oculta
a entrada.

Um jogo cujos metadados não puderam ser buscados continua na lista: o que está no disco decide que um jogo
existe, e a consulta online apenas o enfeita. A entrada mostra o nome conhecido localmente e
é completada numa varredura posterior.

## As conquistas continuam bloqueadas ou mostram 0% {#achievements-stay-locked-or-show-0}

Nenhum arquivo de desbloqueio de runtime significa 0%, mesmo com uma lista de conquistas completa.

Abra o painel **[Estado do jogo](game-health.md)** do jogo: ele aponta a parte que falta e oferece o
reparo, seja reescrever os dados de conquistas, restaurar o arquivo do emulador ou corrigir um
`steam_appid.txt` que cita outro jogo. Para verificar à mão:

- confira se o AppID ou o ID de plataforma detectado pertence ao jogo correto;
- verifique se há um caminho de save personalizado;
- repare um esquema `steam_settings` divergente somente depois de revisar o relatório;
- se você jogou em outro PC, conecte aquela conta da Steam: um jogo sem nada para ler localmente é
  então lido do seu perfil Steam, cujos detalhes do jogo precisam ser públicos. A resposta fica em cache por seis
  horas (veja [Contas conectadas](sources.md#connected-accounts)).

Os saves de emuladores da Steam podem ficar divididos entre `%APPDATA%\GSE Saves` e
`%APPDATA%\Goldberg SteamEmu Saves` para o mesmo jogo. O AW Next lê o que tiver os desbloqueios, então
você não precisa corrigir isso à mão.

Um jogo sem conjunto de conquistas não tem barra de progresso em vez de 0% (ou **Sem conquistas**, se você
reativou essa barra em **Configurações → Aparência → Cartões da biblioteca**) e fica de fora das estatísticas
de conclusão.

**Funciona pelo botão Jogar do AW Next, mas não por um atalho da Steam.** Um jogo crackeado adicionado à Steam
como jogo que não é da Steam é iniciado com um ID de jogo próprio, e o GBE Fork lê esse ID antes do
`steam_appid.txt`, então os desbloqueios são salvos sob o número do atalho e nunca chegam ao cartão do jogo.
A Steam repassa o ID real quando um `steam_appid.txt` está na pasta de início do atalho (Iniciar
em); um ao lado apenas do executável não é lido. O Estado do jogo sinaliza um atalho cuja pasta de início
não o tem, e o reparo dele grava o arquivo ali.

**Um crack scene é usado e nada é registrado.** Alguns cracks nunca informam conquistas.
Depois de uma hora de jogo sem nada registrado, o Estado do jogo avisa e, quando esse crack é o arquivo da biblioteca
Steam do jogo, oferece instalar por cima dele o emulador compatível e desfazer isso depois.

**Halo: Campaign Evolved e The Crew Motorfest não registram nada offline.** Os servidores da publisher
concedem as conquistas deles, então nenhum crack ou emulador consegue registrá-las. O painel Estado do jogo deles avisa isso.

Veja [Configuração do Goldberg e GBE Fork](emulator-setup.md#common-problems) ou [Configuração do Goldberg Uplay R2](uplay-r2.md#achievements-remain-at-0) para os passos específicos de cada fonte.

## O jogo errado foi associado {#the-wrong-game-was-matched}

Quando o nome da pasta de um jogo corresponde a várias versões da Steam e a associação automática escolheu a
errada, clique com o botão direito nele e escolha **Definir o AppID manualmente...**. O AppID que você digita é gravado em
`steam_appid.txt` e lembrado para aquela pasta de instalação, então os reparos seguintes o usam; **Limpar o AppID manual**, no mesmo menu, desfaz isso. O reparo **Corrigir o arquivo de identificação do jogo** do Estado do jogo também pede
o AppID. Detalhes: [Definir o AppID de um jogo manualmente](advanced.md#set-a-games-appid-by-hand).

Uma divergência nem sempre é culpa do emulador. Se ele foi configurado de propósito para o ID que está no disco, deixe
como está.

## Faltam nomes, descrições ou arte {#names-descriptions-or-artwork-are-missing}

- Atualize estando online para que o app tente de novo as fontes de metadados.
- Confirme a identidade de plataforma do jogo; um AppID da Steam errado pode retornar metadados convincentes
  mas sem relação.
- Para Goldberg/GBE, um esquema local válido pode preencher parte do texto ausente offline.
- Use as ações de capa do jogo para tentar de novo ou escolher uma arte local quando as fontes automáticas falharem.

Um cartão intitulado apenas com o AppID da Steam significa que a busca do nome voltou vazia enquanto a arte,
que vem só do AppID, foi resolvida. A próxima varredura substitui o número quando a busca
funciona.

As conquistas de DLC e de atualizações mostram o grupo a que pertencem sob o título (por exemplo uma etiqueta "Hearts of
Stone"), a partir dos conjuntos de conquistas da própria Steam ou, para um jogo sem eles, do SteamHunters.

As descrições de conquistas ocultas continuam ocultas quando todas as fontes disponíveis as omitem.

## Uma atualização do jogo adicionou conquistas que não aparecem {#a-game-update-added-achievements-that-arent-showing-up}

Um esquema em cache se reverifica na Steam a cada 3 dias, já que a Steam nunca anuncia novas
conquistas. Para pegá-las na hora, use **Configurações → Avançado → Reverificar listas de conquistas**, que
funciona mesmo com **Atualizações automáticas de dados de conquistas** desativadas. Esse interruptor, também em Configurações →
Avançado, interrompe apenas a verificação periódica e o reparo de descrições em branco. Nenhuma das verificações remove
conquistas ou desbloqueios existentes. Desative-o somente se você mantém o `steam_cache` manualmente.

## Uma atualização trava no mesmo arquivo {#an-update-is-stuck-on-the-same-file}

Os arquivos de atualização baixados são mantidos entre as execuções. Se um download continua falhando no mesmo arquivo, use
**Configurações → Avançado → Limpar caches** e verifique as atualizações de novo. Só os caches que podem ser baixados de novo
são excluídos; configurações, dados de jogos e logs permanecem.

As atualizações normalmente baixam apenas a parte do instalador que mudou, e voltam sozinhas ao
instalador completo se isso falhar.

O AW Next anuncia uma nova versão com uma notificação do Windows e um selo na barra de título, e clicar em
qualquer um dos dois abre a janela de atualização, que lista as notas de versão de todas as versões que você pulou. O
aviso fica até você fechá-lo e volta depois de um jogo, nunca durante um. O ícone da bandeja mostra um
ponto azul nesse meio-tempo. **Configurações → Verificar atualizações** abre a janela na hora.

**Atualização recusada.** Toda atualização é conferida com o certificado de assinatura fixado do projeto antes
de ser instalada, não com uma assinatura qualquer e não com o SHA-512 publicado junto, já que ambos vêm da
mesma versão. Uma recusa quase sempre significa que o arquivo baixado foi adulterado ou corrompido:
limpe os caches como acima e baixe de novo da
[página oficial de Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases).

## As notificações não aparecem {#notifications-do-not-appear}

1. Confirme que o rastreador em segundo plano está em execução.
2. Abra o jogo e leia a linha Notificações do painel **Estado do jogo** dele: ela indica o meio
   que entregou a última notificação desse jogo, e por quê.
3. Use os testes normal, raro e de overlay em **Configurações → Notificação**.
4. Confirme o modo de entrega e o preset selecionado. No **Automático**, um popup de overlay ausente costuma ser
   a alternativa prevista: veja [Notificações](notifications.md#how-automatic-decides).
5. Verifique as permissões de notificação do Windows para o AW Next.
6. Se o problema ocorre só enquanto você joga ou em tela cheia, ative **Notificações prioritárias** em
   **Configurações → Notificação** e aceite o pedido de permissão do Windows.
7. Teste o overlay fora da tela cheia exclusiva.
8. Revise os logs logo depois de um teste ou desbloqueio que falhou.

Se a biblioteca é atualizada mas nenhuma notificação aparece, o problema é o meio de notificação. Se
a biblioteca também permanece inalterada, diagnostique primeiro a fonte ou o caminho dos saves.

## A fonte de navegador do OBS fica vazia {#the-obs-browser-source-stays-empty}

1. Pressione **Pré-visualizar** em **Configurações → Notificação → Fonte de navegador do OBS**, ou abra
   `http://127.0.0.1:8082/obs/?test=1`. Um cartão de exemplo a cada dez segundos significa que a página e o feed
   funcionam, e o problema são as configurações da fonte no OBS.
2. Nada mesmo, nem uma página em branco: outra cópia do AW Next, ou outro programa, ocupa a porta
   8082. Só a cópia que iniciou primeiro serve o endereço.
3. Uma página em branco é normal entre os desbloqueios. Use `?test=1` para vê-la desenhar.
4. Verifique se o **Websocket @localhost:8082** está ativado em **Configurações → Notificação → Transporte**: a
   fonte lê esse feed.
5. O cartão preenche o tamanho que a fonte tiver. Se parecer borrado, dê mais pixels à fonte e
   coloque-a menor na cena.

Veja [Mostrar desbloqueios na transmissão (OBS)](notifications.md#show-unlocks-on-stream-obs) para a configuração completa.

## Um jogo não inicia pelo botão Jogar {#a-game-will-not-start-from-the-play-button}

Alguns jogos precisam de direitos de administrador, porque o manifest ou o launcher deles pede. O Windows
se recusa a iniciá-los da forma como o AW Next normalmente inicia um jogo e informa `EACCES`.

O AW Next então tenta de novo pelo shell do Windows, que exibe o pedido comum do UAC, de modo que o jogo
inicia depois que você confirma. Se isso também for recusado, o AW Next oferece tentar como administrador. Só o
jogo é elevado, já que um AW Next elevado criaria arquivos que a sua conta normal não pode reescrever.
Dispensar o pedido do UAC é tratado como uma decisão, não como um erro.

## O tempo de jogo não é rastreado {#playtime-is-not-tracked}

O AW Next acompanha o executável do jogo configurado e a duração do processo dele. Se um launcher, um auxiliar ou um
binário com nome diferente inicia no lugar:

- clique com o botão direito no jogo e abra a configuração dele;
- selecione o executável que permanece ativo enquanto você joga;
- evite processos de launcher e de tratamento de falhas;
- reinicie o jogo depois de salvar.

Um jogo Java que inicia por `javaw.exe` e encerra o próprio launcher é rastreado automaticamente por esse processo
Java.

Para corrigir um total que já está errado, use **Conquistas e tempo de jogo → Editar tempo de jogo…** (veja
[Editar o tempo de jogo de um jogo](advanced.md#editing-a-games-playtime)).

## Os troféus da PlayStation não são importados {#playstation-trophies-do-not-import}

- *A sessão da PlayStation expirou*: conecte a conta de novo em **Configurações → Fonte**.
- *A PlayStation pede para diminuir o ritmo* ou *Pausado pela PlayStation*: a Sony limita a taxa de requisições. Importe
  de novo em alguns minutos e ele continua de onde parou.
- *Ainda não há lista de troféus nesta conta*: a conta não tem uma lista de troféus para importar.

## Um jogo Nemirtingas Epic não registra nada {#a-nemirtingas-epic-game-records-nothing}

Quando a pasta de um jogo contém o emulador (a biblioteca `EOSSDK` dele com um
`nepice_settings\NemirtingasEpicEmu.json` ao lado), a aba **Estado do jogo** do jogo mostra uma linha
**Emulador Epic**:

- **SavePath precisa ser `"appdata"`.** O emulador grava as conquistas em
  `%APPDATA%\NemirtingasEpicEmu`, onde o AW Next as lê, somente com esse valor; qualquer outro as mantém
  na pasta do jogo. A linha avisa quando está definido como outra coisa.
- **Alguns jogos precisam dos argumentos de inicialização da Epic.** Alguns jogos EOS fazem login no emulador, e assim salvam
  uma conquista, somente quando um launcher passa `-epicapp=...` e os demais. Enquanto o emulador não
  salvou nada, a linha oferece **Adicionar os argumentos de inicialização da Epic**, que os grava nas configurações de
  inicialização do jogo a partir do `AppId` da configuração. Um `.bat` que os passa também funciona.
- Se o jogo trava ao iniciar com o emulador instalado, desative o plugin de overlay dele
  (`"Plugins": { "Overlay": { "Enabled": false } }`); a linha lembra você enquanto ele estiver ativado.

## Ubisoft ou Uplay R2 usa a ação errada {#ubisoft-or-uplay-r2-uses-the-wrong-action}

Os jogos da Ubisoft devem receber metadados da Ubisoft e o reparo do Uplay R2, não a ação GBE da Steam. Execute uma
nova varredura de pastas e verifique o ícone da fonte. Se o jogo continuar identificado errado, anexe o `parser.log`,
a fonte e os IDs exibidos e o nome do diretório do jogo a um relato.

## Aviso do antivírus ou do SmartScreen {#antivirus-or-smartscreen-warning}

As versões empacotadas são assinadas com o certificado do próprio projeto, fixado pela impressão digital exata, não
emitido por uma autoridade publicamente confiável, então o Windows SmartScreen ainda pode avisar. Você nunca precisa
instalar o certificado. Antes de instalar uma atualização, o AW Next verifica se ela é assinada, se o
signatário é `CN=Shirow`, se a impressão digital corresponde a uma das duas fixadas no app e se o
arquivo não foi modificado depois da assinatura. O SHA-512 publicado com uma versão não pode substituir essa verificação,
já que os dois seriam substituídos juntos. As DLLs opcionais de emuladores também podem disparar detecções heurísticas.
Baixe somente da
[página oficial de Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases) e compare
o instalador com o SHA-512 do `latest.yml` correspondente para uma segunda verificação.

Não desative a proteção em todo o sistema. Informe um arquivo em quarentena vindo da versão oficial ao
fornecedor do antivírus como falso positivo.

### Conferir uma versão por conta própria {#checking-a-release-yourself}

Todo instalador publicado pode ser consultado no VirusTotal pelo SHA-256:

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.12.7.exe" -Algorithm SHA256
```

Abra `https://www.virustotal.com/gui/file/<the hash it prints>`. Se o arquivo é o publicado,
o relatório já está lá. Para a versão atual, é
[o instalador da 3.12.7](https://www.virustotal.com/gui/file/183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96)
(`183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96`).

O resultado lista o que cada motor pensa. Um punhado de detecções heurísticas numa build que inclui
arquivos de emuladores é o falso positivo descrito abaixo. O que importa é que o hash corresponda ao arquivo
que a página de releases publicou.

### Os arquivos de emuladores são sinalizados {#the-emulator-files-are-flagged}

Esta é a detecção que as pessoas realmente encontram, e é um falso positivo. Registrar conquistas de um
jogo sem um cliente de loja em execução significa colocar ao lado dele uma biblioteca substituta: o emulador da Steam (GBE
Fork) ou um loader da Ubisoft. Os mecanismos de detecção vigiam exatamente isso, então sinalizam o que o arquivo
*faz*, não o que ele contém. O Windows Defender coloca em quarentena de uma só vez todas as cópias que consegue ver: na pasta
do jogo, instalada com o AW Next e no cache dele.

**Quando dispara.** No momento em que um arquivo é gravado, e somente então:

| O que você fez | O que é gravado |
|---|---|
| Executou um reparo, pelo menu de um jogo ou pelas Configurações | o emulador ou o loader, na pasta desse jogo |
| Abriu **Configurações → Emuladores → Ubisoft / Uplay R1/R2** | os loaders incluídos, no cache do próprio AW Next |
| Ativou **Corrigir automaticamente os jogos recém-detectados** | o mesmo, durante uma varredura, para cada jogo que precisa |

Iniciar o AW Next não grava nenhum deles. O reparo automático vem desativado a menos que você o ative, e avisa
antes, com a chance de adicionar primeiro uma exclusão do Defender. Se ele já estava ativado, o mesmo
aviso aparece uma vez, antes da primeira gravação, com a exclusão e o interruptor de desativar na caixa de diálogo.
Nada é gravado enquanto a janela está oculta na bandeja.

**O que o AW Next faz a respeito.** Uma quarentena é informada como um problema de antivírus, com um botão para
permitir a pasta no Windows Defender e outro para recolocar os arquivos removidos. **Configurações →
Emuladores → Ubisoft / Uplay R1/R2 → Restaurar DLLs integradas** as restaura a qualquer momento.

**O que fazer.** Permita o arquivo que o antivírus citou, ou exclua
`%APPDATA%\Achievement Watcher Next\cache`. Isso protege as cópias do próprio AW Next; a cópia na pasta de um
jogo ainda pode ser sinalizada, então exclua essa pasta também se continuar acontecendo. Informar o falso
positivo ao seu fornecedor resolve para todo mundo.

O Windows Defender chama o arquivo do GBE Fork de `Trojan:Win32/Suschil!rfn` enquanto o AW Next o baixa para o
cache. É o mesmo falso positivo: permita-o, ou exclua a pasta do cache, e execute a correção
de novo.

**Para conferir primeiro.** Os dois são de terceiros e de código aberto: o emulador da Steam vem das
[versões oficiais do GSE Fork](https://github.com/Detanup01/gbe_fork), e os loaders da Ubisoft acompanham em
`app/resources/uplayR1/` e `app/resources/uplayR2/` no repositório. O AW Next verifica os incluídos
com base em digests SHA-256 conhecidos, na arquitetura PE deles e na capacidade de lidar com conquistas antes que qualquer
reparo os use, e recusa um arquivo que falhe.

### Um antivírus reage enquanto o AW Next está em execução {#an-antivirus-reacts-while-aw-next-runs}

Mecanismos comportamentais (System Watcher da Kaspersky, Advanced Threat Defense da Bitdefender) julgam o que um
programa faz, não o que ele contém. O AW Next não inicia o PowerShell para notificações do Windows, sons de toast
ou a verificação da assinatura de atualização, e não compila código em `%TEMP%`: as capturas de tela usam o
auxiliar nativo que acompanha o app, e a verificação de notificações chama o Windows diretamente.

Se o seu antivírus ainda assim reagir, anote o nome exato da detecção e informe o arquivo que ele cita como falso
positivo. Para a Kaspersky, é [opentip.kaspersky.com](https://opentip.kaspersky.com): procure o arquivo
pelo hash e depois **Submit to reanalyze**.

## A janela não abre {#the-window-does-not-open}

- Use o ícone da bandeja (na área de notificação) caso o app tenha iniciado oculto.
- Encerre um processo travado do AW Next e inicie-o de novo.
- Remova `ELECTRON_RUN_AS_NODE` do ambiente se ela foi definida para desenvolvimento; ela faz o
  Electron iniciar como um Node comum.
- Verifique o `renderer.log` e o log principal do app para ver o primeiro erro.
- Experimente **Configurações → Geral → Desativar a aceleração de hardware** se a interface ficar visível por tempo suficiente para
  mudá-la.

## Começar com um perfil novo {#start-with-a-fresh-profile}

Use isto apenas depois de fazer backup dos dados que você quer manter:

1. Saia totalmente do AW Next pela bandeja.
2. Renomeie `%APPDATA%\Achievement Watcher Next` para `Achievement Watcher Next.backup`.
3. Inicie o app e reproduza o problema com o perfil novo.

Se o problema desaparecer, restaure apenas os dados de que precisa ou anexe os arquivos de configuração relevantes
ao relato. Renomear deixa um caminho de volta; excluir não.

## Relate o problema {#report-the-problem}

Pesquise primeiro as [issues existentes](https://github.com/Shirowwww/Achievement-Watcher-Next/issues). Se
nenhuma corresponder, abra um bug usando o modelo do repositório e anexe os logs depois de remover tudo o que
você não quer compartilhar publicamente.

---

**Veja também:** [Perguntas frequentes](faq.md) para respostas curtas · [Ferramentas avançadas](advanced.md) para manutenção,
limpeza de caches e redefinições · [Estado do jogo](game-health.md) para problemas de um único jogo.

O caminho do usuário termina aqui. A documentação então se torna técnica:
[Referência do Goldberg/GBE](../goldberg-gbe.md) para formatos de arquivo e regras de detecção, e
[Arquitetura](../architecture.md) para os limites entre app / renderer / Watchdog.

<div align="center">

[← Documentação](README.md) · [Primeiros passos](getting-started.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
