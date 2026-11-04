---
title: "Presets e o Preset Designer"
description: "O visual do popup de desbloqueio: os nove presets incluídos, o Preset Designer e como compartilhar seus próprios arquivos .awpreset."
---

# Presets e o Preset Designer

Um **preset** é o visual do popup do overlay dentro do jogo: o layout, as cores, o movimento e a forma
como ele representa um desbloqueio raro ou uma conclusão de 100%. Escolha um em **Configurações → Notificação → Predefinição**,
crie o seu em **Configurações → Presets de notificação** ou importe um que alguém compartilhou com você.
O botão de grade ao lado da configuração do preset mostra cada preset como uma imagem do cartão dele: clique em um para
usá-lo.

> [!NOTE]
> Os presets estilizam o overlay dentro do jogo. Com **Tipo de notificação** definido como *Notificação do Windows*,
> nada do que um preset descreve é desenhado, e a aba Presets de notificação não é exibida.

## Os presets incluídos {#the-bundled-presets}

O AW Next traz dez, cada um com composição, tipografia, movimento e cor próprios.

| Preset | O que é |
| --- | --- |
| **AW Next** | O padrão. A paleta do próprio app, uma barra de destaque na borda esquerda, um ícone com anel e o nome do jogo acima da conquista. |
| **Steam Modern** | A placa azul-marinho escura com a marca da Steam atrás do texto, cantos retos, deslizando para cima a partir da borda inferior. |
| **Steam Original** | Uma cópia do popup que o cliente da Steam desenha hoje: degradê ardósia, uma discreta marca Steam superdimensionada, um ícone quadrado e apenas uma borda dourada para um desbloqueio raro. |
| **Epic Games** | Plano, neutro e de ombros retos, com as margens mais largas do conjunto e uma única linha na borda esquerda. |
| **PlayStation** | A tipografia do console e o longo painel de cinza a preto, com a marca PlayStation pulsando dentro de um anel à direita. |
| **Xbox** | Uma pílula escura com um arco verde que percorre uma vez o ícone circular e se acomoda num anel fixo. |
| **Cover** | A arte do jogo como fundo, derivando devagar, com um escurecimento sob o texto e a maior tipografia do conjunto. |
| **Glass** | Translúcido e discreto: sem barra de destaque e sem cor até que um desbloqueio raro ou de 100% traga uma. |
| **Arcade** | Verde fósforo sobre preto, monoespaçado e em maiúsculas, com linhas de varredura e uma borda rígida deslocada. Um desbloqueio raro muda para âmbar. |
| **Slim** | O baixo, sobre preto puro: a mesma largura dos demais com metade da altura, feito para sumir num painel OLED. |

Todos os presets têm a mesma largura, então trocar de preset nunca desloca o popup para o lado.

### Os quatro estados que todo preset desenha {#the-four-states-every-preset-draws}

| Estado | Como aparece |
| --- | --- |
| **Normal** | O destaque próprio do preset. |
| **Raro** | Ouro com 5% ou menos, prata até 10%, bronze até 15% (os limites podem ser mudados em **Configurações → Geral → Limites de raridade**), mais a taxa de desbloqueio impressa no cartão, um brilho mais forte e uma borda adicional. |
| **Conclusão de 100%** | Um tratamento frio e mais brilhante com uma borda dobrada. |
| **Progresso** | Uma barra de progresso com um rótulo `current/max - %`. |

O preset que você escolhe desenha o raro e o 100% por conta própria, então há uma configuração de preset, não três. As
substituições por emulador ficam em **Configurações → Notificação → Emuladores** (modo Avançado): Xenia,
RPCS3, shadPS4 e Kyty podem receber, cada um, o próprio preset e som.

Um preset usa o som escolhido na aba Notificação, a menos que defina o seu, então mudar o visual
não muda o que você ouve. Um preset compartilhado pode trazer o próprio som: veja
[Compartilhar um preset](#share-a-preset). **Opacidade** (de 30% a 100%) na aba Notificação define o quanto
o popup é transparente.

> [!NOTE]
> Os presets distribuídos com nomes anteriores continuam sendo reconhecidos: `Shirow`/`Default`/`Midnight`/`xqjan` viram
> **AW Next**, `Steam` vira **Steam Modern**, `PS4`/`PS5 enhanced` viram **PlayStation**,
> `Xbox 360`/`Xbox One` viram **Xbox**, `Game Cover`/`Sunset` viram **Cover**, `Clean`/`Modern`/`Smooth Pop` viram **Glass**,
> `Neon Future`/`LAZ0RBOX` viram **Arcade**, e os da comunidade `ArmsofGod`, `Epic Preset`
> e `mudoss` viram **Pantheon**, **Onyx** e **Outline**. Os da comunidade **Hexagon** e **Indiana**
> foram removidos, e eles e o `TigerDX Award` voltam para **AW Next**. Um preset seu com um
> desses nomes é usado antes da substituição.

## Crie o seu {#design-your-own}

O designer tem uma aba própria, **Configurações → Presets de notificação**, que também pode ser aberta pelo botão de ferramentas
ao lado da configuração do preset. Tudo é definido com controles comuns: sem CSS, JSON ou arquivo para
editar.

<div align="center">
<picture><source srcset="../assets/shot/notification-preset-panel-800.webp 800w, ../assets/shot/notification-preset-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notification-preset-panel.png" width="720" height="530" alt="O Preset Designer"></picture><br>
<sub>Comece de um design completo e depois modele-o sob uma prévia ao vivo do popup real, que fica na tela enquanto os controles rolam</sub>
</div>

### Pontos de partida {#starting-points}

A primeira linha traz quatorze designs completos: *Classic*, *Aurora*, *Neon*, *Cover*, *Minimal*,
*Console*, *Terminal*, *Slate*, *Paper* (o único design claro), *Ember*, *Frost*, *Poster*, *Pixel*
e *Ribbon*. Cada um é um conjunto comum de valores de controle, então escolher um equivale a mover todos os
controles à mão: mantenha-o ou use-o como base.

| Ação | O que faz |
| --- | --- |
| **Me surpreenda** | Monta um design que você ainda não experimentou: escolhe um tipo de cartão (plano, degradê, neon, sobre a arte, vítreo, terminal ou claro) e depois sorteia cada controle dentro do que esse tipo permite. |
| **Duplicar** | Mantém o design atual e libera o nome, de modo que o próximo **Criar predefinição** adicione um preset em vez de substituir aquele de que veio. |

Nada é salvo até você pressionar **Criar predefinição**.

### A prévia {#the-preview}

A prévia é a própria notificação, desenhada pela mesma página, pelos mesmos estilos e pelo mesmo motor de um jogo. Ela
fica fixa no topo do painel enquanto os controles rolam.

| Controle | O que mostra |
| --- | --- |
| **Cartão** | O popup no tamanho dele. O tamanho em pixels e o zoom da prévia aparecem abaixo. |
| **Comparar** | As quatro notificações de uma vez, duas a duas. |
| **Tela** | O popup numa tela simulada em **720p**, **1080p**, **1440p** ou **4K**, no tamanho relativo real e no canto em que as notificações estão configuradas para aparecer. |
| **Normal / Raro / 100% / Progresso** | As quatro notificações em que um preset precisa ficar bem. Em **Comparar**, a que você escolher é desenhada com força total. |
| **Reproduzir** | Reproduz entrada, permanência e saída uma vez, com os tempos do próprio preset. |
| **Fundo** | Contra o que o popup é avaliado: transparência, uma cena escura, uma clara ou arte da sua biblioteca. |
| **Posição / Tamanho** | Espelham as configurações de mesmo nome na aba Notificação e as alteram. Exibidos apenas na visualização **Tela**. Um popup que você posicionou à mão é desenhado no centro inferior e identificado. |

### Como se orientar {#finding-your-way-around}

O designer tem nove grupos e uns sessenta controles, com um filtro e um histórico de desfazer.

| | O que faz |
| --- | --- |
| **O filtro** | Digite na caixa acima dos grupos e só os controles correspondentes permanecem. Ele pesquisa rótulos, palavras das listas suspensas e o próprio nome da propriedade, então tanto `corner` quanto `radius` encontram o mesmo controle deslizante, e um nome lido de um `.awpreset` encontra o seu controle. Uma correspondência atrás de **Avançado** o abre. **Esc** limpa a caixa. |
| **Desfazer / refazer** | As duas setas ao lado do filtro, ou **Ctrl+Z** e **Ctrl+Y** (**Ctrl+Shift+Z** também funciona). Um arrasto de controle deslizante é um passo. Carregar um preset, escolher um ponto de partida ou pressionar Redefinir inicia um histórico novo. |

**Layout e tamanho** e **Cores e fundo** começam abertos; os outros grupos abrem com um clique, e a maioria
tem uma área **Avançado** para ajustes finos.

### Os controles {#the-controls}

No modo de interface **Simples**, as metades Avançado não são exibidas.

| Grupo | O que cobre |
| --- | --- |
| **Layout e tamanho** | Ícone à esquerda, à direita, acima do texto ou nenhum; alinhamento do texto; largura, preenchimento e espaçamento do popup; e se o **nome do jogo** é impresso acima da conquista. |
| **Texto** | Fonte (uma de cinco famílias, ou **um arquivo de fonte seu**: TTF, OTF, WOFF ou WOFF2, no máximo 4 MB, copiado para o preset), tamanho do título e da descrição, em quantas linhas a descrição pode quebrar e a cor do título. Em Avançado: peso do título, maiúsculas, espaçamento entre letras, sombra do texto e um contorno em torno de cada glifo. |
| **Cores e fundo** | Uma cor sólida, um degradê de duas cores com um ângulo, a **arte do próprio jogo** ou **uma imagem sua** (copiada para o preset), escurecida, desfocada e enquadrada atrás do texto. Mais cor do texto, destaque e opacidade. Em Avançado, uma **textura** (grade, pontos, hachura ou salpicos) sobre o fundo e sob o texto. |
| **Ícone** | Tamanho, **forma** (quadrado arredondado, círculo, squircle, hexágono ou losango) e, em Avançado, uma borda e um brilho na cor de destaque. O arredondamento dos cantos vale apenas para o quadrado arredondado. Um **logotipo** (PNG, JPEG, GIF, WebP ou BMP, no máximo 5 MB) pode ficar atrás do texto num canto ou no meio de um lado, com um tamanho e uma distância da borda; ele é copiado para o preset como a fonte. |
| **Borda e cantos** | Raio dos cantos, qual borda leva a barra de destaque (ou um contorno completo, ou nenhum) e a espessura dela; em Avançado, uma borda de cor própria. |
| **Sombra e brilho** | Profundidade da sombra projetada, brilho de destaque e se esse brilho **pulsa** ou **respira** enquanto o popup está na tela. |
| **Animação e duração** | De qual borda o popup entra e para qual sai (ou esmaecer, ou zoom) e quanto tempo permanece. Em Avançado: distância percorrida, velocidade de entrada e saída, a curva de entrada (suave, linear, recuo, gentil, estalo ou elástica) e uma **curva de saída**. |
| **Raro e 100%** | Cor e brilho para um desbloqueio raro e para o 100%, uma **tonalidade de estado** que cobre o cartão inteiro, se a barra de progresso aparece e se um **selo de raridade** imprime a taxa de desbloqueio. Em Avançado: a espessura da barra de progresso, os níveis prata e bronze e um **cadeado** antes do título de uma conquista oculta. |
| **Som** | Um som que este preset toca no lugar do da aba Notificação. Deixe em **Configuração do app** para nenhum. |

| Ação | O que faz |
| --- | --- |
| **Mostrar na tela** | Renderiza o design como um popup de overlay de verdade, em tamanho real, na posição configurada e no estado que a prévia mostra, sem salvá-lo. |
| **Criar predefinição** | Salva e o seleciona como o preset ativo. |
| **Atualizar predefinição** | O mesmo botão quando o nome corresponde a um preset feito pelo designer: ele substitui esse preset em vez de adicionar outro. |
| **Editar uma predefinição** | Carrega de volta nos controles um dos presets gerados por você, com cada valor como foi salvo. |
| **Redefinir** | Devolve os controles ao design padrão. Nada muda no disco. |
| **Renomear** | Aparece quando um preset gerado é carregado. Digite o novo nome no campo de nome e pressione-o: o preset é renomeado no disco, e as configurações de notificação que apontavam para ele o acompanham. |
| **Excluir** | Aparece quando um preset gerado é carregado, e o remove após uma confirmação. |
| **Exportar** / **Importar** | Movem um preset entre máquinas: veja [Compartilhar um preset](#share-a-preset). |

Só os presets gerados por este designer podem ser reabertos ou excluídos: ele guarda as configurações num
`aw-preset.json` ao lado dos arquivos gerados, e esse arquivo é o que torna um preset editável. Os presets incluídos e
os escritos à mão nunca são tocados.

> [!NOTE]
> Um preset que você já fez mantém os arquivos como foram gerados. Abri-lo no designer e salvá-lo
> aplica a ele os padrões de hoje, entre eles um desbloqueio raro e uma conclusão de 100% repintando todo o
> popup.

> [!NOTE]
> Os presets que você cria ficam em `%APPDATA%\Achievement Watcher Next\presets\Users Presets`, não na
> pasta de instalação, e sobrevivem às atualizações do app.

### O editor de layout {#the-layout-editor}

**Editor**, sob a prévia, abre o design em tela cheia: o cartão no meio, as camadas dele à
esquerda, as configurações do que está selecionado à direita. Arraste qualquer coisa no cartão para movê-la, puxe um
canto para redimensioná-la, gire-a com a alça redonda. Na primeira vez que abre, um tour curto mostra
onde as coisas estão; **?** lista todos os atalhos e pode repetir o tour.

| | O que faz |
| --- | --- |
| **Adicionar** | Um texto, uma imagem, um retângulo, uma elipse, uma linha ou um **ícone** (troféu, medalha, coroa, estrela e mais oito). Cada um é uma camada própria. |
| **Imagens animadas** | Um GIF ou um WebP animado (no máximo 5 MB) é reproduzido no cartão. **Reproduzir o GIF de novo a cada popup** o reinicia do primeiro quadro sempre que o popup aparece. |
| **Palavras do popup** | Um texto pode conter `{game}`, `{title}`, `{detail}`, `{rarity}` e `{tier}`: os botões sob o campo de texto os inserem, e o popup coloca no lugar o nome do jogo, a conquista, a descrição dela, a taxa de desbloqueio ou o nome do nível dela. |
| **Preenchimento** | Uma forma ou um ícone é pintado com uma cor, um degradê, um degradê circular, a cor do nível do popup (vira bronze, prata ou ouro junto com o cartão) ou a cor de um único nível, seja qual for o popup. |
| **Formas** | Uma estrela tem um número de pontas e uma profundidade, uma seta uma ponta e uma haste, um triângulo um vértice que desliza ao longo da base. Toda forma, exceto a elipse, pode ter cantos arredondados, um contorno ou uma linha pode ser tracejado ou pontilhado, e uma forma, um ícone ou uma imagem pode ser espelhado. Uma imagem pode ser recortada em qualquer uma dessas formas. |
| **Transparente** | Uma forma que não seja uma linha pode ser definida como transparente. Ela não pinta nada por si: tudo o que está empilhado sob ela, o cartão, o ícone e o texto dele e os elementos abaixo, é recortado onde ela está, e a área de trabalho aparece pelo buraco. Os elementos acima dela permanecem. Uma forma transparente fica parada, e a opção não é oferecida sobre um preset incluído. |
| **Sombra e brilho** | Um texto, uma forma ou um ícone projeta uma sombra ou brilha, em preto, na cor do nível do popup ou numa cor sua. |
| **Um estado de cada vez** | O editor trabalha no estado que a prévia mostra (normal, bronze, prata, ouro, 100% ou progresso). **Editar: Todos** muda o elemento para todos os estados; **Editar: somente Ouro** (ou o estado que estiver exibido) o muda só para esse estado, qualquer coisa, da cor à posição, e um elemento adicionado então aparece só nesse estado. **Visível** oculta ou mostra o elemento da mesma forma, então uma coroa que só um desbloqueio de ouro mostra é um único ícone desligado em todos os lugares menos no ouro. Um estado com configurações próprias para o elemento selecionado avisa, e **Voltar ao padrão** faz com que ele volte a seguir os outros. As partes do cartão (título, ícone, descrição) funcionam do mesmo jeito. |
| **Entrada e ciclo** | Como um elemento entra quando o cartão já está na tela (esmaecer, subir, cair, vir de um lado, zoom, surgir, tremer ou piscar; um texto também pode se digitar sozinho, e um texto de raridade ou progresso conta até o valor) e depois de qual atraso, e então se continua se movendo enquanto o popup é exibido: um pulso, uma flutuação, um balanço, um giro ou um brilho. O editor fica parado enquanto você trabalha; **Reproduzir** mostra o movimento. |
| **Linha do tempo** | Uma barra ao longo da base do editor mostra quando cada elemento entra e por quanto tempo. Arraste uma barra para mover ou esticar a entrada dela, pressione **Reproduzir** para ver o cartão ou arraste ao longo da régua para parar num instante. Ela fica recolhida até que uma configuração de animação mude. |
| **Caixas de texto** | O título, a descrição e a linha do jogo podem ser reescritos e receber uma caixa própria: um preenchimento, margem interna, cantos arredondados e um contorno. A barra de progresso tem uma espessura e uma cor de trilho, e os ícones podem ser quadrados. |
| **Posição e tamanho** | Valores digitados para X, Y, largura e altura, e seis botões que alinham o elemento às bordas ou ao centro do cartão. |
| **Camadas** | O olho oculta um elemento. O cadeado o mantém no lugar: ele não pode ser movido, redimensionado ou excluído até ser destravado, e um clique o atravessa. As setas mudam a ordem de empilhamento. |
| **Vários de uma vez** | **Shift** ou **Ctrl** + clique adiciona um elemento à seleção ou o retira, um arrasto a partir de um ponto vazio pega tudo o que a caixa toca, e **Ctrl+A** pega tudo. O grupo se move como um só, se alinha ao cartão ou a si mesmo, e é duplicado, copiado ou excluído de uma vez. |
| **Copiar e colar** | **Ctrl+C** e **Ctrl+V** copiam a seleção, inclusive para outro preset. Os seletores de cor oferecem as cores que o design já usa. |

Os arquivos de preset feitos antes desta versão continuam funcionando, e um preset que não usa nada disso tem a mesma aparência e
é exportado como antes.

## Personalizar um preset incluído {#customize-a-bundled-preset}

**Personalizar um preset incluído**, no topo do designer, parte de um preset que acompanha o
app. Nada desse preset é copiado ou editado: a camada que você salva são algumas linhas que o nomeiam, mais
os valores que você mudou, sobrepostos ao preset incluído como ele é distribuído. Se uma versão posterior melhorar o
preset incluído, a sua camada melhora junto.

Marque as seções a mudar: **fundo** (uma cor ou um degradê), **cor do texto**, **destaque**,
**borda**, **brilho**, **fonte** (uma das cinco famílias ou um arquivo de fonte seu) e **logotipo**.
Os controles partem das cores do próprio preset incluído. A prévia e **Mostrar na tela** exibem o
preset incluído com a sua camada por cima.

<div align="center">
<picture><source srcset="../assets/shot/preset-customize-panel-800.webp 800w, ../assets/shot/preset-customize-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/preset-customize-panel.png" width="720" height="530" alt="Personalizando o preset AW Next com um arquivo de fonte e um logotipo, com prévia ao vivo" loading="lazy" decoding="async"></picture><br>
<sub>O AW Next com um arquivo de fonte próprio e um logotipo no canto superior direito: só as seções marcadas mudam</sub>
</div>

- Funciona com os presets da lista **Presets padrão**, que desenham todos o mesmo cartão. Os presets da
  comunidade (Batman, Onyx, Outline e os outros) desenham layouts próprios e não são oferecidos.
- Uma camada não pode ser exportada como `.awpreset`, pois existe apenas sobre o preset incluído
  da instalação que a criou. Para compartilhar um design, construa-o com o designer.
- A **fonte de navegador do OBS** ignora as camadas e mostra o preset padrão.
- O popup mantém o tamanho de janela do preset incluído, então um brilho ou uma borda grandes podem ser cortados.

## Importar um tema do Steam Achievement Notifier {#import-a-theme-from-steam-achievement-notifier}

Os temas do **Steam Achievement Notifier** (SAN) chegam inteiros. O AW Next desenha um tema importado
com os layouts de cartão do próprio SAN, então ele tem o visual e o movimento que tinha no SAN: todos os onze layouts, no
tamanho de texto do SAN e com a configuração de escala do próprio tema. Dois botões na aba **Presets de notificação**
importam temas:

- **Importar tema SAN** lê um arquivo `.san`, ou o `usertheme.json` dentro de um tema que o SAN já
  descompactou, com as imagens e os sons ao lado.
- **Importar do SAN neste PC** lê as configurações do próprio SAN quando o SAN está instalado aqui e importa
  de uma só vez todos os temas salvos neste PC. Os quatro temas em uso (regular, semirraro, raro e 100%)
  viram um único preset, `SAN - <theme name>`, que alterna entre eles como o SAN faz, e cada outro tema
  salvo vira um preset próprio. Executá-lo de novo atualiza esses presets em vez de adicionar
  cópias e nunca toca num preset seu que tenha o mesmo nome.

Os presets SAN instalados são reconstruídos por conta própria.

### O que vem junto {#what-comes-across}

Tudo o que o tema contém: cada configuração, as imagens dele (fundo, máscara, logotipos e decorações,
borda do ícone, selos de porcentagem, ícone de conquista oculta), a fonte e os sons (um por estado, ou
uma pasta de onde o SAN sorteia). O preset leva tudo isso, então o SAN não é mais necessário depois,
e ele é exportado como um `.awpreset`.

O visual é o do SAN, não o dos controles deslizantes do designer: **Editar uma predefinição** o mostra como uma imagem, com um painel
de duas opções abaixo.

- **Imagem do troféu**, para um tema que desenha um troféu de bronze, um de prata e um de ouro: *Segue o
  nível* mostra o que corresponde ao desbloqueio, ou escolha uma cor para mostrá-lo sempre.
- **Tema por nível** desenha um nível com outro tema SAN importado, som incluído, de modo que um desbloqueio de ouro
  pode ter um visual totalmente diferente de um de bronze.

Qualquer outra coisa é alterada no SAN e importada de novo.

O estado que uma notificação recebe segue as suas configurações de raridade no AW Next. Uma conclusão de 100% usa o
cartão 100% do SAN. No modo raro, ouro e prata usam o cartão raro dele e o bronze o semirraro; no modo
troféus, ouro, prata e bronze usam raro, semirraro e comum. Um som raro ou de 100% escolhido no AW
Next prevalece sobre o do tema, e a posição e o tamanho do popup vêm da aba **Notificação**.

O relatório depois de uma importação lista o que não pôde vir: um arquivo que o tema nomeia mas não trouxe,
uma imagem ou fonte recusada e configurações de um SAN mais novo que esta versão ainda não desenha. Ele também
é gravado no log do app.

### O que é verificado antes de instalar qualquer coisa {#what-is-checked-before-anything-is-installed}

As regras são as de um `.awpreset`, já que o arquivo de um tema vem da máquina de outra pessoa. Nada
dentro dele é executado ou avaliado; apenas o `usertheme.json` é lido. Cada caminho é conferido com o
pacote em que veio, e os caminhos absolutos que o SAN grava são lidos apenas como nomes de arquivo. Só imagens,
fontes e áudio são extraídos, por tipo de arquivo e com um limite de tamanho; um SVG que poderia executar um script
e um arquivo que não é uma fonte são recusados. Cada configuração é verificada quanto ao tipo e ao intervalo. Uma importação
que falha deixa intactos todos os presets que você já tem.

## Compartilhar um preset {#share-a-preset}

**Exportar** e **Importar**, na aba **Presets de notificação**, movem um preset entre máquinas como um único
arquivo `.awpreset`: o estilo, cada imagem e fonte que ele usa, as configurações do designer e os metadados.

A [galeria de presets](../gallery/) reúne esses arquivos: navegue, baixe um e importe-o, ou adicione o
seu. O que um envio precisa ser e o que é verificado antes de ele ser listado está em
[As galerias da comunidade](community-galleries.md).

**Exportar** grava o que o cartão está mostrando, com o nome do campo **Nome**: o design nos
controles, salvo ou não, de modo que um preset em andamento possa ser compartilhado sem criá-lo antes. Um preset
importado selecionado em **Editar uma predefinição** é exportado do disco como está, já que o visual dele está em arquivos
que os controles não conseguem descrever. Viaja apenas o preset: nenhum caminho da sua máquina, nenhum nome de conta, nenhuma
configuração sua.

**Importar** pede o arquivo, verifica-o e o instala em `presets\Users Presets`. Se o nome
já está em uso, por um dos seus presets ou por um incluído, você escolhe **Manter ambas** (a importação vai para
`Name (2)`) ou **Substituir**. Nada é gravado até você responder.

Um preset importado aparece em **Editar uma predefinição**, fica selecionado e pode ser exportado de novo ou excluído
a partir dali. Um preset feito pelo designer volta completo para novas edições. Um preset escrito à mão
tira o visual de arquivos que os controles não conseguem reproduzir, então os controles ficam como estão e o campo
de nome fica vazio.

### O que é verificado antes de instalar qualquer coisa {#what-is-checked-before-anything-is-installed-1}

Um pacote é validado inteiro e recusado por completo, nunca instalado em parte, quando:

- não é um pacote de preset, ou o manifest dele está ausente ou malformado;
- exige um AW Next mais novo que o em execução, ou um formato de pacote mais novo;
- traz um arquivo que o formato não descreve: um programa, um script ou qualquer coisa fora de
  `preset/` e `sounds/`;
- qualquer caminho dentro dele aponta para fora da própria pasta.

Nada dentro de um pacote é executado ou avaliado enquanto ele é verificado ou instalado. A página do preset
é renderizada depois, na mesma janela de notificação em sandbox de um preset incluído.

### O que um pacote contém {#what-a-package-contains}

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

O manifest é mantido ao lado do preset instalado como `aw-package.json`. Ele informa ao app que o preset
foi importado e pode ser removido de novo, e leva a descrição e os créditos para a próxima exportação.

Um som que você mesmo importou viaja com o preset; um som incluído não, já que o manifest
o nomeia e toda instalação o tem. Importar nunca muda o som que você selecionou e nunca
sobrescreve um que você tem: um arquivo diferente com o mesmo nome chega como `name (2)`.

O campo opcional `author` é preenchido apenas a partir do arquivo do próprio preset, então nada é creditado a você
a menos que você coloque.

---

**Próximo:** [Overlay](overlay.md) - a lista de conquistas dentro do jogo, que é separada destes
popups.

<div align="center">

[← Documentação](README.md) · [Notificações](notifications.md) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
