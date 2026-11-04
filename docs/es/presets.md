---
title: "Presets y el Diseñador de presets"
description: "El aspecto del popup de desbloqueo: los nueve presets incluidos, el Diseñador de presets y cómo compartir tu propio archivo .awpreset."
---

# Presets y el Diseñador de presets

Un **preset** es el aspecto del popup del overlay en el juego: su diseño, sus colores, su movimiento y la forma en que
pinta un desbloqueo raro o un completado al 100 %. Elige uno en **Ajustes → Notificación → Preajuste**,
diseña el tuyo en **Ajustes → Presets de notificación** o importa uno que alguien haya compartido contigo.
El botón de cuadrícula junto al ajuste del preset muestra cada preset como una imagen de su tarjeta: haz clic en uno para
usarlo.

> [!NOTE]
> Los presets dan estilo al overlay del juego. Con **Tipo de notificación** en *Notificación de Windows*,
> no se dibuja nada de lo que describe un preset, y la pestaña Presets de notificación no se muestra.

## Los presets incluidos {#the-bundled-presets}

AW Next incluye diez, cada uno con su propia composición, tipografía, movimiento y color.

| Preset | Qué es |
| --- | --- |
| **AW Next** | El predeterminado. La paleta propia de la aplicación, un raíl de acento por el borde izquierdo, un icono con anillo y el nombre del juego sobre el logro. |
| **Steam Modern** | La placa azul marino oscuro con la marca de Steam tras el texto, esquinas cuadradas, que se desliza hacia arriba desde el borde inferior. |
| **Steam Original** | Una copia del popup que dibuja hoy el cliente de Steam: degradado pizarra, una marca de Steam tenue y sobredimensionada, un icono cuadrado y solo un reborde dorado para un desbloqueo raro. |
| **Epic Games** | Plano, neutro y de hombros cuadrados, con los márgenes más anchos del conjunto y una sola línea por el borde izquierdo. |
| **PlayStation** | La tipografía de la consola y su largo panel de gris a negro, con la marca de PlayStation palpitando dentro de un anillo a la derecha. |
| **Xbox** | Una píldora oscura con un arco verde que recorre una vez el icono circular y se asienta en un anillo estable. |
| **Cover** | El arte del juego como fondo, a la deriva lentamente, con un velo bajo el texto y la tipografía más grande del conjunto. |
| **Glass** | Translúcido y discreto: sin barra de acento y sin color hasta que un desbloqueo raro o al 100 % trae uno. |
| **Arcade** | Verde fósforo sobre negro, monoespaciado y en mayúsculas, con líneas de barrido y un borde desplazado y duro. Un desbloqueo raro cambia a ámbar. |
| **Slim** | El bajo, sobre negro puro: el mismo ancho que los demás con la mitad de altura, pensado para desaparecer en un panel OLED. |

Todos los presets tienen el mismo ancho, así que cambiar de preset nunca mueve el popup hacia un lado.

### Los cuatro estados que dibuja cada preset {#the-four-states-every-preset-draws}

| Estado | Qué aspecto tiene |
| --- | --- |
| **Normal** | El acento propio del preset. |
| **Raro** | Oro con un 5 % o menos, plata hasta el 10 %, bronce hasta el 15 % (los límites se pueden cambiar en **Ajustes → General → Umbrales de rareza**), además de la tasa de desbloqueo impresa en la tarjeta, un resplandor más fuerte y un borde añadido. |
| **Completado al 100 %** | Un tratamiento frío y más brillante con un reborde doble. |
| **Progreso** | Una barra de progreso con una etiqueta `actual/máx - %`. |

El preset que eliges pinta él mismo el raro y el 100 %, así que hay un único ajuste de preset, no tres. Las
sustituciones por emulador siguen en **Ajustes → Notificación → Emuladores** (modo Avanzado): Xenia,
RPCS3, shadPS4 y Kyty pueden tomar cada uno su propio preset y sonido.

Un preset usa el sonido elegido en la pestaña Notificación salvo que fije el suyo, de modo que cambiar el aspecto
no cambia lo que oyes. Un preset compartido puede traer su propio sonido: consulta
[Compartir un preset](#share-a-preset). **Opacidad** (del 30 % al 100 %) en la pestaña Notificación fija lo translúcido que es
el popup.

> [!NOTE]
> Los presets distribuidos con nombres anteriores siguen resolviéndose: `Shirow`/`Default`/`Midnight`/`xqjan` a
> **AW Next**, `Steam` a **Steam Modern**, `PS4`/`PS5 enhanced` a **PlayStation**,
> `Xbox 360`/`Xbox One` a **Xbox**, `Game Cover`/`Sunset` a **Cover**, `Clean`/`Modern`/`Smooth Pop` a **Glass**,
> `Neon Future`/`LAZ0RBOX` a **Arcade**, y los de la comunidad `ArmsofGod`, `Epic Preset`
> y `mudoss` a **Pantheon**, **Onyx** y **Outline**. Los de la comunidad **Hexagon** e **Indiana**
> se retiraron, y ellos y `TigerDX Award` vuelven a **AW Next**. Un preset tuyo con uno
> de esos nombres se usa antes que el sustituto.

## Diseña el tuyo {#design-your-own}

El diseñador tiene su propia pestaña, **Ajustes → Presets de notificación**, a la que también se llega con el botón de
herramientas junto al ajuste del preset. Todo se fija con controles normales: sin CSS, JSON ni archivos
que editar.

<div align="center">
<picture><source srcset="../assets/shot/notification-preset-panel-800.webp 800w, ../assets/shot/notification-preset-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notification-preset-panel.png" width="720" height="530" alt="El Diseñador de presets"></picture><br>
<sub>Empieza desde un diseño completo y luego modélalo bajo una vista previa en directo del popup real, que permanece en pantalla mientras los controles se desplazan</sub>
</div>

### Puntos de partida {#starting-points}

La primera fila contiene catorce diseños completos: *Classic*, *Aurora*, *Neon*, *Cover*, *Minimal*,
*Console*, *Terminal*, *Slate*, *Paper* (el único diseño claro), *Ember*, *Frost*, *Poster*, *Pixel*
y *Ribbon*. Cada uno es un conjunto normal de valores de controles, así que elegir uno equivale a mover cada
control a mano: consérvalo o úsalo como base.

| Acción | Qué hace |
| --- | --- |
| **Sorpréndeme** | Construye un diseño que no has probado: elige un tipo de tarjeta (plana, degradada, neón, sobre arte, acristalada, terminal o clara) y luego sortea cada control dentro de lo que ese tipo permite. |
| **Duplicar** | Conserva el diseño actual y libera el nombre, de modo que el siguiente **Crear preajuste** añade un preset en lugar de reemplazar aquel del que partió. |

No se guarda nada hasta que pulsas **Crear preajuste**.

### La vista previa {#the-preview}

La vista previa es la propia notificación, dibujada por la misma página, los mismos estilos y el mismo motor que en un juego.
Permanece fija en la parte superior del panel mientras los controles se desplazan.

| Control | Qué muestra |
| --- | --- |
| **Tarjeta** | El popup a su propio tamaño. El tamaño en píxeles y el zoom de la vista previa se imprimen debajo. |
| **Comparar** | Las cuatro notificaciones a la vez, de dos en dos. |
| **Pantalla** | El popup en una pantalla simulada a **720p**, **1080p**, **1440p** o **4K**, a su tamaño relativo real y en la esquina en la que se ha configurado que aparezcan las notificaciones. |
| **Normal / Raro / 100 % / Progreso** | Las cuatro notificaciones en las que un preset tiene que verse bien. En **Comparar**, la que elijas se dibuja a plena intensidad. |
| **Reproducir** | Reproduce una vez la entrada, el mantenimiento y la salida, con los tiempos propios del preset. |
| **Fondo** | Contra qué se juzga el popup: transparencia, una escena oscura, una clara o arte de tu biblioteca. |
| **Posición / Escala** | Reflejan los ajustes del mismo nombre de la pestaña Notificación, y los cambian. Se muestran solo en la vista **Pantalla**. Un popup que colocaste a mano se dibuja abajo en el centro y se etiqueta. |

### Orientarse {#finding-your-way-around}

El diseñador tiene nueve grupos y sesenta y tantos controles, con un filtro y un historial de deshacer.

| | Qué hace |
| --- | --- |
| **El filtro** | Escribe en el cuadro sobre los grupos y solo se quedan los controles que coinciden. Busca en etiquetas, palabras de los desplegables y el nombre propio de la propiedad, de modo que `corner` y `radius` encuentran el mismo deslizador, y un nombre leído de un `.awpreset` encuentra su control. Una coincidencia tras **Avanzado** lo abre. **Esc** vacía el cuadro. |
| **Deshacer / rehacer** | Las dos flechas junto al filtro, o **Ctrl+Z** y **Ctrl+Y** (**Ctrl+Mayús+Z** también funciona). Un arrastre de deslizador es un paso. Cargar un preset, elegir un punto de partida o pulsar Restablecer empieza un historial nuevo. |

**Diseño y tamaño** y **Colores y fondo** empiezan abiertos; los demás grupos se abren con un clic, y la mayoría
tienen un desplegable **Avanzado** para el ajuste fino.

### Los controles {#the-controls}

En el modo de interfaz **Simple** no se muestran las mitades Avanzado.

| Grupo | Qué cubre |
| --- | --- |
| **Diseño y tamaño** | Icono a la izquierda, a la derecha, sobre el texto o ninguno; alineación del texto; ancho, relleno y espaciado del popup; y si el **nombre del juego** se imprime sobre el logro. |
| **Texto** | Fuente (una de cinco familias o **un archivo de fuente propio**: TTF, OTF, WOFF o WOFF2, 4 MB como máximo, copiado en el preset), tamaño del título y de la descripción, a cuántas líneas puede ajustarse la descripción y el color del título. En Avanzado: grosor del título, mayúsculas, espaciado de letras, una sombra del texto y un contorno alrededor de cada glifo. |
| **Colores y fondo** | Un color sólido, un degradado de dos colores con un ángulo, el **arte del propio juego** o **una imagen propia** (copiada en el preset), atenuada, desenfocada y enmarcada tras el texto. Además, color del texto, acento y opacidad. En Avanzado, una **textura** (cuadrícula, puntos, trama o moteado) sobre el fondo y bajo el texto. |
| **Icono** | Tamaño, **forma** (cuadrado redondeado, círculo, squircle, hexágono o rombo) y, en Avanzado, un borde y un resplandor del color de acento. El redondeo de esquinas se aplica solo al cuadrado redondeado. Un **logotipo** (PNG, JPEG, GIF, WebP o BMP, 5 MB como máximo) puede situarse tras el texto en una esquina o en el centro de un lado, con un tamaño y una distancia al borde; se copia en el preset igual que la fuente. |
| **Borde y esquinas** | Radio de las esquinas, qué borde lleva la barra de acento (o un contorno completo, o ninguno) y su grosor; en Avanzado, un borde de un color propio. |
| **Sombra y brillo** | Profundidad de la sombra proyectada, resplandor de acento y si ese resplandor **late** o **respira** mientras el popup está en pantalla. |
| **Animación y duración** | Por qué borde entra el popup y hacia cuál sale (o fundido, o zoom) y cuánto tiempo permanece. En Avanzado: distancia recorrida, velocidad de entrada y salida, la curva de entrada (suave, lineal, retroceso, delicada, seca o elástica) y una **curva de salida**. |
| **Raro y 100 %** | Color y resplandor de un desbloqueo raro y del 100 %, un **tinte de estado** que baña toda la tarjeta, si se muestra la barra de progreso y si una **insignia de rareza** imprime la tasa de desbloqueo. En Avanzado: el grosor de la barra de progreso, los niveles de plata y bronce y un **candado** antes del título de un logro oculto. |
| **Sonido** | Un sonido que este preset reproduce en lugar del de la pestaña Notificación. Déjalo en **Ajuste de la app** para no tener ninguno. |

| Acción | Qué hace |
| --- | --- |
| **Mostrar en pantalla** | Renderiza el diseño como un popup de overlay real, a tamaño completo, en la posición configurada y en el estado que muestra la vista previa, sin guardarlo. |
| **Crear preajuste** | Lo guarda y lo selecciona como preset activo. |
| **Actualizar preajuste** | El mismo botón cuando el nombre coincide con un preset hecho por el diseñador: reemplaza ese preset en lugar de añadir otro. |
| **Editar un preajuste** | Carga de nuevo en los controles uno de tus presets generados, con cada valor tal como se guardó. |
| **Restablecer** | Devuelve los controles al diseño predeterminado. No cambia nada en el disco. |
| **Renombrar** | Aparece cuando hay un preset generado cargado. Escribe el nombre nuevo en el campo del nombre y púlsalo: el preset se renombra en el disco y los ajustes de notificación que lo señalaban lo siguen. |
| **Eliminar** | Aparece cuando hay un preset generado cargado, y lo elimina tras una confirmación. |
| **Exportar** / **Importar** | Mueven un preset entre equipos: consulta [Compartir un preset](#share-a-preset). |

Solo los presets que generó este diseñador se pueden reabrir o eliminar: guarda sus ajustes en un
`aw-preset.json` junto a los archivos generados, y ese archivo hace editable un preset. Los presets incluidos y
los escritos a mano nunca se tocan.

> [!NOTE]
> Un preset que ya hiciste conserva sus archivos tal como se generaron. Abrirlo en el diseñador y guardarlo
> le aplica los valores predeterminados de hoy, entre ellos que un desbloqueo raro y un completado al 100 % repinten todo el
> popup.

> [!NOTE]
> Los presets que creas se guardan en `%APPDATA%\Achievement Watcher Next\presets\Users Presets`, no en
> la carpeta de instalación, y sobreviven a las actualizaciones de la aplicación.

### El editor de diseño {#the-layout-editor}

**Editor**, bajo la vista previa, abre el diseño a pantalla completa: la tarjeta en el centro, sus capas a la
izquierda y los ajustes de lo seleccionado a la derecha. Arrastra cualquier cosa de la tarjeta para moverla, tira de una
esquina para cambiar su tamaño y gírala con el tirador redondo. La primera vez que se abre, un breve recorrido muestra
dónde está cada cosa; **?** lista todos los atajos y puede repetir el recorrido.

| | Qué hace |
| --- | --- |
| **Añadir** | Un texto, una imagen, un rectángulo, una elipse, una línea o un **icono** (trofeo, medalla, corona, estrella y ocho más). Cada uno es una capa propia. |
| **Imágenes animadas** | Un GIF o un WebP animado (5 MB como máximo) se reproduce en la tarjeta. **Repetir el GIF en cada aparición** lo empieza desde su primer fotograma cada vez que se muestra el popup. |
| **Palabras del popup** | Un texto puede contener `{game}`, `{title}`, `{detail}`, `{rarity}` y `{tier}`: los botones bajo el campo de texto los insertan, y el popup pone en su lugar el nombre del juego, el logro, su descripción, su tasa de desbloqueo o el nombre de su nivel. |
| **Relleno** | Una forma o un icono se pinta con un color, un degradado, un degradado circular, el color del nivel del popup (pasa a bronce, plata u oro con la tarjeta) o el color de un nivel concreto, sea cual sea el popup. |
| **Formas** | Una estrella tiene un número de puntas y una profundidad, una flecha una cabeza y un asta, un triángulo una punta superior que se desliza por su base. Toda forma salvo la elipse puede tener esquinas redondeadas, un contorno o una línea puede ser discontinuo o punteado, y una forma, un icono o una imagen se pueden voltear. Una imagen se puede recortar con cualquiera de estas formas. |
| **Transparente** | Una forma distinta de una línea se puede volver transparente. No pinta nada por sí misma: todo lo que está apilado debajo, la tarjeta, su icono y su texto y los elementos inferiores, se recorta donde ella está, de modo que el escritorio se ve por el hueco. Los elementos situados encima permanecen. Una forma transparente se queda quieta, y el interruptor no se ofrece sobre un preset incluido. |
| **Sombra y brillo** | Un texto, una forma o un icono proyecta una sombra o brilla, en negro, en el color del nivel del popup o en un color propio. |
| **Un estado cada vez** | El editor trabaja sobre el estado que muestra la vista previa (normal, bronce, plata, oro, 100 % o progreso). **Editar: Todos** cambia el elemento para todos los estados; **Editar: Solo oro** (o el estado que se muestre) lo cambia solo para ese estado, desde su color hasta su posición, y un elemento añadido entonces aparece solo en ese estado. **Visible** oculta o muestra el elemento del mismo modo, de forma que una corona que solo muestra un desbloqueo oro es un icono desactivado en todas partes menos en oro. Un estado con ajustes propios para el elemento seleccionado lo indica, y **Volver a la base** hace que vuelva a seguir a los demás. Las partes de la tarjeta (título, icono, descripción) funcionan igual. |
| **Entrada y bucle** | Cómo entra un elemento una vez que la tarjeta está puesta (fundido, subida, caída, desde un lado, zoom, salto, sacudida o destello; un texto también puede escribirse solo, y un texto de rareza o progreso contar hacia arriba) y tras qué retraso, y luego si sigue moviéndose mientras se muestra el popup: un latido, una flotación, un balanceo, un giro o un destello. El editor se queda quieto mientras trabajas; **Reproducir** muestra el movimiento. |
| **Línea de tiempo** | Una barra en la parte inferior del editor muestra cuándo entra cada elemento y durante cuánto tiempo. Arrastra una barra para mover o estirar su entrada, pulsa **Reproducir** para ver la tarjeta o arrastra por la regla para detenerte en un momento. Permanece plegada hasta que cambia un ajuste de animación. |
| **Cuadros de texto** | El título, la descripción y la línea del juego se pueden reformular y recibir un cuadro propio: un relleno, márgenes, esquinas redondeadas y un contorno. La barra de progreso tiene un grosor y un color de pista, y los iconos pueden ser cuadrados. |
| **Posición y tamaño** | Valores escritos para X, Y, ancho y alto, y seis botones que alinean el elemento con los bordes o el centro de la tarjeta. |
| **Capas** | El ojo oculta un elemento. El candado lo mantiene en su sitio: no se puede mover, cambiar de tamaño ni eliminar hasta que se desbloquee, y un clic lo atraviesa. Las flechas cambian el orden de apilado. |
| **Varios a la vez** | **Mayús** o **Ctrl** + clic añade un elemento a la selección o lo quita, un arrastre desde un punto vacío elige todo lo que toca el recuadro y **Ctrl+A** lo elige todo. El grupo se mueve como uno, se alinea con la tarjeta o consigo mismo, y se duplica, se copia o se elimina de una vez. |
| **Copiar y pegar** | **Ctrl+C** y **Ctrl+V** copian la selección, también a otro preset. Los selectores de color ofrecen los colores que el diseño ya usa. |

Los archivos de preset hechos antes de esta versión siguen funcionando, y un preset que no usa nada de esto se ve y
se exporta como antes.

## Personalizar un preset incluido {#customize-a-bundled-preset}

**Personalizar un preset incluido**, en la parte superior del diseñador, parte de un preset que viene con la
aplicación. No se copia ni se edita nada de ese preset: la capa que guardas son unas pocas líneas que lo nombran, más
los valores que cambiaste, colocadas sobre el preset incluido tal como se distribuye. Si una versión posterior mejora el
preset incluido, tu capa mejora con él.

Marca las secciones que quieres cambiar: **fondo** (un color o un degradado), **color del texto**, **acento**,
**borde**, **brillo**, **fuente** (una de las cinco familias o un archivo de fuente propio) y **logotipo**.
Los controles parten de los colores propios del preset incluido. La vista previa y **Mostrar en pantalla** muestran el
preset incluido con tu capa encima.

<div align="center">
<picture><source srcset="../assets/shot/preset-customize-panel-800.webp 800w, ../assets/shot/preset-customize-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/preset-customize-panel.png" width="720" height="530" alt="Personalización del preset AW Next con un archivo de fuente y un logotipo, con vista previa en directo" loading="lazy" decoding="async"></picture><br>
<sub>AW Next con un archivo de fuente propio y un logotipo en la esquina superior derecha: solo cambian las secciones marcadas</sub>
</div>

- Funciona con los presets de la lista **Presets predeterminados**, que dibujan todos la misma tarjeta. Los presets de
  la comunidad (Batman, Onyx, Outline y los demás) dibujan sus propios diseños y no se ofrecen.
- Una capa no se puede exportar como `.awpreset`, ya que solo existe sobre el preset incluido de
  la instalación que la creó. Para compartir un diseño, constrúyelo con el diseñador.
- La **fuente de navegador de OBS** ignora las capas y muestra en su lugar el preset predeterminado.
- El popup conserva el tamaño de ventana del preset incluido, así que un resplandor o un borde grandes pueden quedar recortados.

## Importar un tema de Steam Achievement Notifier {#import-a-theme-from-steam-achievement-notifier}

Los temas de **Steam Achievement Notifier** (SAN) llegan completos. AW Next dibuja un tema importado
con los diseños de tarjeta propios de SAN, así que se ve y se mueve como en SAN: los once diseños, al tamaño de
texto de SAN y con el ajuste de escala propio del tema. Dos botones de la pestaña **Presets de notificación**
importan temas:

- **Importar tema SAN** lee un archivo `.san`, o el `usertheme.json` de un tema que SAN ya haya
  descomprimido, con las imágenes y los sonidos al lado.
- **Importar desde SAN en este PC** lee los ajustes propios de SAN cuando SAN está instalado aquí, e importa
  de una vez todos los temas guardados en este PC. Los cuatro temas en uso (normal, semirraro, raro y 100 %)
  se convierten en un solo preset, `SAN - <theme name>`, que alterna entre ellos como hace SAN, y cada otro tema
  guardado se convierte en un preset propio. Ejecutarlo de nuevo actualiza esos presets en lugar de añadir
  copias y nunca toca uno de tus propios presets que tenga el mismo nombre.

Los presets de SAN instalados se reconstruyen por sí solos.

### Qué llega {#what-comes-across}

Todo lo que contiene el tema: cada ajuste, sus imágenes (fondo, máscara, logotipos y decoraciones,
borde del icono, insignias de porcentaje, icono de logro oculto), su fuente y sus sonidos (uno por estado, o
una carpeta de la que SAN elige al azar). El preset lo lleva todo, así que SAN no hace falta después,
y se exporta como `.awpreset`.

Su aspecto es el de SAN, no el de los deslizadores del diseñador: **Editar un preajuste** lo muestra como una imagen, con un panel
de dos opciones debajo.

- **Imagen del trofeo**, para un tema que dibuja un trofeo de bronce, uno de plata y uno de oro: *Sigue el
  nivel* muestra el que corresponde al desbloqueo, o elige un color para mostrarlo siempre.
- **Tema por nivel** dibuja un nivel con otro tema de SAN importado, sonido incluido, de modo que un desbloqueo
  oro pueda verse completamente distinto de uno de bronce.

Todo lo demás se cambia en SAN y se importa de nuevo.

El estado que recibe una notificación sigue tus ajustes de rareza en AW Next. Un completado al 100 % usa la tarjeta
del 100 % de SAN. En modo raro, el oro y la plata usan su tarjeta rara y el bronce la semirrara; en modo
trofeos, el oro, la plata y el bronce usan las tarjetas rara, semirrara y normal. Un sonido de raro o de 100 % elegido en AW
Next prevalece sobre el del propio tema, y la posición y el tamaño del popup vienen de la pestaña **Notificación**.

El informe tras una importación lista lo que no pudo llegar: un archivo que el tema nombra pero no incluía,
una imagen o una fuente rechazada y ajustes de un SAN más reciente que esta versión aún no dibuja. También
se escribe en el registro de la aplicación.

### Qué se comprueba antes de instalar nada {#what-is-checked-before-anything-is-installed}

Las reglas son las de un `.awpreset`, ya que un archivo de tema viene del equipo de otra persona. No se ejecuta ni se evalúa nada
de su interior; solo se lee su `usertheme.json`. Cada ruta se comprueba contra el
paquete del que vino, y las rutas absolutas que escribe SAN se leen solo como nombres de archivo. Solo se extraen imágenes,
fuentes y audio, por tipo de archivo y bajo un límite de tamaño; se rechazan un SVG que podría ejecutar un script
y un archivo que no es una fuente. Cada ajuste se comprueba en tipo y rango. Una importación
que falla deja intactos todos los presets que ya tienes.

## Compartir un preset {#share-a-preset}

**Exportar** e **Importar**, en la pestaña **Presets de notificación**, mueven un preset entre equipos como un único
archivo `.awpreset`: el estilo, cada imagen y fuente que usa, sus ajustes del diseñador y sus metadatos.

La [galería de presets](../gallery/) reúne estos archivos: explora, descarga uno e impórtalo, o añade el
tuyo. Lo que debe ser un envío y lo que se comprueba antes de que se liste está en
[Las galerías de la comunidad](community-galleries.md).

**Exportar** escribe lo que muestra la tarjeta, con el nombre del campo **Nombre**: el diseño que hay en los
controles, guardado o no, de modo que un preset en curso se pueda compartir sin crearlo antes. Un preset
importado seleccionado en **Editar un preajuste** se exporta desde el disco tal cual, ya que su aspecto está en archivos
que los controles no pueden describir. Solo viaja el preset: ninguna ruta de tu equipo, ningún nombre de cuenta, ningún
ajuste tuyo.

**Importar** pide el archivo, lo comprueba y lo instala en `presets\Users Presets`. Si el nombre
ya está en uso, por uno de tus presets o por uno incluido, eliges **Conservar ambos** (la importación queda como
`Name (2)`) o **Reemplazar**. No se escribe nada hasta que respondes.

Un preset importado aparece en **Editar un preajuste**, queda seleccionado y desde ahí se puede volver a exportar o eliminar.
Un preset hecho por el diseñador vuelve completo para seguir editándolo. Un preset escrito a mano
obtiene su aspecto de archivos que los controles no pueden reproducir, así que los controles se quedan como están y el campo
del nombre queda vacío.

### Qué se comprueba antes de instalar nada {#what-is-checked-before-anything-is-installed-1}

Un paquete se valida entero y se rechaza por completo, sin instalarse nunca a medias, cuando:

- no es un paquete de preset, o su manifiesto falta o está mal formado;
- necesita un AW Next más reciente que el que se ejecuta, o un formato de paquete más reciente;
- contiene un archivo que el formato no describe: un programa, un script o cualquier cosa fuera de
  `preset/` y `sounds/`;
- alguna ruta de su interior apunta fuera de su propia carpeta.

No se ejecuta ni se evalúa nada de un paquete mientras se comprueba o se instala. La página del preset
se renderiza más tarde, en la misma ventana de notificación aislada que un preset incluido.

### Qué contiene un paquete {#what-a-package-contains}

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

El manifiesto se conserva junto al preset instalado como `aw-package.json`. Le dice a la aplicación que el preset
se importó y se puede volver a quitar, y lleva la descripción y el crédito a la siguiente exportación.

Un sonido que importaste tú viaja con el preset; uno incluido no, ya que el manifiesto
lo nombra y toda instalación lo tiene. Importar nunca cambia el sonido que tienes seleccionado ni sobrescribe
uno que ya tengas: un archivo distinto con el mismo nombre llega como `name (2)`.

El campo opcional `author` solo se rellena a partir del propio archivo del preset, de modo que no se te atribuye nada
a menos que lo pongas tú.

---

**Siguiente:** [Overlay](overlay.md) - la lista de logros del juego, que es independiente de estos
popups.

<div align="center">

[← Documentación](README.md) · [Notificaciones](notifications.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
