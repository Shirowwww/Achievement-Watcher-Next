---
title: "Primeros pasos"
description: "Instala Achievement Watcher Next, sigue la guía del primer inicio, elige entre Simple y Avanzado, encuentra tus juegos y mantén la aplicación actualizada."
---

# Primeros pasos

AW Next es una aplicación de escritorio para Windows y Linux. Las versiones incluyen su propio entorno de ejecución, así que Node.js solo hace falta para compilar desde el código fuente. En Linux, instala el AppImage como explica [Linux y Steam Deck](linux.md) y vuelve aquí: todo lo que sigue se aplica, con `~/.config/Achievement Watcher Next` en lugar de `%APPDATA%\Achievement Watcher Next`.

## Instalación {#install}

| Paso | Windows 10 y 11 | Linux (x64, beta) |
|---|---|---|
| **Conseguirlo** | Desde la [última versión](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest): `Achievement.Watcher.Setup.<version>.exe`, o `Achievement.Watcher.Portable.<version>.zip` para dejar los datos junto a la aplicación | Desde la misma versión: `Achievement.Watcher.<version>.AppImage` |
| **Iniciarlo** | Ejecuta el instalador, elige una carpeta y abre AW Next desde el menú Inicio | `chmod +x` y ejecútalo. Necesita FUSE 2: `libfuse2t64` en Ubuntu 24.04 |
| **Datos** | `%APPDATA%\Achievement Watcher Next` (la versión portable guarda una carpeta `data` junto al ejecutable) | `~/.config/Achievement Watcher Next` |

> [!WARNING]
> El instalador está firmado con el certificado autofirmado del proyecto (`CN=Shirow`), así que
> Windows SmartScreen puede pedir confirmación igualmente. Consulta
> [Aviso del antivirus o de SmartScreen](troubleshooting.md#antivirus-or-smartscreen-warning). Las
> actualizaciones dentro de la aplicación solo instalan una versión firmada con ese certificado, fijado por su huella.

## Primer inicio {#first-launch}

<div align="center">
<picture><source srcset="../assets/shot/onboarding-dialog-800.webp 800w, ../assets/shot/onboarding-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-dialog.png" width="720" height="475" alt="Guía del primer inicio: elección del idioma y de la interfaz Simple o Avanzada"></picture><br>
<sub>Seis pasos: lo básico, perfil, juegos, fuentes, aspecto y avisos, y un resumen final</sub>
</div>

La guía del primer inicio pregunta las decisiones que llenan la biblioteca:

- **Lo básico**: el idioma (de la interfaz y de los metadatos de los juegos cuando una fuente los ofrece) y la interfaz,
  Simple o Avanzada (ver más abajo). Ninguna viene preseleccionada.
- **Perfil**: el nombre que se muestra en la cabecera, un avatar local opcional y tu cuenta principal de Steam.
- **Juegos**: lo que se encontró en este PC, con los totales. Añade una carpeta solo si falta algo.
- **Fuentes**: inicios de sesión opcionales (Steam, Epic, Xbox, PlayStation, RetroAchievements) que leen tu biblioteca
  real y los desbloqueos hechos en otro PC. Puedes omitirlos y conectarte más tarde en **Ajustes →
  Fuentes**. Todos los interruptores de fuentes están en **Ajustar fuentes**, plegados porque los valores predeterminados leen
  todo lo que está instalado.
- **Aspecto y avisos**: el tema y cómo se anuncian los desbloqueos, con un botón **Probar notificación**.
  El valor predeterminado, **Automático**, no requiere ninguna decisión.
- **Listo**: un resumen con un botón **Cambiar** para cada elección y enlaces a las colecciones, el modo
  trofeos, los clips de vídeo y el overlay.

<div align="center">
<picture><source srcset="../assets/shot/onboarding-ready-dialog-800.webp 800w, ../assets/shot/onboarding-ready-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-ready-dialog.png" width="720" height="475" alt="El último paso de la guía del primer inicio, con el resumen y las tarjetas «Conviene saber»" loading="lazy" decoding="async"></picture><br>
<sub>El último paso: cada elección con su botón Cambiar y después una tarjeta por cada función que conviene conocer</sub>
</div>

**Omitir configuración** conserva tus respuestas, deja el resto como estaba y lanza el primer escaneo. **Ajustes →
General** vuelve a abrir la guía.

## Simple y Avanzado {#simple-and-advanced}

Elige uno en la guía del primer inicio y cámbialo cuando quieras con el control **Interfaz** en la parte superior de los
**Ajustes**.

<div align="center">
<picture><source srcset="../assets/shot/settings-panel-800.webp 800w, ../assets/shot/settings-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/settings-panel.png" width="720" height="529" alt="Los ajustes de AW Next" loading="lazy" decoding="async"></picture><br>
<sub>El control Interfaz está junto al título del panel; el campo de búsqueda filtra todas las pestañas a la vez</sub>
</div>

- **Simple** muestra las pestañas de uso diario: General, Apariencia, Mando, Notificación, Presets de
  notificación, Fuentes, Carpetas y Ayuda.
- **Avanzado** añade las pestañas **Steam / GBE Fork**, **Ubisoft / Uplay R1/R2** y **Avanzado**, y las
  opciones más profundas dentro de las demás pestañas.

**Simple oculta controles y nunca desactiva nada.** El seguimiento, el escaneo y las notificaciones se comportan
igual, y cada valor que hayas fijado sigue ahí al volver. Game Health sigue la misma idea:
Simple dice *Datos de logros encontrados* o *Se detecta al arrancar el juego*, y Avanzado da recuentos exactos, archivos y
nombres de proceso. Una instalación existente se actualiza a **Avanzado**, así que no desaparece nada de lo que usabas.

El campo de búsqueda de la parte superior de los **Ajustes** filtra todas las pestañas a la vez y cuenta las coincidencias por pestaña.
Busca en etiquetas, descripciones, valores de opciones y nombres internos, de modo que `hideZero` encuentra la misma fila en
cualquier idioma. `Ctrl+F` salta a él y `Esc` lo vacía.

## La biblioteca {#the-library}

En **Ajustes → Fuentes**, el escudo marca las bibliotecas oficiales de escritorio. Activa una fila y actualiza;
solo aparecen las bibliotecas detectadas en este PC. Consulta [Fuentes compatibles](sources.md).

El selector entre la búsqueda de la biblioteca y el botón `+` cambia entre seis vistas: tarjetas grandes,
portadas verticales, sus dos variantes compactas, una lista y una tabla de detalles con tiempo de juego y última
sesión. La elección se guarda y todas las vistas tienen las mismas tarjetas, filtros y menú contextual.

<div align="center">
<picture><source srcset="../assets/shot/library-views-800.webp 800w, ../assets/shot/library-views.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/library-views.png" width="800" height="492" alt="La vista Detalles de la biblioteca con el último logro, la última sesión y el tiempo de juego" loading="lazy" decoding="async"></picture><br>
<sub>La vista Detalles: último logro, última sesión y tiempo de juego de cada juego de un vistazo</sub>
</div>

**Ajustes → Apariencia → Recuadros de la biblioteca** fija el tamaño de los recuadros y el espacio entre ellos (hasta 0), y
muestra u oculta el nombre del juego, la barra de progreso, el icono de plataforma, el punto de estado y los dos botones, en todas las vistas
a la vez. Un juego que Steam lista sin logros muestra su ilustración en lugar de una barra; **Barra de juegos
sin logros** devuelve la barra.

Haz clic derecho en un juego para renombrarlo, editar su tiempo de juego o añadirlo a una colección. Un nombre que pongas sobrevive
a los reescaneos y a las restauraciones, mientras que las portadas y la identificación conservan el título original. Los juegos de Steam pueden tomar su
título en el idioma de tus logros (**Ajustes → General**).

### Colecciones {#collections}

Las colecciones son tus propios grupos de juegos. Haz clic derecho en un juego, elige **Colecciones** y marca una o
crea una nueva. El botón de colecciones junto al interruptor de solo instalados filtra la biblioteca a una
colección, y los números del perfil la siguen.

<div align="center">
<img src="../assets/shot/collections-flow.webp" width="800" height="493" alt="Creación de una colección Favoritos, adición de un juego desde su menú de clic derecho y selección posterior en el menú de filtro para que la biblioteca y los totales del perfil se reduzcan a sus juegos" loading="lazy"><br>
<sub>Crea una colección, añade juegos desde su menú de clic derecho y filtra después la biblioteca con ella</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/collections-panel-800.webp 800w, ../assets/shot/collections-panel.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/collections-panel.png" width="800" height="289" alt="La biblioteca filtrada a una colección Favoritos, con los números del perfil contando solo sus juegos" loading="lazy" decoding="async"></picture><br>
<sub>Vista de una sola colección: el botón toma su icono y su color, y los totales cuentan solo sus juegos</sub>
</div>

Una colección tiene un nombre, un color y un icono o una imagen propia. **Editar colección…** en el
menú del botón abre el editor, donde también puedes eliminarla; sus juegos siguen en la biblioteca.

<div align="center">
<picture><source srcset="../assets/shot/collection-editor.webp 550w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/collection-editor.png" width="360" height="337" alt="El editor de colecciones, con nombre, color, icono e imagen" loading="lazy" decoding="async"></picture><br>
<sub>El editor de colecciones</sub>
</div>

### Estadísticas de la biblioteca {#library-stats}

El botón redondo junto a la tasa de finalización en la cabecera del perfil abre las **Estadísticas de la biblioteca**: la finalización
global, los recuentos de desbloqueados y bloqueados, la media por juego, el tiempo de juego medio y registrado, el recuento de trofeos
y una fila por plataforma. **Mostrar solo los juegos instalados** limita los totales a este PC. La flecha
junto al botón pliega la cabecera del perfil en una sola fila, lo que da más espacio a la biblioteca (**Ajustes
→ Apariencia → Perfil** ofrece la misma opción).

<div align="center">
<picture><source srcset="../assets/shot/stats-overview-800.webp 800w, ../assets/shot/stats-overview.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-overview.png" width="800" height="514" alt="El panel de estadísticas de la biblioteca: finalización global, recuentos de desbloqueados y bloqueados, media por juego y tiempo de juego" loading="lazy" decoding="async"></picture><br>
<sub>El resumen: finalización, recuentos, media por juego y tiempo de juego</sub>
</div>

**Trofeos** cuenta un platino por cada juego terminado (un juego de PlayStation cuando consigue su trofeo de
platino) y clasifica cada otro logro desbloqueado por su rareza, con los umbrales bajo la barra (siguen
el ajuste de rareza en [Notificaciones](notifications.md#trophy-mode)). **Juegos platino** lista
lo que has terminado y cuándo, **Logros más raros** los más difíciles que tienes y **Todos los logros**
abre la lista completa.

<div align="center">
<picture><source srcset="../assets/shot/stats-trophies-800.webp 800w, ../assets/shot/stats-trophies.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-trophies.png" width="800" height="514" alt="Los recuentos de trofeos, los juegos platino, los logros más raros y la tabla por plataforma" loading="lazy" decoding="async"></picture><br>
<sub>Trofeos, juegos platino, los desbloqueos más raros y los totales por plataforma</sub>
</div>

## Temas {#themes}

**Ajustes → Apariencia** pinta toda la aplicación y el overlay del juego. Hay trece paletas integradas
y todas se pueden editar: elige un tema y el editor se abre en sus colores, una fila por capa (fondo de la
ventana, barra superior, panel de la biblioteca, tarjetas y filas, ventana de ajustes, texto, texto atenuado, bordes, acento).
Cada capa admite un color con opacidad y, opcionalmente, un degradado, y las cinco capas de superficie pueden
llevar además una imagen de fondo con un ajuste y un velo de color o un desenfoque.

Editar muestra una vista previa en directo y no escribe nada. **Guardar tema** lo convierte en un tema propio: conserva el nombre para
reemplazar ese tema o escribe otro para tener un segundo. **Personalizado…** es el espacio de pruebas, siempre
editable y nunca sobrescrito por un guardado hecho desde él. **Restablecer todo** restaura el tema que estás
editando: uno integrado recupera su propia paleta, un tema guardado o importado recupera lo que hay en el disco y
Personalizado vuelve a la paleta predeterminada.

**Archivos de tema** convierte un tema en un único archivo portátil. **Exportar tema…** escribe un `.awtheme` con la
paleta, los degradados, los efectos y las imágenes que usaste, y nada sobre tu equipo (una imagen viaja como
bytes, nunca como ruta). Se rechaza exportar uno integrado hasta que lo guardes con tu propio nombre, porque
el archivo se instalaría en otro sitio como «Nord» y taparía el Nord que ya hay. **Importar
tema…** muestra primero la aplicación dibujada con ese tema, con su nombre, autor, versión y número de imágenes, y
instala solo cuando confirmas. **Eliminar tema** quita un tema importado junto con sus imágenes.

Un `.awtheme` contiene solo colores, números e imágenes, así que no puede ejecutar nada ni acceder a la red
(consulta [la referencia del formato](../awtheme-format.md)). Los temas que han hecho otras personas están en la
[galería de temas](../gallery/themes/), y enviar el tuyo requiere [un solo archivo](community-galleries.md). Un simple
archivo `*.css` colocado en `%APPDATA%\Achievement Watcher Next\themes` sigue apareciendo en el selector, pero
no se puede exportar.

## Ayuda y consejos {#help-and-tips}

**Ajustes → Ayuda** es una referencia viva, agrupada según cómo surge una duda: **Primeros pasos**,
**Algo no funciona**, **Juegos emulados** y **Personalización**. Muestra tu atajo real, la disposición y los
botones asignados del mando, tu tema y tu modo de notificación, y se actualiza al cambiar los ajustes. Su búsqueda
ignora mayúsculas y acentos, y todos los temas están disponibles en ambos modos de interfaz.

## Encontrar juegos y partidas guardadas {#find-games-and-saves}

Abre **Ajustes → Carpetas** y elige una ruta:

- **Búsqueda inteligente** ofrece todo lo que encuentra para que lo apruebes antes de añadir nada. Reconoce las carpetas de biblioteca
  por su nombre («Games», «Jeux», «Repacks» y sus equivalentes en una veintena de idiomas, además de
  «Emulators» y «Emulation») en todas las unidades, y lee lo que registraron los lanzadores: los manifiestos de
  Epic, las entradas del registro de GOG Galaxy y Ubisoft Connect y el puntero que Windows escribe para la
  unidad que elegiste para los juegos de Xbox. Así encuentra una biblioteca con nombre de tienda (`D:\Epic Games`,
  `D:\XboxGames`) sin escanearla. Los juegos que pertenecen a un lanzador conservan su propia fuente. La Búsqueda inteligente añade
  todo lo demás de la misma carpeta, normalmente donde acaba un repack o una compilación de Goldberg.
- **Añadir una carpeta** vigila una ubicación que seleccionas.
- **Generar configuraciones** ejecuta un escaneo más completo y puede aplicar las opciones de configuración de emulador activadas.

Si se rechaza una carpeta, selecciona el directorio que contiene directamente las carpetas de partidas, las carpetas de AppID,
`steam_settings` o la configuración del emulador. [Solución de problemas](troubleshooting.md#a-game-is-missing)
lista las primeras comprobaciones. Cuando el nombre de una carpeta coincide con varias versiones de Steam y la coincidencia es errónea,
haz clic derecho en el juego y elige **Definir el AppID manualmente...** (consulta
[Fijar a mano el AppID de un juego](advanced.md#set-a-games-appid-by-hand)).

Las listas de logros no necesitan clave de la API web de Steam: vienen de puntos de acceso públicos y se guardan en caché por
idioma, de modo que la biblioteca funciona sin conexión después ([cómo](sources.md#steam-metadata-without-an-api-key)).

## Notificaciones {#notifications}

**Ajustes → Notificación** fija el modo de entrega: **Automático** (el predeterminado: el overlay del juego cuando
puede mostrarse, una notificación de Windows o del escritorio cuando no, y nunca el mismo desbloqueo dos veces),
**Overlay en el juego**, **Notificación de Windows** o **Ambos**. Si el modo No molestar de Windows oculta las
notificaciones mientras juegas, activa **Notificaciones prioritarias** y aprueba la solicitud única. Los botones
de prueba permiten probarlo todo antes de iniciar un juego. Consulta [Notificaciones](notifications.md) y
[qué mira Automático](notifications.md#how-automatic-decides).

## Revisar un juego {#check-on-a-game}

El botón de **herramientas** de un recuadro de juego abre su panel **Game Health**: si AW Next puede ver el juego, leer
sus logros y anunciar sus desbloqueos, y las reparaciones que se aplican. Es lo primero que conviene abrir
antes de informar de un problema (consulta [Game Health](game-health.md)). Para volver a jugar un juego desde cero, usa
[Restablecer los logros](advanced.md#reset-a-games-achievements), que antes lo guarda todo.

## Bandeja y arranque {#tray-and-startup}

Al cerrar la ventana principal, AW Next se queda en la bandeja del sistema, donde el rastreador en segundo plano sigue vigilando
archivos y procesos para el tiempo de juego y los desbloqueos. Sin ninguna ventana abierta devuelve su memoria a Windows,
y el escaneo periódico de la biblioteca espera mientras se ejecuta un juego. **Ajustes → Avanzado → Actualizaciones automáticas de los datos de logros**
desactiva ese escaneo para quien mantiene `steam_cache` a mano. Que AW Next
arranque con Windows y se cierre a la bandeja se decide en **Ajustes → General**. Para salir por completo, usa el
menú de la bandeja.

## Actualizaciones y datos existentes {#updates-and-existing-data}

Las versiones instaladas consultan el canal de versiones de GitHub del proyecto, nunca durante una partida. Una versión nueva se
anuncia con una notificación de escritorio y un indicador en la barra de título (el icono de la bandeja también muestra un punto azul), y
nada le quita el foco a un juego ni a otra aplicación. El aviso permanece hasta que lo cierres y vuelve
después de una partida.

Haz clic en la notificación o en el indicador para abrir la ventana de actualización. Muestra las notas de versión de cada
versión que omitiste y el tamaño de la descarga, con **Actualizar ahora**, **Más tarde** y **Omitir esta versión**.
No se descarga nada antes de que elijas. Tras **Actualizar ahora**, la misma ventana sigue la descarga, que
puedes cancelar o enviar a segundo plano. El indicador de la barra de título muestra el estado y trae la ventana de vuelta.
Cuando termina la descarga, el instalador muestra su propia tarjeta de progreso y AW Next se reinicia. Si hay un juego
en ejecución, la instalación espera a que se cierre, o puedes instalar igualmente desde la ventana. **Ajustes →
Buscar actualizaciones** abre la ventana de inmediato. Las actualizaciones descargan solo lo que cambió y recurren por sí solas al
instalador completo si eso falla. El AppImage de Linux se actualiza desde las mismas versiones (consulta
[Actualizaciones en Linux](linux.md#updates)).

Una versión más reciente instalada sobre una anterior conserva tus datos en `%APPDATA%\Achievement Watcher Next`:
ajustes, carpetas vigiladas, cachés, tiempo de juego, registros, recursos de notificación y datos de cuentas locales. En el
primer inicio tras actualizar, AW Next importa una instalación anterior:

| Vienes de | Se importa desde | Qué ocurre |
|---|---|---|
| Achievement Watcher 3.x | `%APPDATA%\Achievement Watcher 3.0` | Se trasladan los ajustes, presets, temas, portadas, cachés, copias de seguridad y registros |
| Achievement Watcher 1.6.8 | `%APPDATA%\Achievement Watcher` | Igual, para quien se saltó la 3.x |
| Un equipo nuevo | nada | AW Next arranca con los valores predeterminados |

La importación se ejecuta una vez, copia los archivos pequeños, crea enlaces físicos de los grandes que se escriben una sola vez y **nunca borra ni
modifica la carpeta de la que lee**. Los contadores de tiempo de juego guardados en el registro también pasan, y
las capturas de pantalla se mueven a `Pictures\Achievement Watcher Next` salvo que hayas elegido tu propia carpeta.

La desinstalación ofrece una sola opción, desactivada por defecto: **Eliminar también los ajustes, la caché y los datos guardados** (o
`--delete-app-data` en una desinstalación silenciosa), que borra la carpeta de datos y el tiempo de juego del registro.
Si una actualización falla una y otra vez con el mismo archivo descargado, **Ajustes → Avanzado → Vaciar cachés** borra
solo las cachés que se pueden volver a descargar (archivos de actualización, esquemas e iconos de Steam y Ubisoft, herramientas de corrección del emulador).
Los ajustes, las partidas guardadas y las copias de seguridad se quedan.

---

**Siguiente:** [Fuentes compatibles](sources.md): qué puede leer AW Next y qué necesita cada fuente.

*Salta directamente a lo que necesites: [Notificaciones](notifications.md) ·
[Game Health](game-health.md) · [Configuración de Goldberg / GBE](emulator-setup.md) ·
[Solución de problemas](troubleshooting.md)*

<div align="center">

[← Documentación](README.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
