---
title: "As galerias da comunidade"
description: "Use um preset de notificação ou um tema feito por outra pessoa, ou envie o seu para a galeria da comunidade."
---

# As galerias da comunidade

Duas galerias, um serviço, um único conjunto de regras.

| | | |
|---|---|---|
| [Galeria de presets](../gallery/) | `.awpreset` | O popup de notificação: layout, tipografia, cores, movimento e som |
| [Galeria de temas](../gallery/themes/) | `.awtheme` | O resto do app: janela, barra de título, biblioteca, listas de conquistas, configurações e overlay |

Para baixar de qualquer uma, pegue o arquivo e use **Configurações → Presets de notificação → Importar** ou
**Configurações → Aparência → Importar**. Esta página trata do outro lado: como adicionar um, o que é verificado
e o que um cartão pode dizer.

## Enviar um {#sending-one}

O fluxo é o mesmo para as duas, e nada sai do seu navegador até você pressionar **Publicar**.

1. **Exporte-o.** Use Configurações → Presets de notificação → Exportar para um preset, ou Configurações → Aparência →
   Exportar para um tema. O arquivo já traz o nome, a descrição, a versão, as tags e a versão do AW Next
   de que precisa.
2. **Escolha o arquivo** no painel *Envie o seu* na página da galeria, ou solte-o no painel. Escolher
   não envia nada: o arquivo espera enquanto você preenche o resto, e o painel diz o que ele contém.
3. **Confira o que o cartão deve dizer.** Quatro caixas são preenchidas a partir do pacote assim que você o escolhe:
   um **nome**, uma **descrição** de uma linha, **tags** e um **crédito**. O crédito é o autor que o
   app registrou quando você exportou, então é o nome pelo qual você é conhecido, e fica vazio só se você escolheu não
   ser creditado. Digite uma tag e pressione Enter para transformá-la num chip; clique num chip para removê-lo.

   **O nome é a única caixa que precisa ser preenchida.** Ele encabeça o cartão e dá o endereço sob o qual o
   arquivo é publicado, e um nome escolhido por outra pessoa é o que um moderador acaba reescrevendo.
   Publicar fica inativo até haver um. As outras três podem ficar vazias, e o cartão então não traz
   nada ali.
4. **Pressione Publicar.** Leva alguns segundos, porque a imagem é renderizada, não adivinhada. Depois
   ele espera: nada aparece numa galeria antes de um mantenedor aprovar.

Tudo o que há nessas caixas é uma **sugestão**. Ela substitui o pacote apenas onde está preenchida,
é limpa exatamente como um manifest, e um mantenedor vê as quatro ao lado da imagem renderizada antes de
qualquer coisa ser publicada. Nada disso decide um nome de arquivo ou um endereço: o serviço monta o endereço a partir do
nome, mantém letras minúsculas, dígitos e hifens, e recusa todo o resto.

O seu navegador lê as caixas do pacote (o `manifest.json` dele e nada mais). O arquivo em si
só sai quando você pressiona Publicar.

| | Preset | Tema |
|---|---|---|
| Pacote | No máximo 4 MB | No máximo 8 MB |
| Frequência | Cinco envios por hora de um mesmo endereço, presets e temas juntos | |

## A imagem não é você quem envia {#the-picture-is-not-yours-to-send}

Você não pode anexar uma captura de tela a nenhuma das galerias. O serviço renderiza a imagem a partir do seu pacote.

Para um **preset**, ele desenha o popup a partir do pacote, no mesmo documento em sandbox que o app usa,
uma vez num navegador sem rede e sem scripts próprios, no tamanho em que o app o mostra. Ele o desenha
em todos os estados que um preset precisa tratar: um desbloqueio comum, um raro de bronze, um de prata e um de ouro,
o popup de 100% e uma etapa de progresso. Um cartão mostra um de cada vez, com um botão de seta de cada lado para
percorrê-los, e a imagem ampliada é a que está em exibição. Confira os seis ao projetar: um
preset que só fica bem em um deles aparece aqui.

Um **tema** é feito de cores e números, então o servidor desenha uma amostra fixa da interface do AW Next com
o seu tema (barra de título, linha do perfil, biblioteca, lista de desbloqueados recentemente, superfície de configurações) e a
fotografa. É a amostra que as Configurações mostram antes de uma importação, no mesmo tamanho. Ela fica sobre os mesmos quatro
gradientes de fundo todas as vezes, de modo que um tema transparente não é renderizado como um design desbotado e duas
renderizações do mesmo arquivo coincidem.

O texto da amostra é uma constante no código-fonte do app, então um cartão não pode trazer uma biblioteca, conta, caminho ou
jogo seu, nem mostrar uma versão do envio que você não mandou.

## O que viaja num arquivo {#what-travels-in-a-file}

Um **`.awpreset`** contém o documento e a folha de estilo do preset, as imagens, as fontes e o som dele,
e as configurações do designer por trás. Nada sobre a sua máquina.

Um **`.awtheme`** contém cores, gradientes, ajustes, configurações de efeitos e qualquer imagem de fundo que você escolheu,
e nada mais: nenhuma folha de estilo, marcação ou script. Uma imagem viaja como bytes sob um nome montado a partir da
camada dela, nunca como um caminho da sua pasta de imagens. A lista completa está em
[o formato `.awtheme`](../awtheme-format.md).

Um **tema em folha de estilo do usuário não pode ser exportado.** Um `.css` que você colocou em
`%APPDATA%\Achievement Watcher Next\themes` não é um `.awtheme`, e Exportar o recusa. Compartilhe o
próprio `.css`.

## Planos de fundo e outros recursos {#backgrounds-and-other-assets}

Tudo dentro de um pacote é redistribuído a quem o baixar, então precisa ser seu para
redistribuir:

- Arte sua, ou algo sob uma licença que permita. Um papel de parede que você encontrou geralmente não é
  nem uma coisa nem outra, e uma fonte que você comprou também não.
- Nada com logotipo, marca-d'água ou texto embutido. Um tema é um visual, não um posicionamento.
- Nada que não passaria como plano de fundo de desktop no trabalho.

Um tema feito só de cores é bem-vindo e o tipo mais fácil de aceitar.

## Crédito e licença {#credit-and-licence}

O nome num cartão é o que a caixa **Crédito** acabar dizendo. Ela começa com o autor que o app
registrou quando você exportou, então geralmente está certo. Mude se você é conhecido por outro nome, ou esvazie
e o cartão não traz nome nenhum. Um mantenedor pode adicionar um link para o seu perfil ao aprová-lo.

**Tudo o que está listado em qualquer uma das galerias é publicado sob
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Ao enviar, você concorda com isso, confirma
que é trabalho seu e que tudo o que há dentro é seu para dar.

## O que é verificado {#what-is-checked}

Um envio precisa passar por duas camadas.

**O leitor do próprio app.** `app/util/presetPackage.js` e `app/util/themePackage.js`, os módulos que
rodam na Importação, validam o pacote: o manifest, a versão do formato, a versão mínima do app, cada
caminho dentro dele, os tipos de arquivo, os tamanhos e o ponto de entrada. O serviço da galeria usa esses arquivos
literalmente, então uma regra adicionada lá vale aqui na próxima build, e nada pode ser listado que o app
recusaria.

**Os limites próprios da galeria**, de que uma importação privada não precisa:

| | |
|---|---|
| Nome do arquivo | Letras minúsculas, dígitos e hifens, de 2 a 48 caracteres, montado pelo serviço a partir do nome |
| Pacote | 4 MB para um preset, 8 MB para um tema |
| Imagem | Renderizada pelo serviço, uma vez por estado, e recusada se alguma sair fora do tamanho que uma listagem serve (500 KB no máximo cada) |
| Nome | Único na galeria, já que duas entradas com o mesmo nome colidem na importação |

Nada num pacote é executado enquanto ele é verificado, e o site nunca renderiza um: um cartão mostra uma
imagem produzida pelo serviço. Um preset roda só no app, na mesma janela de notificação em sandbox
que um preset incluído usa, e um tema não pode executar nada em lugar nenhum.

## O que é recusado {#what-gets-refused}

- Trabalho de outra pessoa, a menos que ela tenha dito que sim e você a credite.
- Recursos que você não pode redistribuir.
- Um popup que se faz passar por outra coisa: uma caixa de diálogo do sistema, um anúncio, um endereço para visitar.
- Um anúncio, logotipo ou chamada para ação embutido numa imagem de fundo.
- Uma paleta que torna o texto ilegível.
- Uma quase duplicata de algo já listado.

Uma recusa guarda o checksum e apaga os bytes, então enviar o mesmo arquivo de novo é reconhecido
em vez de entrar duas vezes na fila.

## Atualizar ou remover o seu {#updating-or-removing-yours}

Envie o arquivo mais novo da mesma forma, com a versão dentro do pacote aumentada, e diga na
descrição que ele substitui um cartão anterior para que um mantenedor possa retirá-lo. Para que uma entrada seja
removida, [abra uma issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) e
diga qual é o cartão.

## Quando o painel não está lá {#when-the-panel-is-not-there}

Nenhum servidor de galeria está respondendo, e a página lista uma cópia publicada ao lado dela. Tudo o que já está numa
galeria ainda pode ser baixado. Só o envio de algo novo precisa esperar, então tente de novo mais tarde.

O projeto mantém o serviço que faz o painel aparecer, e ele não faz parte deste repositório, então
não há nada para instalar para ele.

## Temas do Steam Achievement Notifier {#themes-from-steam-achievement-notifier}

Eles não são listados aqui e não serão.

Os temas do SAN são arquivos `.san` que as pessoas passam umas às outras diretamente. O repositório do SAN não tem pasta de temas,
lista na wiki nem feed, então uma build não tem para onde apontar. Os arquivos pertencem às pessoas que os fizeram
e não são licenciados para redistribuição, e o repositório do SAN não traz nenhuma licença. Copiar
qualquer um dos dois para cá republicaria o trabalho de outras pessoas sem permissão.

O AW Next lê os seus em vez disso. **Configurações → Presets de notificação → Importar tema SAN** lê um arquivo `.san`,
ou o `usertheme.json` de um tema já descompactado, e **Importar do SAN neste PC** lê
as configurações do próprio SAN. De qualquer forma, o tema vira um preset do AW Next, desenhado com o motor do SAN
no tamanho do SAN, e é exportado como um `.awpreset` como qualquer outro. O que vem junto está em
[Presets](presets.md#import-a-theme-from-steam-achievement-notifier).

Se você importou um seu, exporte-o e envie esse. Então ele é o seu preset, com o crédito para você.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Próximo:** [Presets e o Preset Designer](presets.md): o que é um preset e como fazer um.

<div align="center">

[← Documentação](README.md) · [Galeria de presets](../gallery/) · [Galeria de temas](../gallery/themes/) · [Página inicial do projeto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
