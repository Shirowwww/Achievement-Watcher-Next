---
title: "Configuração do Goldberg Uplay, R1 e R2"
description: "Configure as conquistas de jogos da Ubisoft compatíveis com os loaders Uplay R1 e R2, e repare tudo com segurança."
---

# Configuração do Goldberg Uplay (R1 e R2)

O AW Next tem um reparo separado para jogos da Ubisoft executados pelo emulador Goldberg Uplay. Ele nunca
toca em instalações oficiais do Ubisoft Connect: um jogo só é selecionado depois que o AW Next comprova o
loader e a geração exatos que ele usa.

Um jogo da Ubisoft carrega apenas a geração de loader com a qual o executável dele foi ligado: aproximadamente de 2019
em diante é **R2**, tudo o que vem antes é **R1**. O AW Next detecta e repara a que se aplicar, já que
a geração errada colocaria uma DLL que o jogo nunca abre. Um jogo da Ubisoft com dois ids de produto (um
jogo base e a Complete Edition) funciona nos dois casos: um save sob qualquer um dos ids é lido, e um id de objetivo
isolado dentro dele é associado à lista de conquistas da Steam.

> [!WARNING]
> O reparo altera arquivos do jogo. Use-o apenas com jogos que você possui.

## Reparar um jogo {#repair-a-game}

A partir do **Estado do jogo**:

1. Adicione a biblioteca do jogo em **Configurações → Pastas** e faça a varredura.
2. Abra o painel **Estado do jogo** dele e confira **Diagnosticar configuração do Uplay R1/R2**.
3. Execute **Aplicar a correção de conquistas Ubisoft** e inicie o jogo uma vez.

A partir de **Configurações → Emuladores → Ubisoft / Uplay R1/R2**:

<div align="center">
<picture><source srcset="../assets/shot/uplay-r2-panel-800.webp 800w, ../assets/shot/uplay-r2-panel.webp 928w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/uplay-r2-panel.png" width="720" height="536" alt="Configurações - Ubisoft / Uplay R2"></picture><br>
<sub>O pacote de reparo integrado é verificado antes de qualquer jogo ser tocado</sub>
</div>

- **Corrigir automaticamente os jogos recém-detectados**: o interruptor também exibido em Steam / GBE Fork, aplicado
  também aos jogos da Ubisoft. Desativado por padrão.
- **Reparar jogos Uplay R1/R2 detectados**: repara todas as instalações detectadas em um único lote confirmado.
- **Importar ou substituir DLLs** / **Restaurar DLLs integradas**: use uma build própria do loader, ou volte para
  a que o AW Next traz. Uma DLL selecionada manualmente não precisa de uma impressão SHA-256 conhecida, mas precisa ser um
  loader Uplay válido e capaz de lidar com conquistas, com nome e arquitetura coerentes.

As DLLs integradas ficam em `app/resources/uplayR2/` (R2) e `app/resources/uplayR1/` (R1). O AW Next
confere os hashes, a arquitetura PE e a capacidade de lidar com conquistas delas antes que um reparo possa usá-las, e
mantém um arquivo de recuperação ao lado.

A mesma transação de reparo roda a partir do menu de contexto, do Estado do jogo, do reparo automático, do Corrigir tudo e do
botão de lote. Ela tira um instantâneo de toda DLL, esquema e INI alterados em `<game>\.aw-backups\<timestamp>\`
e os restaura automaticamente se a validação falhar depois. Repetir um reparo idêntico
não tem efeito.

## Associar um jogo sem correspondência à sua versão da Steam {#linking-an-unmapped-game-to-its-steam-release}

O AW Next associa sozinho a maioria dos jogos da Ubisoft à versão deles na Steam, para converter os nomes das conquistas
da Steam nos IDs de objetivo da Ubisoft que o loader espera. Quando não consegue, escolha você mesmo a versão
com **Identificar o jogo (ID do aplicativo Steam)** no menu de botão direito do jogo. Um pareamento que não pode ser
confirmado é recusado, porque um errado gravaria a lista de conquistas de outro jogo na pasta
deste jogo.

Abrir uma vez a página de conquistas do jogo no Ubisoft Connect pode ajudar o AW Next a reconhecer um título que
precisa disso, como Brawlhalla ou The Crew 2. A escolha que você confirma é lembrada para aquela exata
pasta de instalação. A associação automática (o mapa embutido, o catálogo ao vivo da Ubisoft e a
regra de correspondência de títulos) está descrita na [referência do Uplay R1/R2](../uplay-reference.md).

## Um jogo que nunca pede uma conquista {#a-game-that-never-asks-for-an-achievement}

Alguns títulos da Ubisoft pedem primeiro ao loader a sessão da Ubisoft, e o loader responde a partir de uma chave
vazia. Esses jogos leem a chave vazia como desconectado e nunca chamam a API de conquistas. A configuração
parece correta e nada é registrado. Avatar: Frontiers of Pandora se comporta assim.

Quando o log de diagnóstico do Estado do jogo comprova isso, ele oferece **Ativar as conquistas offline** na verificação de
Configuração do emulador. Isso adiciona uma chave de sessão provisória ao lado do jogo: não é uma sessão real da
Ubisoft, nenhuma conta está envolvida, nada é enviado a lugar nenhum, só o suficiente para passar nessa verificação. Ela nunca é
adicionada automaticamente, porque um token que não é legítimo pode quebrar alguns jogos.

**Inicie o jogo uma vez depois de ativá-la.** Até lá a linha diz *Conquistas offline ativadas,
inicie o jogo uma vez*. O botão ao lado passa então a dizer **Desativar as conquistas offline**, que retira
a chave de novo.

Isso vale apenas para loaders R2; o INI do R1 traz uma chave sem relação. O [guia do Goldberg / GBE](emulator-setup.md)
trata do equivalente Steam desse reparo.

## As conquistas continuam em 0% {#achievements-remain-at-0}

- Execute **Diagnosticar configuração do Uplay R1/R2** de novo depois de uma atualização do jogo, já que as atualizações costumam remover o esquema
  ou zerar a contagem de desbloqueios.
- Leia `upc_r2.log` (ou `upc_r1.log`) ao lado da DLL do loader: ele registra todo número de objetivo que o
  jogo pede. Mantenha o **Log de diagnóstico** ativado, em **Configurações → Emuladores → Ubisoft / Uplay R1/R2**.
  O Estado do jogo precisa dele para distinguir um jogo que nunca pediu nada de um que pede um objetivo que o esquema
  não tem. Ele vem ativado por padrão, e o AW Next apara o log quando passa de 25 MB.
- Verifique `%APPDATA%\Achievement Watcher Next\logs\parser.log`.

## Observação sobre o antivírus {#antivirus-note}

Se um software antivírus remover uma DLL de loader solta, ou colocar o arquivo de recuperação em quarentena no meio do caminho, o Estado do
jogo informa um problema de antivírus e oferece permitir a pasta e recolocar os arquivos. Você não precisa
procurar um substituto por conta própria.

Identidade, IDs de objetivo e o log do loader estão tratados na [referência do Uplay R1/R2](../uplay-reference.md).

<div align="center">

[← Documentação](README.md) · [Solução de problemas](troubleshooting.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
