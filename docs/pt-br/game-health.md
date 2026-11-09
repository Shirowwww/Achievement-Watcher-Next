---
title: "Estado do jogo"
description: "O relatório de cada jogo que diz por que um jogo está ou não sendo rastreado, com os reparos guiados que se aplicam a ele."
---

# Estado do jogo

Quando um jogo se comporta mal, abra primeiro o painel **Estado do jogo** dele. Ele diz se o AW Next consegue ver o
jogo, ler as conquistas dele e anunciar os desbloqueios, e oferece apenas os reparos que se aplicam.

Abra-o pelo botão de **ferramentas** no canto superior direito de um cartão de jogo, ou pelo menu de
botão direito do jogo. O painel tem três abas: **Estado**, **Executável**, que define o programa a
observar enquanto você joga, e **Notificação**, onde o jogo pode ter o próprio preset de popup, posição,
som e escala (veja [Comportamento por jogo](notifications.md#per-game-behavior)).

<div align="center">
<picture><source srcset="../assets/shot/game-health-800.webp 800w, ../assets/shot/game-health.webp 903w" sizes="(max-width: 700px) 100vw, 620px"><img src="../screenshot/game-health.png" width="620" height="557" alt="Painel Estado do jogo mostrando o estado Requer atenção, as verificações e os reparos que se aplicam"></picture><br>
<sub>Um estado, o motivo dele, as verificações por trás e os reparos que se aplicam</sub>
</div>

## Os três estados {#the-three-states}

| Estado | O que significa |
|---|---|
| **Pronto** | O jogo é detectado, os dados de conquistas dele estão disponíveis e o AW Next o observa para os desbloqueios. |
| **Requer atenção** | O jogo funciona, mas parte da configuração dele está incompleta. As verificações mostram qual parte. |
| **Sem acompanhamento** | Falta algo essencial, então nenhum desbloqueio pode ser registrado: o jogo não pode ser localizado, não tem dados de conquistas ou falta o emulador que grava os desbloqueios dele. |

A frase sob o estado informa a causa, as verificações mostram qual parte está com problema e um botão de
reparo age exatamente nela.

- O modo **Simples** descreve os resultados em palavras simples (*Dados de conquistas encontrados*, *Detectado quando o jogo inicia*).
  O **Avançado** acrescenta contagens exatas, o processo observado e o meio de notificação.
- **Detalhes técnicos**, no fim nos dois modos, guarda todos os valores brutos. Pressione **Copiar** para um relato
  de bug. Um valor longo rola ao passar o mouse.

Jogos de emuladores de console não precisam de um executável do Windows nem dos arquivos do jogo.

Alguns jogos não registram nada offline, seja qual for a configuração. Halo: Campaign Evolved e The Crew
Motorfest têm as conquistas concedidas pelos servidores da publisher, então um crack não salva nenhuma. O
painel deles avisa isso desde a primeira execução.

## As verificações {#the-checks}

| Verificação | O que responde | Correção típica |
|---|---|---|
| **Arquivos do jogo** | A pasta de instalação ainda existe? | **Localizar o jogo** |
| **Executável** | Qual programa deve ser observado enquanto você joga? | **Localizar o jogo** |
| **Identidade do jogo** | A qual AppID e plataforma este jogo foi associado? O modo Simples omite. | **Corrigir o arquivo de identificação do jogo** ou **Definir o AppID manualmente** |
| **Dados de conquistas** | Existe uma lista de conquistas e ela está completa? | **Reescrever os dados de conquistas** |
| **Configuração do emulador** | Um jogo que precisa de um emulador da Steam tem um e qual o atende? Para um jogo da Ubisoft, isso também cobre o loader do Uplay e se ele alguma vez pediu uma conquista. | **Instalar o arquivo do emulador**, **Mudar para o emulador compatível** ou **Reparar o suporte a conquistas Ubisoft** |
| **Progresso** | Algum desbloqueio ou save já foi encontrado? | Inicie o jogo e desbloqueie algo |
| **Contadores de progresso** | Para jogos no estilo CODEX/RUNE que rastreiam uma estatística em vez de um desbloqueio simples, o AW Next buscou a estatística por trás de cada conquista? Exibido apenas para jogos que usam uma. | **Buscar contadores de progresso** |
| **Detecção do início do jogo** | O rastreador em segundo plano percebe quando este jogo inicia? Sozinho, ele não registra nenhum desbloqueio: isso é trabalho do emulador. | **Monitorar este jogo** |
| **Notificações** | Qual meio entregou a última notificação deste jogo e por quê? | **Enviar uma notificação de teste** |

## Os reparos {#the-repairs}

O painel mostra apenas os reparos que podem consertar este jogo. Cada um diz o que vai mudar e onde os
arquivos anteriores ficam guardados. Nada é reescrito sem um backup ou uma confirmação.

| Reparo | O que faz |
|---|---|
| **Localizar o jogo** | Abre um seletor para escolher o executável a observar. |
| **Abrir a pasta do jogo** | Abre a pasta de instalação no Explorador. |
| **Reescrever os dados de conquistas** | Grava a lista de conquistas, os ícones e as configurações do emulador, copiando antes os arquivos existentes para um backup. |
| **Instalar o arquivo do emulador** | Baixa para a pasta do jogo a build compatível do emulador, mantendo o arquivo que ele substitui como `.bak`. |
| **Mudar para o emulador compatível** | Para um jogo atendido por outro crack que não registrou nada: instala o emulador compatível por cima e renomeia a configuração desse crack para `.bak`. |
| **Desfazer a troca de emulador** | Aparece onde um dos dois acima foi executado. Devolve os arquivos do próprio jogo a partir das cópias `.bak` e retira o emulador compatível. |
| **Corrigir o arquivo de identificação do jogo** | Reescreve o `steam_appid.txt` quando o emulador anuncia um jogo e o AW Next associou outro. Pede o AppID certo, sugerindo a associação do AW Next, e guarda o arquivo anterior. |
| **Buscar contadores de progresso** | Pergunta à Steam qual estatística move cada conquista, para jogos no estilo CODEX/RUNE. Não grava nada na pasta do jogo. |
| **Reparar o suporte a conquistas Ubisoft** | Para um jogo compatível da Ubisoft, reescreve a configuração do loader, o esquema e o redirecionamento de saves numa única transação, com todo arquivo tocado salvo em backup. Veja [Configuração do Uplay](uplay-r2.md). |
| **Ativar as conquistas offline** | Para um jogo da Ubisoft cujo log do loader prova que ele nunca pediu uma conquista porque acredita estar desconectado. Adiciona uma chave de sessão provisória ao INI ao lado do jogo; pressione de novo para removê-la. Veja [Configuração do Uplay](uplay-r2.md#a-game-that-never-asks-for-an-achievement). |
| **Monitorar este jogo** | Adiciona o jogo ao rastreador em segundo plano para que o tempo de jogo e os desbloqueios em tempo real sejam registrados. |
| **Reativar notificações de progresso** | Reativa as notificações de progresso de um jogo que você silenciou. |
| **Enviar uma notificação de teste** | Dispara uma notificação com o nome e a arte deste jogo, pelo meio que ele realmente usaria. |

> [!IMPORTANT]
> Uma divergência nem sempre é culpa do emulador: se ele foi configurado de propósito para o ID que está no disco,
> deixe como está. **Definir o AppID manualmente** (botão direito) corrige uma divergência de nome de pasta de vez, em vez
> de corrigir o arquivo toda vez. Veja [Configuração do Goldberg / GBE](emulator-setup.md#set-appid-manually).

## Estados comuns e o que fazer {#common-states-and-what-to-do}

| O painel diz | O que geralmente significa |
|---|---|
| *Nenhuma lista de conquistas foi encontrada* | O jogo não tem conquistas, ou a fonte dele está desativada. Verifique **Configurações → Fonte**. |
| *Este jogo precisa de um emulador da Steam e nenhum está configurado* | Use **Aplicar correção de emulador** no menu de botão direito. Veja [Configuração do Goldberg / GBE](emulator-setup.md). |
| *O arquivo do emulador que o lê está ausente* | **Instalar o arquivo do emulador** coloca o runtime correspondente. |
| *O ColdClient atende este jogo, mas…* | O `ColdClientLoader.ini` ao lado do loader inicia um arquivo ausente ou outro programa, cita outro jogo ou não tem loader para os 32 ou 64 bits do jogo. Corrija esse arquivo; o AW Next apenas o lê. Quando estiver certo, **Iniciar pelo loader ColdClient** faz o Jogar iniciar o loader. |
| *O emulador da Epic ainda tem o AppID de exemplo* | O `NemirtingasEpicEmu.json` traz o AppID feito de zeros, ou o próprio arquivo EOSSDK da Epic continua no lugar, então o emulador nunca é carregado. Coloque no arquivo o id da Epic do jogo. |
| *A lista de conquistas não corresponde ao que o jogo vai procurar* | **Reescrever os dados de conquistas**. É o resultado habitual de uma atualização de repack. |
| *Nenhum progresso de conquistas foi encontrado ainda* | Normal para um jogo que você não jogou desde que o configurou. Inicie-o e desbloqueie algo. |
| *O AW Next não está observando este jogo enquanto ele roda* | **Monitorar este jogo** o adiciona ao rastreador. |
| *Não foi possível enviar a última notificação* | Envie uma notificação de teste e depois veja [Notificações](notifications.md#if-a-test-or-unlock-does-not-appear). |
| *O Windows ocultou a última notificação durante o jogo* | Ela foi direto para a Central de Notificações porque o jogo estava em tela cheia ou o Não Perturbe estava ativado. Ative as [Notificações prioritárias](notifications.md#priority-windows-notifications), ou use Automático ou Overlay no jogo. |
| *Funcionando - alternativa do Windows ativa* | Não é uma falha. A entrega Automática escolheu uma notificação do Windows para este jogo; veja [como o Automático decide](notifications.md#how-automatic-decides). |
| *O jogo nunca pediu uma conquista* | Ele lê a sessão vazia da Ubisoft como desconectada. **Ativar as conquistas offline** o libera; nada é enviado a lugar nenhum. Inicie o jogo uma vez depois. |
| *Conquistas offline ativadas, inicie o jogo uma vez* | A configuração foi gravada e nada foi avaliado ainda. O botão ao lado agora diz **Desativar as conquistas offline**. |
| *Atendido por ALI213, OnlineFix, GBE Fork…* | O emulador que de fato lê esse jogo, identificado pelos próprios arquivos. A um jogo da Ubisoft atendido assim não é oferecido um reparo do Uplay: a camada Uplay dele não é usada, não está quebrada. Isso cobre versões que mantêm o `steam_api64.dll` da Valve: uma build RUNE rodando de `Steam\steamclient64.dll`, ou uma versão VOICES38 carregando o próprio GBE Fork renomeado (`steam_api64.v38`); nunca instale o emulador sobre esta última. As builds da Ubisoft do online-fix são reconhecidas, e uma correção de conquistas nelas avisa que o jogo online pode parar. |
| *Só faltam alguns ícones* | **Reescrever os dados de conquistas** baixa os ícones que faltam. |
| *Executado por mais de uma hora e nem uma conquista registrada* | O crack que atende o jogo provavelmente nunca informa conquistas. Use **Mudar para o emulador compatível** quando oferecido; caso contrário, verifique se o jogo inicia a partir da própria pasta. |
| *Arquivo de identificação do jogo*, com um atalho da Steam para este jogo | A Steam inicia um atalho que não é da Steam sem nenhum `steam_appid.txt` ao lado, então o emulador salva sob outro ID. **Reescrever os dados de conquistas** grava o arquivo ali. |

---

**Próximo:** [Solução de problemas](troubleshooting.md) - para os problemas que o Estado do jogo não resolve sozinho.

<div align="center">

[← Documentação](README.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
