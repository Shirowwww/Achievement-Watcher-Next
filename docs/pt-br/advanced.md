---
title: "Ferramentas avançadas"
description: "As ferramentas de manutenção em Configurações, Avançado: limpar caches, diagnóstico, backup do perfil, AppIDs manuais e redefinições."
---

# Ferramentas avançadas

Estas ferramentas ficam em **Configurações → Avançado** ou no menu de botão direito de um jogo. A aba Avançado
só existe enquanto a interface está no modo **Avançado**: mude o controle **Interface** no topo
das Configurações se você não a vir. Nada se perde ao voltar.

<div align="center">
<picture><source srcset="../assets/shot/advanced-panel-800.webp 800w, ../assets/shot/advanced-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/advanced-panel.png" width="720" height="529" alt="Configurações - Avançado, configuração e manutenção"></picture><br>
<sub>Configuração &amp; manutenção; as outras seções ficam recolhidas abaixo dela</sub>
</div>

## Configuração e manutenção {#setup-and-maintenance}

| Ferramenta | O que faz |
|---|---|
| **Corrigir todos os jogos detectados** | Executa o reparo correspondente (Steam/GBE Fork ou Ubisoft/Uplay R2) em todos os jogos compatíveis detectados com uma pasta de instalação conhecida. Isso reconstrói jogos que já têm uma configuração. |
| **Desativar a aceleração por hardware** | Desliga a aceleração da GPU quando a janela ou o overlay se comportam mal. Exige reinicialização. |
| **Limpar caches** | Exclui apenas os caches que podem ser baixados de novo: arquivos de atualização, o cache de esquemas e ícones da Steam/Ubisoft e as ferramentas de correção de emuladores baixadas. Configurações, saves, backups e arquivos colocados manualmente nunca são tocados. |
| **Reverificar listas de conquistas** | Verifica na Steam as conquistas adicionadas por uma atualização do jogo. Isso roda a cada 3 dias; o botão força agora. |
| **Atualizações automáticas de dados de conquistas** | Ativado por padrão. Desativado, interrompe essa reverificação e o reparo de descrições em branco, para quem mantém o `steam_cache` manualmente. **Reverificar listas de conquistas** continua funcionando enquanto está desativado. |

As configurações de reparo específicas de cada fonte ficam em **Configurações → Emuladores**. **Ubisoft / Uplay R2** guarda o
estado do pacote, os controles de importação/restauração de DLL e o reparo em lote direcionado; os detalhes do loader e do INI continuam
automáticos.

**Limpar caches** é a primeira coisa a tentar quando uma atualização continua falhando no mesmo arquivo baixado.

## Diagnóstico {#diagnostics}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Configurações - Avançado, diagnóstico" loading="lazy" decoding="async"></picture><br>
<sub>As versões e um clique até as pastas de logs e de dados</sub>
</div>

O cartão Diagnóstico mostra as versões do app, do Electron, do Node e do Chrome, e abre a pasta de logs,
a pasta de dados ou uma verificação de atualização. **Exportar logs (.zip)** reúne todos os arquivos de log num único arquivo compactado
enquanto o app roda; copiá-los à mão não é confiável porque os processos que os gravam nunca param.
Seu nome de usuário e qualquer chave, token ou senha são mascarados no arquivo compactado, não nos logs no disco. Veja
[Solução de problemas](troubleshooting.md#open-logs-and-local-data) para saber o que um relato de bug precisa.

## Backup do perfil {#profile-backup}

<div align="center">
<picture><source srcset="../assets/shot/profile-backup-panel-800.webp 800w, ../assets/shot/profile-backup-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/profile-backup-panel.png" width="720" height="529" alt="Configurações - Avançado, backup do perfil" loading="lazy" decoding="async"></picture><br>
<sub>Exportar perfil e Restaurar perfil, em Configurações → Avançado</sub>
</div>

**Exportar perfil…** salva suas configurações, escolhas de biblioteca, presets, temas, capas, planos de fundo personalizados,
pontos de restauração do GBE e tempo de jogo num único arquivo `.awbackup`, para uma reinstalação ou um PC novo. Logins,
caches e logs nunca são salvos, então você entra de novo na Epic, Steam, Xbox, PlayStation e
RetroAchievements depois. **Restaurar perfil…** confere o arquivo inteiro primeiro e o aplica na
próxima inicialização. Os arquivos que ele substitui são mantidos, e uma restauração que falha coloca tudo de volta.

## Jogos removidos {#removed-games}

Um jogo retirado com **Remover do AW Next** é listado em **Configurações → Geral → Jogos removidos**,
e pode ser trazido de volta um a um ou todos de uma vez. Use para uma pasta perdida que a varredura continua
encontrando mas que não é um jogo; para manter um jogo de verdade fora de vista, **Ocultar da exibição** é mais leve
(veja [Ocultar, remover ou limpar um jogo](#hide-remove-or-clear-a-game)).

## Redefinir as conquistas de um jogo {#reset-a-games-achievements}

**Redefinir as conquistas**, na página do jogo ao lado do tempo de jogo ou no menu de botão direito dele, devolve
todas as conquistas ao estado bloqueado para que você jogue o jogo todo de novo. O AW Next as anuncia como
novas quando são desbloqueadas.

<div align="center">
<picture><source srcset="../assets/shot/achievements-800.webp 800w, ../assets/shot/achievements.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/achievements.png" width="800" height="492" alt="A página de um jogo com Redefinir as conquistas" loading="lazy" decoding="async"></picture><br>
<sub>Redefinir fica ao lado da contagem de conclusão na página do próprio jogo</sub>
</div>

Todo arquivo envolvido tem antes um backup em
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`, e a confirmação lista
os arquivos exatos antes de qualquer coisa ser tocada. Um arquivo cujo backup falha é ignorado, não apagado.

| Fonte | O que uma redefinição faz |
|---|---|
| Emuladores da Steam (Goldberg / GBE e estruturas compatíveis, incluindo Goldberg SocialClub e Uplay R2) | Remove o save de conquistas. O emulador grava um novo no próximo desbloqueio. |
| RPCS3 | Remove o `TROPUSR.DAT`. A lista de troféus (`TROPCONF.SFM`) é deixada como está. |
| ShadPS4 | Bloqueia de novo os troféus dentro do `TROP*.XML`, que também guarda a lista de troféus, então o arquivo é editado, não removido. |
| KytyPS5 | Remove os arquivos de desbloqueio `trophies_*.json` do jogo. A lista de troféus fica no pacote do próprio jogo. |
| Xenia | Limpa a marca de conquistado dentro do `.gpd`, que também guarda a lista de conquistas, então o arquivo é editado. |
| Steam, GOG Galaxy, Ubisoft Connect, EA, Epic, Xbox | **Não é possível.** Essas fontes guardam os desbloqueios na sua conta e os ressincronizam; só a conta pode apagá-los. O AW Next avisa isso. |

Os contadores de progresso guardados ao lado das conquistas (`stats.ini`, `stats.bin`, …) também são redefinidos e recebem backup:
numa conquista "percorra 1000 km", o contador é o progresso, e deixá-lo cheio faria
a conquista disparar de imediato ou nunca mais.

**Restaurar um backup de conquistas**, no mesmo menu de botão direito, devolve uma redefinição inteira. Atualize a
biblioteca depois para ler os desbloqueios restaurados.

> [!NOTE]
> Uma redefinição também limpa o registro do próprio AW Next do que já havia sido desbloqueado, inclusive no
> rastreador em segundo plano em execução. Caso contrário, uma conquista obtida de novo nunca seria anunciada outra vez.

## Bloquear de novo uma única conquista {#re-lock-a-single-achievement}

Clique com o botão direito numa conquista desbloqueada na página do jogo e escolha **Bloquear esta conquista novamente** para
jogar de novo só por essa. Somente essa conquista volta a ficar bloqueada: a marca, o horário de desbloqueio e
o progresso no save do emulador, o contador dela quando o save liga um a ela, e o
registro do próprio AW Next, de modo que ela seja anunciada como nova quando você a obtiver. A confirmação lista os arquivos e cada arquivo
recebe backup antes, como numa redefinição; **Restaurar um backup de conquistas** a devolve.

Feche o jogo primeiro. Um emulador guarda os desbloqueios na memória e os grava de volta quando o jogo
sai, o que desfaria a alteração, então o AW Next se recusa enquanto um jogo está em execução.

Funciona com os saves de texto dos emuladores da Steam (Goldberg e GSE, CODEX, RUNE, OnlineFix, RLD!,
3DM, ALI213, TENOKE, Hoodlum, RAZOR1911, CreamAPI), UniverseLAN, Nemirtingas, Uplay R1 e R2,
GreenLuma e LumaPlay no Windows, e com os saves de console do RPCS3, ShadPS4, Xenia, KytyPS5, os ports
de Xbox 360 e o XLLN. Os saves do SmartSteamEmu (`stats.bin`) e do SKIDROW (`achieve.dat`) não são editados uma
conquista de cada vez, pois o layout deles não é documentado; use **Redefinir as conquistas** para esses.

## Ocultar, remover ou limpar um jogo {#hide-remove-or-clear-a-game}

O menu de botão direito de um jogo tem três formas de fazê-lo sumir, da mais leve à mais forte:

| Entrada | O que acontece | Como desfazer |
|---|---|---|
| **Ocultar da exibição** | O jogo sai de Todos os jogos, de todas as coleções e das estatísticas, mas continua rastreado e continua notificando. | O menu Coleções mostra uma visualização **Ocultos** enquanto um jogo está oculto; clique com o botão direito ali e escolha **Exibir novamente**. |
| **Remover do AW Next** | A varredura ignora o jogo: ele sai da biblioteca. Feito para ferramentas e outras coisas que não são jogos. | **Configurações → Geral → Jogos removidos**. |
| **Limpar os dados deste jogo…** | Tudo o que o AW Next guarda sobre o jogo é apagado: os saves de conquistas (com backup antes, como uma redefinição), o tempo de jogo, a lista de conquistas e os ícones em cache, as configurações por jogo e a configuração de emulador que o AW Next gravou na pasta dele. A confirmação lista cada parte antes. | Nada a desfazer: a próxima varredura encontra o jogo de novo como um novo. |

## Renomear um jogo {#renaming-a-game}

**Configurações do jogo → Renomear…**, no menu de botão direito, define o nome sob o qual um jogo é exibido: no
cartão e na tela dele, na busca e na ordenação, nas notificações e nas pastas em que capturas de tela e clipes
são salvos. A busca ainda encontra o jogo pelo nome original. Deixe o campo vazio, ou escolha
**Restaurar o nome original**, para voltar. O nome é guardado por jogo em `cfg/gameTitles.json`, então
sobrevive a novas varreduras e faz parte de um backup do perfil. As buscas de capa e a associação de jogos usam o nome
original.

**Configurações → Geral → Títulos dos jogos no meu idioma**, ativado por padrão, mostra os jogos da Steam sob o
título que a Steam dá a eles no idioma das suas conquistas (o idioma do próprio jogo quando ele tem um).
As capas seguem o mesmo idioma. O catálogo local da Steam responde pelos jogos que o seu cliente Steam conhece;
os demais são consultados uma vez, em lotes, e conferidos de novo após um mês. Um nome que você mesmo definiu sempre
prevalece.

## Editar o tempo de jogo de um jogo {#editing-a-games-playtime}

**Conquistas e tempo de jogo → Editar tempo de jogo…**, no menu de botão direito, substitui o tempo de jogo total de um jogo,
por exemplo um trazido de outro rastreador ou um que perdeu sessões. Digite as horas
(`12.5`) ou horas e minutos (`12h30` ou `12:30`). A data da última sessão é mantida, e o AW Next
soma as sessões seguintes ao novo total. Um jogo que você tem na Steam nunca fica abaixo do tempo de jogo que a Steam
informa: a próxima varredura leva um total menor de volta ao da Steam.

## Um idioma de conquistas diferente para um jogo {#a-different-achievement-language-for-one-game}

**Configurações do jogo → Idioma das conquistas**, no menu de botão direito, mostra as conquistas e as
notificações de um jogo em um idioma diferente do resto da biblioteca. **Igual ao aplicativo** volta à
escolha global.

## Adicionar um jogo manualmente {#add-a-game-manually}

O `+` ao lado da busca da biblioteca adiciona um jogo a partir de um título e de um executável, com
plataforma e AppID da Steam opcionais. Use para um jogo que nenhuma fonte detecta: uma build avulsa, uma instalação
portátil ou um emulador que você mesmo inicia.

Um jogo adicionado manualmente:

- pode ser iniciado e rastreia o tempo de jogo como qualquer outra entrada;
- mostra **Sem conquistas** se não tiver nenhuma, e fica de fora das estatísticas de conclusão em vez de
  contar como 0%;
- pode adotar depois um esquema de conquistas da Steam adicionando o AppID, sem ser recriado;
- mantém diagnósticos protegidos por jogo, enquanto as ações destrutivas continuam ocultas.

As pastas adicionadas manualmente trazem um ícone compacto na lista de Pastas, para distingui-las dos locais
descobertos pela Busca inteligente.

## Definir o AppID de um jogo manualmente {#set-a-games-appid-by-hand}

Clique com o botão direito num jogo cujo nome de pasta corresponde a várias versões da Steam, de modo que a associação automática escolheu
a errada, e escolha **Definir o AppID manualmente...**. A escolha é lembrada por pasta de instalação e
gravada em `steam_appid.txt`; **Limpar o AppID manual** a desfaz. O **Corrigir
o arquivo de identificação do jogo** do Estado do jogo também pede o AppID, partindo da sugestão do próprio AW Next.

## Marcar uma conquista como desbloqueada {#mark-an-achievement-as-unlocked}

Uma conquista que uma fonte não consegue ver (obtida antes de você configurar o rastreamento, ou nunca registrada por um
emulador) pode ser marcada no menu de botão direito dela com **Marcar como desbloqueado manualmente**. **Cancelar desbloqueio
manual** a desfaz. Os desbloqueios manuais persistem entre as varreduras e são apagados por uma redefinição.

## Etapas sob uma conquista {#steps-under-an-achievement}

Uma conquista longa pode ser dividida em etapas que você escreve e marca. Passe o mouse sobre ela na página do jogo
e abra **Etapas**, ou clique com o botão direito nela e escolha **Adicionar etapas**, depois digite uma etapa e pressione Enter.
Clique numa caixa para marcar uma etapa, clique duas vezes no texto para renomeá-la e use o X para removê-la.
O jogo nunca informa etapas, então elas só preenchem a barra da conquista: o desbloqueio continua vindo
do jogo, e quando vem, todas as etapas aparecem como concluídas. O overlay dentro do jogo mostra as mesmas etapas e
as marca com o mouse ou com um controle.

**Etapas** no cabeçalho do jogo exporta a lista para um arquivo para compartilhar, ou importa uma. Um arquivo leva
os textos, não as marcas, e as conquistas dele são associadas por id e depois por nome; as etapas que já existem
mantêm as marcas. As etapas ficam em `cfg/achievement-steps.json` e entram no backup do perfil.

## Ferramentas de emulador e de reparo {#emulator-and-repair-tools}

O diagnóstico e o reparo de configurações Goldberg / GBE Fork, o instalador do runtime do GBE, o Steamless e o
bypass opcional da verificação da API ficam em **Configurações → Emuladores** e no submenu
**Emulador e ferramentas** de cada jogo. Os guias:

- [Configuração do Goldberg / GBE](emulator-setup.md) - diagnosticar e reparar um jogo Steam emulado
- [Configuração do Uplay, R1 e R2](uplay-r2.md) - o equivalente para a Ubisoft
- [Referência do Goldberg / GBE](../goldberg-gbe.md) - formatos de arquivo e regras de detecção

**Remover a configuração de emulador do AW Next**, no mesmo menu, desfaz apenas a seção DLC, os interruptores
e as chaves de identidade que o AW Next gravou no `configs.user.ini` de um jogo, nunca um valor definido por você ou pelo repack,
e exclui o arquivo somente quando não sobra mais nada nele. Mostra antes exatamente o que vai remover,
que é a única forma de recuperar se você nunca fez backup desse arquivo.

**Aplicar a correção de conquistas GOG (UniverseLAN)…** aparece num jogo da GOG que traz uma dll da Galaxy. Instala
a build do UniverseLAN correspondente ao SDK da Galaxy desse jogo, guarda a dll original como backup e
nunca sobrescreve saves existentes do UniverseLAN. Os desbloqueios que ele grava em `%LOCALAPPDATA%\UniverseLAN`
são lidos e notificados como quaisquer outros.

Se um reparo colocou o emulador compatível, **Desfazer a troca de emulador** no
[Estado do jogo](game-health.md#the-repairs) devolve os arquivos do próprio crack.

> [!WARNING]
> Os reparos criam backups, mas ainda assim modificam arquivos do jogo. Use-os apenas com jogos que você possui.

---

**Próximo:** [Perguntas frequentes](faq.md) - respostas curtas para as dúvidas que mais aparecem.

<div align="center">

[← Documentação](README.md) · [Solução de problemas](troubleshooting.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
