---
title: "Como o AW Next se compara"
description: "Como o Achievement Watcher Next se diferencia do Achievement Watcher 2.x e do app Achievements, recurso por recurso."
---

# Como o AW Next se compara

O Achievement Watcher Next é uma alternativa e o sucessor do Achievement Watcher de Xan105. Ele
roda no Windows e no Linux, lê Steam, GOG, Epic, Ubisoft, Xbox PC e saves de emuladores da Steam, repara uma
configuração do Goldberg ou do GBE Fork de dentro do app e escolhe o próprio meio de notificação. O Achievements de
PSerban93 é o outro rastreador para Windows em desenvolvimento ativo, e o Sentinel é só para Linux.

O AW Next continua [o Achievement Watcher original de Xan105](https://github.com/xan105/Achievement-Watcher)
e [o ramo 2.x de darktakayanagi](https://github.com/darktakayanagi/Achievement-Watcher). Esta página o coloca
ao lado dessa linhagem, ao lado do [Achievements](https://github.com/PSerban93/Achievements), o outro
rastreador para Windows em desenvolvimento ativo, e ao lado do [Sentinel](https://github.com/RemakeCode/sentinel), um
observador só para Linux de saves emulados da Steam.

Os quatro leem bem as conquistas, então a pergunta útil é quais extras combinam com o seu jeito de jogar. As tabelas
marcam o que cada projeto faz e o que não faz.

Partes do AW Next derivam do Achievements sob a licença MIT dele, então onde uma linha marca os dois
projetos, a implementação às vezes começou como a de JokerVerse. Veja
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE).

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| Plataforma | Windows e Linux | Somente Windows | Somente Windows | Somente Linux |
| Licença | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| Runtime de desktop | Electron 44 | Electron 44 | Electron 12 | Go com GTK 4 e WebKitGTK 6 |
| Desenvolvimento | Ativo | Ativo (último push em 22 de outubro de 2026) | Arquivado em 13 de outubro de 2026, somente leitura | Ativo (v2.1.1, 11 de outubro de 2026) |

## De onde vêm as conquistas {#where-the-achievements-come-from}

| Fonte | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Bibliotecas locais oficiais | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · no Linux: Steam, Heroic, Lutris e Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (legado) | ❌ |
| Conexão opcional de conta | ✅ Steam (jogos que você possui, jogos compartilhados da Família, desbloqueios de outros PCs seus) · Epic · Xbox (Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Saves de emuladores da Steam | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · estruturas CODEX/RUNE/EMPRESS/Online-Fix/Tenoke, também no Linux (prefixos do Wine, e nativo para Goldberg e GBE) | ✅ Cobertura comparável | ✅ Emuladores da Steam | ⚠️ Goldberg/GSE · CODEX · RUNE, em prefixos Wine/Proton |
| Versões portáteis sem configuração | ✅ A árvore de saves é lida sozinha | ⚠️ Entrada manual | ❌ | ⚠️ Prefixos adicionados à mão |
| Goldberg Uplay R2 (Ubisoft) | ✅ Ciente da versão do loader | ❌ | ❌ | ✅ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| Emuladores de console | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ Somente RPCS3 | ❌ |
| Jogos de Xbox 360 recompilados para PC (ReXGlue e semelhantes) | ✅ Lista, ícones, DLC e desbloqueios em tempo real, mais de 60 ports conhecidos, builds para Linux | ✅ | ❌ | ❌ |
| Jogos de PS4 portados para PC | ✅ run.py, ports nativos e de executável único, PROTOTYPE, PORTHEON (UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess, esquema, DLC e ícones lidos do jogo | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ Jogos jogados importados, jogos encontrados no disco pelo histórico ou pelas playlists do RetroArch, desbloqueios em tempo real com qualquer emulador | ✅ | ❌ | ❌ |
| Patches de nicho | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| Descoberta de pastas | ✅ Configuração automática e Busca inteligente | ✅ Configuração automática | ✅ Busca inteligente | ⚠️ Reexamina os prefixos que você adiciona |
| Pastas personalizadas e jogos manuais | ✅ Por jogo ou biblioteca inteira | ✅ Por jogo | ⚠️ Configuração manual | ⚠️ Caminhos de prefixo e de emulador |

O AW Next e o Achievements agora leem praticamente as mesmas fontes. O AW Next vai mais fundo nas estruturas de PC emulado
e é o único dos quatro que pode corrigir saves de Uplay R2 e SocialClub.

## Quando um jogo não informa nada {#when-a-game-does-not-report}

Todo rastreador pode dizer que um jogo está parado em 0%. O AW Next também tenta consertar.

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Relatório de estado por jogo com reparos guiados | ✅ | ❌ | ❌ | ❌ |
| Instalar e reparar o runtime do emulador | ✅ Goldberg / GBE, esquemas incluídos | ⚠️ Geração de esquema | ❌ Manual | ⚠️ Configuração em melhor esforço com o fork do Goldberg |
| Backup e restauração antes de qualquer alteração | ✅ Mais Steamless e bypass opcional da verificação da API | ❌ | ❌ | ❌ |
| Redefinir ou restaurar as conquistas de um jogo | ✅ | ❌ | ❌ | ❌ |
| Desbloqueio manual | ✅ | ❌ | ❌ | ❌ |
| Definir o AppID de um jogo manualmente | ✅ | ❌ | ❌ | ❌ |
| Substituição da fonte por jogo | ✅ Auto / Steam / Ubisoft | ❌ | ❌ | ⚠️ Uma única fonte de dados para a biblioteca inteira |
| Lista negra e preenchimento offline de nomes | ✅ | ⚠️ Lista negra | ❌ | ❌ |

## Notificações {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Meios | ✅ Toast nativo + overlay no jogo + fonte de navegador do OBS + toast da Steam no Modo Jogo (plugin Decky) | ✅ Toast nativo + overlay animado | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ Notificação do desktop + plugin Decky no Modo Jogo |
| Escolhe o próprio meio | ✅ Modo Automático, por estado de cada jogo | ❌ Escolha fixa | ❌ Escolha fixa | ❌ |
| Preset designer, sem código | ✅ 14 modelos iniciais, prévia ao vivo, 10 presets incluídos, entre eles o Steam Original | ⚠️ Presets e temas embutidos, os personalizados escritos em HTML/CSS | ❌ | ❌ |
| Presets compartilháveis | ✅ `.awpreset` + galeria da comunidade | ❌ | ❌ | ❌ |
| Estilo de raridade, platina e conclusão | ✅ Raridade em 3 níveis, barra de conclusão | ✅ Raridade | ❌ | ❌ |
| Presets por emulador | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| Sons | ✅ Escolha aleatória, FLAC/M4A/AAC | ✅ | ⚠️ Arquivo personalizado | ✅ Sons personalizados |
| Capturas de tela | ✅ Captura com suporte a HDR no Windows (tone mapping BT.2408), também no Linux sob X11 e Wayland | ✅ Captura HDR | ✅ | ❌ |
| Videoclipes de um desbloqueio | ✅ 10-30 s, 30/60 FPS, H.264 · HEVC · AV1, tone mapping HDR; no Linux, gpu-screen-recorder ou o gravador WebM integrado | ✅ 10-30 s, 30/60 FPS | ⚠️ Pelo OBS | ❌ |
| Notificações de tempo de jogo e progresso | ✅ Silenciamento de progresso por jogo | ✅ Silenciamento de progresso por jogo | ✅ Tempo de jogo | ✅ Progresso, em várias etapas |
| Visual de notificação próprio por jogo | ✅ Cada jogo pode substituir preset, posição, som e escala | ❌ | ❌ | ❌ |

## O app em si {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Busca de biblioteca, jogos e conquistas | ✅ | ✅ | ✅ | ⚠️ Ordenação da biblioteca |
| Filtro de somente instalados e ações sobre jogos | ✅ Filtro · desinstalar · restaurar | ⚠️ Filtro por plataforma | ❌ | ❌ |
| Navegação completa por controle | ✅ App + overlay, no Windows e no Linux | ✅ App + overlay | ❌ Planejada | ⚠️ Pelo plugin Decky |
| Steam Deck | ⚠️ Plugin Decky, ainda não confirmado num Deck de verdade | ❌ | ❌ | ✅ Plugin Decky no Gamescope |
| Temas | ✅ Embutidos + editor Personalizado + `.awtheme` compartilhável + galeria | ✅ Embutidos + arquivos de tema do usuário | ❌ | ❌ |
| Idiomas da interface | ✅ 28 incluídos | ✅ Cerca de 30 incluídos | ✅ 18 | ❌ |
| Processo em segundo plano | ✅ Um único daemon na bandeja | ✅ App na bandeja | ⚠️ Watchdog separado | ✅ App na bandeja |
| Downloads extras de runtime | ✅ Nenhum runtime de navegador; o fork do GBE só é baixado quando você o instala ou repara | ⚠️ Chromium do Playwright | ✅ Nenhum | ⚠️ GTK 4 e WebKitGTK 6 do sistema |
| Acesso por teclado e leitor de tela | ✅ Configurações, caixas de diálogo e overlay acessíveis por Tab, foco devolvido quando uma caixa de diálogo fecha | ⚠️ Atalhos de teclado e mapa do controle | ❌ | ❌ |
| Instalador, desinstalador e janela de atualização | ✅ Instalador e desinstalador próprios, janela de atualização com notas de versão e progresso | ❌ | ❌ | ⚠️ Pacotes da distribuição e Flatpak |
| Documentação | ✅ Guias, especificações de formato e galerias | ⚠️ README | ⚠️ README | ⚠️ README e um guia do Goldberg |

## Linux e Steam Deck {#linux-and-the-steam-deck}

O AW Next também é distribuído como app nativo para Linux (AppImage x64, nunca pelo Wine). Ele acompanha jogos executados
pela Steam e Proton, Wine, Lutris, Heroic e Bottles, e jogos nativos de Linux, com os mesmos
popups, overlay e tempo de jogo do Windows. O suporte ao Steam Deck é novo: as notificações no Modo Jogo passam
pelo plugin Decky do repositório, e nem o plugin nem o popup do Modo Jogo foram
confirmados num Deck de verdade.

<sub>✅ = compatível e documentado · ⚠️ = parcial, manual ou um fluxo de trabalho diferente · ❌ = indisponível ou
não documentado no ramo público atual. As colunas dos concorrentes foram comparadas com os READMEs públicos deles,
os metadados do GitHub e os manifestos de pacotes em 22 de outubro de 2026. A coluna do AW Next reflete a versão
3.12.2 e as alterações ainda não lançadas de outubro de 2026. Um ❌ em outra coluna geralmente significa não documentado
e não impossível, e todos esses projetos andam rápido.</sub>

## Hydra e Steam Achievement Manager {#hydra-and-steam-achievement-manager}

Duas outras ferramentas aparecem nas mesmas buscas, e fazem um trabalho diferente.

- O [Hydra](https://hydralauncher.gg/) se descreve como um launcher de jogos que permite baixar jogos
  e rastrear conquistas. O AW Next não baixa jogos.
- O [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) se descreve como um aplicativo
  leve e portátil usado para gerenciar conquistas e estatísticas na Steam. Ele precisa do cliente Steam,
  de uma conta Steam e de acesso à rede. O AW Next mostra e rastreia conquistas e não precisa de nenhuma
  conta Steam.

Nenhum dos dois está nas tabelas acima, que comparam os rastreadores que leem saves locais e de emuladores.

## Em resumo {#in-short}

O **AW Next** serve a uma biblioteca que precisa continuar funcionando no Windows e no Linux: launchers oficiais e
saves emulados lado a lado, um relatório de estado que repara uma configuração do Goldberg ou do GBE em vez de
apenas relatá-la, notificações que escolhem o próprio meio, e presets e temas que você pode projetar e
compartilhar.

O **Achievements** tem uma lista ampla de fontes no Windows, incluindo RetroAchievements, ports recompilados e
patches de nicho, com forte configuração automática, um overlay animado e videoclipes de um desbloqueio.

O **Achievement Watcher 2.x** é a base histórica, com ampla compatibilidade com emuladores e meios de
notificação legados no Electron 12. O repositório dele foi arquivado em 13 de outubro de 2026 e não é mais
mantido.

O **Sentinel** é uma opção leve para Linux para saves de Goldberg, CODEX e RUNE, com um plugin para Steam Deck
bem integrado.

---

<div align="center">

[← Documentação](README.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
