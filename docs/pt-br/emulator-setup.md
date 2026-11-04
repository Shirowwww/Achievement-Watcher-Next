---
title: "Configuração de conquistas do Goldberg e do GBE Fork"
description: "Diagnostique ou repare um jogo Steam emulado com Goldberg ou GBE Fork, com um backup e uma confirmação antes de cada gravação."
---

# Configuração de conquistas do Goldberg e do GBE Fork

O AW Next lê os saves de conquistas que Goldberg, GBE Fork e estruturas compatíveis de emuladores da Steam
produzem. Ele também pode diagnosticar e reparar a configuração local do emulador de um jogo quando o esquema, o
AppID ou os arquivos de runtime estão incompletos.

## Como obtenho notificações de conquistas com Goldberg ou GBE Fork? {#how-do-i-get-achievement-notifications-with-goldberg-or-gbe-fork}

Goldberg e GBE Fork são emuladores da Steam: substituem a biblioteca da Steam e registram os desbloqueios em um
arquivo de save, `achievements.json`, em `%APPDATA%\GSE Saves\<appid>`. Um segundo arquivo com o mesmo nome,
na pasta `steam_settings` do jogo, apenas descreve as conquistas. O AW Next lê os dois e mostra
o popup de desbloqueio sobre o jogo. Adicione a pasta do jogo em **Configurações → Pastas**, execute a **Busca inteligente**
e clique com o botão direito no jogo escolhendo **Diagnosticar emulador** se ele ficar em 0%. Nada é gravado na
pasta do jogo até você pedir um reparo.

> [!WARNING]
> As ferramentas de reparo são opcionais. Elas modificam arquivos dentro da pasta do jogo selecionado, então use-as somente
> com jogos que você possui e mantenha qualquer backup extra que lhe importe.

## O esquema e os arquivos de save são diferentes {#schema-and-save-files-are-different}

Dois arquivos sem relação costumam se chamar `achievements.json`:

| | Arquivo de esquema | Arquivo de save de runtime |
|---|---|---|
| Local típico | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` ou `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| Gravado por | O jogo ou a configuração do emulador | O emulador enquanto o jogo roda |
| Finalidade | Nomes, descrições e ícones das conquistas | Quais conquistas foram desbloqueadas |
| Quando ausente | O tratamento de conquistas dentro do jogo pode ficar incompleto; o AW Next pode usar outra fonte de esquema | O jogo mostra 0% até o primeiro desbloqueio ser gravado |

Um arquivo de esquema não prova que algo foi desbloqueado, e um save de runtime sem entradas obtidas é um 0%
válido. As duas pastas de save podem existir para um jogo: o AW Next lê a que tiver os desbloqueios. Se uma configuração do GBE ou
do Goldberg redireciona os saves para outro lugar (`local_save_path`), o AW Next observa a pasta onde
eles caem.

## Fluxo recomendado {#recommended-workflow}

1. Adicione a biblioteca de jogos ou a raiz de saves em **Configurações → Pastas**.
2. Execute a **Busca inteligente** ou **Gerar configurações**.
3. Se o jogo mostrar dados ausentes, clique com o botão direito e escolha **Diagnosticar emulador**.
4. Leia o relatório antes de aplicar um reparo.
5. Use **Aplicar correção de emulador** para instalar a DLL de runtime e reparar o `steam_settings` juntos.
6. Inicie o jogo, desbloqueie uma conquista e atualize o AW Next se necessário.

A configuração automática para jogos recém-descobertos é opcional em **Configurações → Emuladores → Steam / GBE
Fork**. Com ela desativada, uma varredura da biblioteca não grava nada numa pasta de jogo (nenhuma DLL, nenhum arquivo de configuração,
nem mesmo um `achievements.json` ausente) até você pedir um reparo.

<div align="center">
<picture><source srcset="../assets/shot/steam-gbe-panel-800.webp 800w, ../assets/shot/steam-gbe-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/steam-gbe-panel.png" width="720" height="529" alt="Configurações - Steam / GBE Fork"></picture><br>
<sub>Reparo automático, os interruptores de DLC e identidade, e o extrator opcional de SteamStub</sub>
</div>

## Ações do menu de contexto {#context-menu-actions}

<div align="center">
<picture><source srcset="../assets/shot/emulator-tools-800.webp 800w, ../assets/shot/emulator-tools.webp 1049w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/emulator-tools.png" width="560" height="336" alt="Menu de contexto Emulador e ferramentas" loading="lazy" decoding="async"></picture><br>
<sub>Botão direito num jogo → Emulador &amp; ferramentas</sub>
</div>

### Diagnosticar emulador {#diagnose-emulator}

Informa o tipo de emulador detectado, o AppID, o local do `steam_settings`, as contagens de esquema e de saves, as entradas
ou ícones ausentes, os caminhos de save personalizados e as divergências de AppID, e se o runtime instalado é o que
o AW Next colocou ali. O diagnóstico é somente leitura.

### Aplicar correção de emulador {#apply-emulator-fix}

Repara a DLL de runtime e o esquema em uma só etapa:

- baixa e guarda em cache uma versão correspondente do GBE Fork e instala a arquitetura de DLL de que o jogo precisa
  (`steam_api.dll` ou `steam_api64.dll`), mantendo qualquer arquivo existente como backup;
- monta o `steam_settings\achievements.json` (e a pasta `images` dele) para corresponder à lista de conquistas
  da Steam, e baixa os ícones;
- grava o `steam_appid.txt` quando ele está ausente;
- grava os arquivos de configuração do GBE (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

Todo arquivo que ele substitui recebe backup antes, e os reparos de esquema também mantêm cópias com data e hora em
`steam_settings\.aw-backups`. O runtime é instalado como uma substituição normal de DLL; o AW Next não
configura um launcher ColdClient separado.

Builds empacotadas do Unreal Engine são reparadas da mesma forma. Os arquivos Steam delas ficam em
`Engine\Binaries\ThirdParty\Steamworks` em vez de ao lado do executável, e o AW Next os encontra, instala
e verifica ali.

### Propriedade de DLC e identidade da conta {#dlc-ownership-and-account-identity}

Dois interruptores em **Configurações → Emuladores → Steam / GBE Fork**, ambos desativados por padrão e independentes do
reparo automático:

| Configuração | O que grava |
|---|---|
| **Gerenciar propriedade das DLCs** | `configs.app.ini`, para que o emulador informe todas as DLCs como possuídas |
| **Gravar nome da conta e idioma** | O nome e o idioma da sua conta, em `configs.user.ini` |

Nenhum dos dois afeta as conquistas. Deixe-os desativados para manter um jogo original, ou se você gerencia DLC ou identidade à mão.

O cartão **Identidade do emulador** abaixo deles mostra o que é gravado:

| Campo | O que faz |
|---|---|
| **Nome da conta** | Gravado enquanto **Gravar nome da conta e idioma** está ativado. Vazio usa o nome do seu perfil do AW Next. |
| **Steam ID** | Gravado enquanto esse interruptor está ativado; vazio mantém o de cada jogo. O botão de dado cria um aleatório válido, e um erro de digitação é sinalizado enquanto você digita e nunca é gravado. |
| **Pasta de saves** | Vale assim que você escolhe uma: todo jogo corrigido ou reparado daí em diante salva ali (`local_save_path`), e o AW Next a observa para as notificações em tempo real. Vazio mantém `%APPDATA%\GSE Saves`. |

Para desfazer o que qualquer um dos interruptores gravou, clique com o botão direito num jogo e escolha **Remover a configuração
de emulador do AW Next**. Ele mostra exatamente o que vai remover antes de fazer qualquer coisa. Remove apenas a seção
DLC, os interruptores e as chaves de identidade que o AW Next adicionou, mantém todo valor definido por você ou pelo repack e exclui
um arquivo somente quando não sobra mais nada nele.

### Usar sua própria DLL de emulador {#using-your-own-emulator-dll}

**Configurações → Emuladores → DLL do emulador** importa a sua própria `steam_api.dll` ou `steam_api64.dll` e
a instala no lugar da build do GBE Fork baixada, em toda correção e toda correção automática. A
arquitetura que você não importa continua vindo da build oficial, assim como as ferramentas de interface.

Um arquivo importado é revalidado a cada uso: precisa ser um PE real da arquitetura que o nome dele
indica e precisa ser uma DLL de emulador da Steam. Um arquivo que falha é informado e ignorado, nunca
instalado. **Usar a versão oficial** remove a importação e volta à versão baixada.

### Remover DRM do Steam (Steamless) {#remove-steam-drm-steamless}

Tenta desempacotar o SteamStub do executável selecionado quando uma substituição de DLL não consegue carregar. O executável
original é mantido como `*.steamstub.bak`. Não faz nada em jogos sem SteamStub e não contorna
verificações de propriedade no servidor.

### Backup e restauração {#back-up-and-restore}

Clique com o botão direito em **Fazer backup do GBE/Goldberg** para tirar um instantâneo da DLL atual e dos arquivos `steam_settings`, ou
**Restaurar o último backup do GBE/Goldberg** para trazer um de volta. Um backup anota quando a pasta já tinha
uma configuração que o AW Next havia gravado, para nunca ser confundido com o original intacto.

## Definir o AppID manualmente {#set-appid-manually}

Quando o nome da pasta de um jogo corresponde a várias versões da Steam e a associação automática escolheu a errada,
clique com o botão direito e escolha **Definir o AppID manualmente**. O AppID é gravado em `steam_appid.txt` e
lembrado para aquela pasta de instalação, então os reparos seguintes o usam em vez de adivinhar de novo. **Limpar o AppID
manual**, no mesmo menu, o remove.

## Problemas comuns {#common-problems}

### O jogo está ausente {#the-game-is-missing}

- Inicie o emulador uma vez para que ele crie um save de runtime, ou adicione a biblioteca real do jogo para que a detecção possa
  encontrar `steam_settings`, `steam_appid.txt` ou a DLL da API Steam.
- Verifique se a pasta adicionada nas Configurações é alta o bastante para conter a pasta do jogo, mas não um
  disco inteiro de dados sem relação.
- Execute **Gerar configurações** e confira a contagem de resultados.

### Todas as conquistas continuam bloqueadas {#every-achievement-remains-locked}

Verifique estas causas em ordem:

1. **Nada foi desbloqueado ainda.** Um save de runtime ausente ou vazio é esperado.
2. **Os nomes do esquema não correspondem às chaves do save.** Execute **Diagnosticar emulador** e depois repare o esquema.
3. **O caminho do save está personalizado.** Aponte o AW Next para a raiz real dos saves ou remova a
   substituição provisória.
4. **O AppID está errado.** Use **Definir o AppID manualmente** antes de executar outro reparo.

### Faltam descrições ou ícones {#descriptions-or-icons-are-missing}

Execute um reparo completo com o download de ícones ativado. Quando os metadados online não estão disponíveis, o AW Next pode reutilizar um
esquema local válido, mas não pode inventar descrições que nenhuma fonte tem.

### As notificações dentro do jogo não aparecem, mas a biblioteca é atualizada {#in-game-notifications-are-missing-but-the-library-updates}

O AW Next lê o save de runtime, mas o esquema do emulador do próprio jogo ou o overlay dele pode estar incompleto. Verifique
se o `steam_settings\achievements.json` tem os mesmos nomes de API do save de runtime e caminhos de ícone
válidos.

## Limitações {#limitations}

Alguns jogos não informam conquistas pela Steamworks de jeito nenhum, mesmo vendidos na Steam, e não podem
ser rastreados por um caminho de save do Goldberg ou do GBE. O AW Next também não consegue reparar um jogo cuja identidade real
ou esquema de conquistas ele não consegue resolver com segurança.

A [referência técnica do Goldberg/GBE](../goldberg-gbe.md) cobre os formatos de arquivo, as regras de detecção e os
detalhes de implementação.

---

**Próximo:** [Configuração do Uplay, R1 e R2](uplay-r2.md), o equivalente da Ubisoft para jogos que não carregam
`steam_api.dll`.

<div align="center">

[← Documentação](README.md) · [Referência técnica](../goldberg-gbe.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
