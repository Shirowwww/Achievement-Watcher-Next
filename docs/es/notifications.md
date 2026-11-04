---
title: "Notificaciones y popups de logros"
description: "Popups en overlay o notificaciones de Windows: modos de entrega, Automático, sonidos, posición, modo trofeos, OBS, capturas de recuerdo y clips de vídeo."
---

# Notificaciones y popups de logros

AW Next anuncia un desbloqueo con una notificación nativa de Windows (toast), un popup de overlay en el juego o
ambos. Elige el modo en **Ajustes → Notificación**.

En Linux, la notificación es la del propio escritorio (GNOME o KDE) y el overlay funciona igual.
No molestar y el interruptor de Notificaciones prioritarias se tratan en [Escritorios compatibles](linux.md#supported-desktops).

<div align="center">
<picture><source srcset="../assets/shot/notifications-panel-800.webp 800w, ../assets/shot/notifications-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notifications-panel.png" width="720" height="529" alt="Ajustes - Notificación"></picture><br>
<sub>Un modo de entrega, un preset - Automático se encarga del resto</sub>
</div>

## Elegir un modo de entrega {#choose-a-delivery-mode}

| Modo | Comportamiento |
|---|---|
| **Automático** (predeterminado) | El overlay del juego cuando puede mostrarse, una notificación de Windows cuando no. |
| **Overlay en el juego** | Siempre el popup con estilo sobre el juego en ejecución, incluso en pantalla completa exclusiva, donde puede no verse. Si el overlay no puede mostrarse en absoluto, esa notificación llega como notificación de Windows. |
| **Notificación de Windows** | Siempre la notificación del sistema de Windows. Las notificaciones de logros y de progreso usan el icono del logro; las de tiempo de juego pueden incluir el arte del juego y una barra de progreso. |
| **Ambos** | El mismo evento por los dos canales. |

AW Next publica por sí mismo las notificaciones de Windows y no inicia ningún otro programa, PowerShell incluido, así que
aparecen al instante. Un identificador de aplicación personalizado fijado en `options.ini` (`[notification_advanced] appID`) sigue
pasando por la antigua vía de PowerShell.

La ventana de la biblioteca puede permanecer cerrada en cualquier modo: el rastreador en segundo plano se encarga de la entrega.

<div align="center">
<picture><source srcset="../assets/shot/notification-popup.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup.png" width="440" height="126" alt="Un popup de desbloqueo" loading="lazy" decoding="async"></picture><br>
<sub>El popup del overlay, dibujado por el preset seleccionado con el arte del propio juego</sub>
</div>

Sea cual sea el modo, **Websocket @localhost:8082** emite cada evento de notificación como JSON por un
websocket local, para overlays de streaming y otras herramientas. Está activado por defecto, escucha solo en `127.0.0.1`
y no muestra nada por sí mismo. Desactívalo si no lo usas. La misma dirección sirve un overlay de
streaming ya preparado: consulta [Mostrar los desbloqueos en el stream (OBS)](#show-unlocks-on-stream-obs).

> [!TIP]
> Usa los botones de prueba después de cambiar el modo. Una prueba correcta confirma la ruta de visualización; un desbloqueo
> real sigue dependiendo de que la fuente del juego se vigile correctamente.

### Cómo decide Automático {#how-automatic-decides}

Cada notificación se encamina una vez, según lo que AW Next puede observar en ese momento:

| Situación | Qué ocurre |
|---|---|
| Nada cubre la pantalla | Overlay en el juego. |
| El juego está en **pantalla completa** (Direct3D con las optimizaciones de pantalla completa de Windows, que tienen la mayoría de los juegos) | Notificación de Windows, mostrada sobre el juego sin quitarle el foco: una notificación prioritaria cuando están activadas y, si no, un recordatorio que AW Next cierra tras el tiempo habitual de las notificaciones. Los juegos en ventana sin bordes o en ventana conservan el overlay. |
| El juego retiene la pantalla en **modo exclusivo heredado** (juegos antiguos, muchos juegos de OpenGL u optimizaciones de pantalla completa desactivadas) | En esa pantalla no se dibuja nada de otra aplicación. La notificación va al Centro de notificaciones; su sonido y la vibración del mando se reproducen igualmente. El modo sin bordes en el juego la devuelve a la pantalla. |
| La aplicación no puede mostrar el popup (ningún preset utilizable, renderizador no disponible) | Una notificación de Windows. |
| El overlay no consigue mostrarse | Notificaciones de Windows durante diez minutos y después se vuelve a probar el overlay. |
| Se pidió el overlay pero nunca respondió | Ninguna segunda notificación, para evitar un duplicado. El siguiente desbloqueo usa una notificación de Windows. |

AW Next recuerda qué canal entregó por última vez en cada juego y lo usa solo como desempate cuando
Windows no puede decir si un juego está en pantalla completa exclusiva. Solo se recurre a una alternativa tras un
fallo definitivo, así que el mismo desbloqueo nunca se anuncia dos veces. AW Next no se inyecta en los juegos ni fuerza
cambios del modo de pantalla.

### Dónde se muestra el estado actual {#where-the-current-state-is-shown}

El panel **Game Health** de un juego tiene una fila Notificaciones que nombra el canal que entregó la última
notificación y por qué, por ejemplo *Funciona - alternativa de Windows activa* (modo Simple). Si aún no hay
notificaciones, muestra el modo configurado. Si Windows retuvo una notificación en el Centro de notificaciones
porque el juego estaba en pantalla completa o No molestar estaba activado, la fila lo dice. Consulta
[Game Health](game-health.md).

## Notificaciones prioritarias de Windows {#priority-windows-notifications}

Los juegos a pantalla completa y otras reglas automáticas de Windows pueden activar **No molestar**, que envía
los toasts normales al Centro de notificaciones sin mostrarlos. **Ajustes → Notificación → Notificaciones
prioritarias** marca los desbloqueos de logros como importantes. Windows pregunta una vez si AW Next puede enviarlas;
cambia la respuesta en los ajustes de notificaciones de Windows.

Está desactivado por defecto y solo cubre los desbloqueos de logros y de completado, nunca el progreso ni el tiempo de juego.
El toast usa el escenario `urgent`, que necesita Windows 11 (compilación 22546) o posterior; en Windows 10
el ajuste no hace nada. Consulta [la documentación de Microsoft sobre notificaciones de aplicaciones](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content).

## Juegos que ejecuta Steam {#games-steam-runs}

Steam muestra su propio aviso para los juegos que ejecuta, así que AW Next calla por defecto en ellos. Activa
**Ajustes → Notificación → Juegos del cliente de Steam** para recibir también la notificación de AW Next, con su sonido,
overlay, rareza y captura de recuerdo. Cubre los juegos en propiedad y los añadidos con SteamTools,
LuaTools o GreenLuma: AW Next sigue el archivo de estadísticas que Steam reescribe en `appcache\stats`. Para conservar
solo la notificación de AW Next, desactiva **Steam → Configuración → Notificaciones → Desbloqueo un logro**.

## Cómo se ve el popup {#how-the-popup-looks}

El aspecto del popup en el juego es un **preset**: diez vienen con la aplicación, puedes diseñar los tuyos y un
preset se puede compartir en un único archivo `.awpreset`. Consulta [Presets y el Diseñador de presets](presets.md).
**Opacidad** (del 30 % al 100 %) en los mismos ajustes fija lo translúcido que es el popup.

## Sonidos, volumen y duración {#sounds-volume-and-duration}

- Importa archivos `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a` o `.aac` desde los ajustes de Notificación.
- **Aleatorio** en la lista de sonidos reproduce un archivo distinto de los tuyos en cada notificación y en cada
  vista previa o prueba.
- **Sonido de logro raro** y **Sonido de completado al 100%** (modo Avanzado) dan a esos popups su propio
  sonido, para el overlay y las notificaciones de Windows. Ambos empiezan en «Igual que los desbloqueos»; «Ninguno» deja
  ese tipo de popup en silencio. Un sonido elegido para un juego en su propio panel sigue teniendo prioridad.
- **Sonido del progreso** (modo Avanzado) hace lo mismo con los popups de progreso. Tiene prioridad sobre el sonido propio
  de un juego, salvo en un juego configurado sin sonido. Para silenciar los popups de progreso de un juego, haz clic derecho en él y
  silencia su progreso.
- **Emuladores** (modo Avanzado) da a cada consola su propio preset y sonido: aparecen Xenia, RPCS3, shadPS4 y
  Kyty. Los juegos de Xbox 360 recompilados siguen la elección de Xenia, las adaptaciones de PS4 la de shadPS4 y
  **Igual que el principal** conserva los ajustes principales.
- El volumen del overlay va del 0 % al 200 %; por encima del 100 % el overlay amplifica el sonido. La reproducción de las
  notificaciones de Windows está limitada por la ruta de audio del sistema.
- La duración sigue al preset o usa un tope fijo.
- Las notificaciones de tiempo de juego son silenciosas.

Un preset compartido puede traer su propio sonido, que sustituye al seleccionado aquí. Consulta
[Compartir un preset](presets.md#share-a-preset).

## Posición y escala {#position-and-scale}

Elige una esquina, un borde o una posición centrada en los ajustes de Notificación. Las posiciones se miden
respecto a la pantalla completa, así que un anclaje inferior se sitúa en el borde de abajo, no sobre la barra de tareas, y la
tarjeta toca los bordes elegidos sea cual sea el espacio que su preset deje alrededor para sombra o resplandor. AW
mide cada preset una vez por posición, en segundo plano tras su primer popup, de modo que ese primer popup
aparece en el sitio anterior. Un preset cuya tarjeta sigue la longitud de su texto (PS5 Steam, Slim)
se mide con cada popup, lo que lo retrasa aproximadamente medio segundo.

**Reposicionar** mueve la posición personalizada, que se usa exactamente como la dejaste; una guardada en un monitor que
ya no existe vuelve a la vista. Con varias pantallas, el popup aparece en la pantalla del juego
al que juegas, no en la que está bajo el ratón, y una posición personalizada mantiene su lugar relativo a esa
pantalla. Las notificaciones de Windows siempre se muestran en la pantalla principal.

El ajuste de escala cambia el tamaño de todo el popup sin alterar su diseño, y **Reposicionar** lo
previsualiza a esa escala.

### Popups de progreso {#progress-popups}

Los logros con contador (derrotar a 50 enemigos, recorrer 100 km) pueden generar un popup de progreso en cada paso. En
modo Avanzado, **Posición del progreso** y **Tamaño del progreso** dan a esos popups su propio lugar y
tamaño. **Igual que los desbloqueos**, el valor predeterminado, sigue la posición propia de un juego cuando la tiene; cualquier otra
opción se aplica a los popups de progreso de todos los juegos. La mira junto a **Posición del progreso** coloca
un anclaje personalizado solo para el progreso. Estos ajustes mueven únicamente el popup del juego.

**Hitos de progreso**, en los ajustes comunes de notificación, muestra una notificación de progreso solo cuando
un contador cruza otro 10, 25 o 50 % de su objetivo. Se aplica al popup y a la notificación de Windows.
El desbloqueo en sí se muestra siempre.

La lista del overlay tiene sus propios atajos de teclado (consulta la
[guía del overlay](overlay.md#keyboard-shortcuts-overlay-open)) y control opcional con mando (consulta la
[guía del mando](controller.md)).

## Comportamiento por juego {#per-game-behavior}

Abre el panel de herramientas de un juego y elige **Notificación** para darle su propio preset de popup,
posición, sonido o escala. Cada campo hereda el ajuste global y solo se guardan los valores que cambies;
el sonido ofrece además silencio y aleatorio. La mira junto a Posición arrastra una vista previa hasta donde
debe aparecer el popup de ese juego. Los cinco botones de prueba muestran una vista previa de ese juego y de su arte sin
cambiar el progreso de los logros. Un preset o sonido eliminado vuelve al valor global, y renombrar
un preset de usuario conserva sus asignaciones a juegos.

Haz clic derecho en un juego para silenciar sus notificaciones de progreso conservando las de desbloqueo y
de completado.

Un logro con una tasa global de desbloqueo igual o inferior al límite de rareza muestra su porcentaje y recibe
el estilo raro del preset: **oro** con un 5 % o menos, **plata** hasta el 10 %, **bronce** hasta el 15 %. Cambia
esos límites con **Ajustes → General → Umbrales de rareza** en Personalizado (modo Avanzado).

### Modo trofeos {#trophy-mode}

**Ajustes → General → Visualización de la rareza** cambia a **Modo trofeos**: cada logro se clasifica por
su tasa global de desbloqueo (oro por debajo del 20 %, plata por debajo del 50 %, bronce en otro caso o cuando la tasa es
desconocida) en la ventana del juego, el overlay, los trofeos del perfil y la notificación. Los **Umbrales de
rareza** mueven los límites. Los tres grados usan el estilo raro del preset (`state-rare` más
`tier-gold`, `tier-silver` o `tier-bronze`); el platino sigue siendo el estado de completado aparte. La aplicación
da a un preset su nivel en `rarityTier` (con `rarityMode` y el `rarityGrade` localizado); un preset
sin ese campo vuelve al porcentaje.

Con una cuenta de PlayStation conectada (**Ajustes → Fuentes**), un juego que también salió en
PlayStation usa su lista de trofeos real, vengan de donde vengan sus logros: cada logro toma el
grado y el grupo de DLC del trofeo con el mismo nombre o descripción. El platino real aparece en cada
modo de rareza (página del juego, estadísticas, popup del 100 %) con su nombre, descripción e icono, y cuenta cuando ese
trofeo se consigue, aunque queden trofeos de DLC. Los emuladores de PlayStation conservan sus propios trofeos. AW
encuentra la lista por el nombre original del juego, así que renombrar un juego no cambia nada.

Todas las fuentes lanzan el popup del 100 %, también las que son en directo (Xenia, adaptaciones recompiladas, GOG Galaxy,
Ubisoft Connect, Xbox PC). Cuando el juego tiene platino, el logro vinculado a él aparece como
el platino.

<div align="center">
<picture><source srcset="../assets/shot/trophy-profile.webp 640w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/trophy-profile.png" width="440" height="148" alt="La cabecera del perfil con los recuentos de trofeos platino, oro, plata, bronce y comunes" loading="lazy" decoding="async"></picture><br>
<sub>El perfil cuenta cada desbloqueo por grado, con platino para los juegos terminados</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/trophy-game-panel.webp 800w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/trophy-game-panel.png" width="560" height="672" alt="Una página de juego donde cada logro está clasificado como oro, plata o bronce" loading="lazy" decoding="async"></picture><br>
<sub>En la página de un juego, cada logro lleva su grado y el porcentaje de jugadores que lo tienen</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/notification-popup-trophy.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup-trophy.png" width="440" height="126" alt="Un popup de desbloqueo dibujado con el estilo oro" loading="lazy" decoding="async"></picture><br>
<sub>Un desbloqueo oro en el preset AW Next</sub>
</div>

## Mostrar los desbloqueos en el stream (OBS) {#show-unlocks-on-stream-obs}

Capturar el popup como ventana no funciona: la ventana del popup dura unos segundos, así que OBS nunca la
pilla. Usa una fuente de **Navegador**, que OBS mantiene cargada durante todo el stream.

1. **Ajustes -> Notificación -> Fuente de navegador de OBS.** **Vista previa** abre la página en tu navegador
   con un desbloqueo de ejemplo cada diez segundos, la forma más rápida de comprobar que la cadena funciona. **Copiar enlace**
   copia la dirección.
2. En OBS: **+ -> Navegador**, pega la dirección en **URL**.
3. Fija cualquier **Ancho** y **Alto**. La tarjeta se escala para llenar el recuadro.

La fuente muestra el mismo preset, arte y estilo de rareza que el popup del juego y sigue el
preset que elijas en los Ajustes. Los botones de prueba de **Ajustes -> Notificación** también disparan hacia ella,
sea cual sea el modo de entrega.

> [!TIP]
> **Una fuente más grande da una tarjeta más nítida.** La tarjeta se compone al tamaño de la fuente, no se estira.
> Da a la fuente aproximadamente el doble del recuadro propio del preset y colócala a la mitad de tamaño en tu escena:
> `http://127.0.0.1:8082/obs/_config` indica ambas cifras. Solo el icono del logro se queda borroso,
> ya que Steam lo publica a 64x64.

### Opciones {#options}

Añádelas a la dirección, `?first=x&then=y`:

| Opción | Efecto |
|---|---|
| `?test=1` | Repite un desbloqueo de ejemplo cada diez segundos, para colocar la fuente. Quítala después. |
| `?scale=2` | Fija la tarjeta a ese zoom en lugar de ajustarla a la fuente. `?scale=app` sigue la escala fijada en los Ajustes. |
| `?duration=8000` | Mantiene cada tarjeta esa cantidad de milisegundos en lugar de la duración configurada. |
| `?sound=1` | Reproduce el sonido de la notificación a través de la fuente de navegador, de modo que llega al stream sin capturar el audio del escritorio. Desactivado por defecto, ya que la aplicación ya lo reproduce en tus altavoces. Marca **Controlar el audio mediante OBS** en la fuente para incluirlo en la mezcla. |
| `/obs/preset/Xbox/` | Usa un preset concreto para el stream, sea cual sea el ajuste del escritorio. Sirve el nombre de cualquier preset instalado, incluidos los tuyos. |

### Notas {#notes}

- La página está en blanco entre desbloqueos por diseño: no se dibuja nada, así que no consume CPU hasta que aparece un
  logro.
- Es solo local. La página y el canal escuchan en `127.0.0.1`, así que nada más de tu red puede
  alcanzarlos.
- Los iconos de los logros se sirven desde este equipo para las fuentes que guardan su arte en local
  (Goldberg, emuladores, el arte de tu propia biblioteca), y solo para imágenes que una notificación anunció.
- Una sola copia de AW Next sirve la dirección: la que arrancó primero. Una segunda instancia, o cualquier otra cosa
  en el puerto 8082, deja a la fuente sin nada a lo que conectarse. Cierra la copia sobrante y la fuente
  se reconecta en unos segundos.
- Si la fuente sigue en blanco ante un desbloqueo real, comprueba que los botones de prueba funcionan y después que la fila
  **Websocket** está activada.

## Logros en las páginas de la biblioteca de Steam {#achievements-on-steams-library-pages}

Steam no muestra logros en la página de un acceso directo que no es de Steam. Un plugin de Steam (Millennium en el
escritorio, Decky en el Modo Juego) puede pedir a AW Next los logros de ese acceso directo por el mismo canal local,
`ws://127.0.0.1:8082`, y dibujarlos por sí mismo. AW Next responde de un juego cada vez: el plugin tiene que
nombrarlo, y la respuesta no lleva carpeta, cuenta ni nombre de fuente.

El plugin Millennium propio de AW Next, en la carpeta `millennium/` del repositorio, lo hace con cada
acceso directo que AW Next reconoce: la página del juego muestra entonces la sección Logros propia de Steam, el contador de la
barra de juego, la lista completa y la pestaña «Tus cosas» de Big Picture. Un acceso directo se empareja mejor cuando
inicia el mismo exe que el **Ejecutable** del juego en AW Next. Su README cubre la instalación, qué
comprobar cuando una página sigue vacía y cómo convive con Steam Cartridges, NativeGameLink y Game
Data Linker. La extensión de Playnite en `playnite/` pregunta del mismo modo, para cualquier juego de una biblioteca de Playnite,
y su README cubre la instalación y los paneles que puede colocar un tema. La petición de abajo es
para quien escriba otro plugin.

El plugin envía:

```json
{ "cmd": "bridge-game", "id": "r1", "exe": "D:\\Games\\Pinyon Shift\\pinyon_shift.exe", "launchOptions": "", "steamAppId": 0, "name": "Forza Horizon" }
```

Todos los campos salvo `cmd` son opcionales, y cada uno que añade ayuda. AW Next los prueba en este orden: el
exe que la biblioteca encontró para un juego, una carpeta de juego o una ROM nombrada en las opciones de lanzamiento (un acceso directo
de emulador), un AppID de Steam, un lanzador en la carpeta del juego, el nombre de archivo del exe y por último el título exacto.
Cuando un paso encaja con más de un juego, AW Next responde «no encontrado».

La respuesta:

```json
{ "cmd": "bridge-game", "id": "r1", "bridge": 1, "found": true,
  "game": { "id": "x360-4D5309C9", "name": "Forza Horizon", "total": 50, "unlocked": 12,
    "achievements": [{ "id": "1", "name": "...", "description": "...", "icon": "https://...", "iconLocked": "https://...",
      "hidden": false, "rarity": 12.5, "unlocked": true, "unlockedAt": 1790000000 }] } }
```

- `unlockedAt` está en segundos Unix. `rarity` y `progress` (`{ "current": 6, "max": 50 }` en un logro
  bloqueado a medio hacer) solo aparecen cuando AW Next los conoce.
- Un icono guardado en este PC llega como una dirección `http://127.0.0.1:8082/bridge/icon/...`.
- La lista es la biblioteca tal como la vio el último escaneo, más los desbloqueos anunciados desde entonces. Los desbloqueos
  siguen llegando por el canal: cuando uno lleva el `id` del juego en `appID`, vuelve a preguntar para refrescar la página.
- El plugin se conecta desde las páginas propias de Steam (`https://steamloopback.host`) o desde un proceso nativo;
  los sitios web se rechazan. Si hay una contraseña de websocket fijada, necesita la misma contraseña.
- No debe conectarse como `?client=decky`: ese nombre le dice a AW Next que Steam muestra sus
  notificaciones, y AW Next mantiene entonces apagado su propio popup.

## Capturas de pantalla de recuerdo {#screenshot-souvenirs}

**Captura al desbloquear** guarda una imagen de la pantalla un momento después de que aparezca un logro, una vez que el
popup ha terminado de mostrarse, para que la notificación salga en la captura. Los archivos van a
`<folder>\<game>\<achievement> - <date>.png`, con la fecha en la hora local del PC. **Abrir carpeta** en la misma fila la abre, creándola
antes si hace falta. La carpeta predeterminada es `Pictures\Achievement Watcher Next` y se puede cambiar.

Los logros que se desbloquean en el mismo segundo conservan cada uno su archivo, y un juego cuyo título Windows
rechaza como nombre de carpeta recibe igualmente sus capturas. Con varios monitores, el recuerdo captura
el monitor en el que está el juego, como los clips de vídeo; sin ventana de juego visible, toma el monitor
de la ventana en primer plano y después el principal.

### Jugar con el HDR de Windows activado {#playing-with-windows-hdr-on}

**Capturas HDR** es **Automático** por defecto. En el momento de la captura, AW Next comprueba si el HDR está activo
en la pantalla que muestra el juego. Si es así, un ayudante de un solo uso captura un fotograma FP16 mediante Windows
Graphics Capture, aplica mapeo de tonos a sus altas luces para obtener un PNG SDR/sRGB y termina. Con el HDR desactivado,
**Automático** y **Desactivado** usan la captura estándar. Cualquier fallo del ayudante (falta de compatibilidad de Windows, una captura
bloqueada, un tiempo de espera agotado) también recurre a la captura estándar, de modo que no se pierden ni el recuerdo ni la
notificación.

## Clips de vídeo {#video-clips}

**Videoclip al desbloquear** funciona como el vídeo de trofeo de una consola. Mientras se ejecuta un juego que AW Next rastrea,
los últimos segundos de partida se guardan en memoria, ya comprimidos por el codificador de vídeo de la tarjeta gráfica.
Cuando aparece un logro, el tramo que lo rodea se guarda como MP4 en
`<folder>\<game>\<achievement> - <date>.mp4`, con el popup en medio. La carpeta es
`Videos\Achievement Watcher Next` salvo que elijas otra. Los logros que se desbloquean muy seguidos
comparten un clip.

| Ajuste | Opciones | Predeterminado |
|---|---|---|
| Duración del clip | De 10 a 30 segundos, la mitad antes del desbloqueo y la mitad después | 20 s |
| Formato | H.264, HEVC o AV1, guardado como MP4 | H.264 |
| Resolución | Pantalla, 2160p, 1440p, 1080p o 720p, nunca por encima de la pantalla | 1080p |
| Fotogramas por segundo | 30 FPS, 60 FPS o Sin límite, que sigue a tu pantalla (120, 144, 240 Hz) | 30 FPS |
| Calidad | Baja, Media o Alta | Media |
| Sonido | Solo el juego, o todo el PC | Solo el juego |

<div align="center">
<picture><source srcset="../assets/shot/video-clip-panel-800.webp 800w, ../assets/shot/video-clip-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/video-clip-panel.png" width="720" height="529" alt="Ajustes, Notificación: la sección Videoclip con su interruptor de activado/desactivado" loading="lazy" decoding="async"></picture><br>
<sub>La sección Videoclip está al final de la pestaña Notificación y permanece desactivada hasta que la actives</sub>
</div>

La fila bajo la tabla estima el tamaño de un clip para tu pantalla. Es un techo: el codificador
trabaja a tasa de bits constante y una escena tranquila sale más pequeña.

- **Coste.** No se ejecuta nada mientras no haya ningún juego en marcha. La captura, el escalado y la codificación se quedan en la GPU, en un
  bloque de codificación distinto del que renderiza el juego. El grabador usa mucho menos del 1 % de la CPU
  y unos 70 a 110 MB de memoria más un clip. No se escribe nada en el disco hasta que se
  desbloquea un logro.
- **Formato.** H.264 se reproduce en todas partes, Discord y los móviles incluidos. HEVC y AV1 producen archivos más pequeños.
  AV1 necesita una GeForce RTX 40, Radeon RX 7000, Intel Arc o posterior; sin el formato elegido, el clip
  se graba en H.264. Una tarjeta sin codificador H.264 por hardware usa el codificador por software de Windows, en el
  procesador, a 1080p y 30 FPS como máximo.
- **Fotogramas por segundo.** **Sin límite** graba a la frecuencia de actualización del monitor que muestra el juego y
  la sigue cuando cambia. Si el codificador rechaza una frecuencia, el grabador baja a 60 y luego a 30
  FPS, y lo registra. La estimación de tamaño supone el doble de la tasa de bits de 30 FPS para Sin límite.
- **Si el grabador deja de responder.** AW Next lo reinicia tras una espera que se duplica cada vez y
  se rinde con un juego tras cinco reinicios fallidos. Un clip cuya escritura falla a medias se conserva si lo
  escrito se reproduce y, si no, se elimina. Un clip que quedó a medio escribir por un PC que se apagó se limpia
  la próxima vez que se graba un juego.
- **HDR.** Con el HDR de Windows activado, los clips pasan por mapeo de tonos como las capturas HDR; **Capturas HDR** en
  **Desactivado** también se aplica a los clips.
- **Sonido.** **Solo el juego** deja fuera el chat de voz y la música. Si el sonido del juego no se puede grabar
  por separado, se graba todo el PC.
- **Qué se captura.** El monitor que muestra el juego, notificaciones incluidas. Un juego muy antiguo en pantalla completa
  exclusiva puede grabar fotogramas negros.

## Si una prueba o un desbloqueo no aparece {#if-a-test-or-unlock-does-not-appear}

1. Confirma que las notificaciones están activadas y lee la fila Notificaciones del panel
   **[Game Health](game-health.md)** del juego.
2. Comprueba que el rastreador en segundo plano se está ejecutando.
3. Para los overlays, selecciona un preset válido y prueba de nuevo fuera de un juego en pantalla completa exclusiva.
   **Automático** ya gestiona ambos casos.
4. Si un juego a pantalla completa o No molestar oculta las notificaciones de Windows, activa **Notificaciones
   prioritarias** y aprueba la solicitud única de Windows.
5. Revisa los ajustes de notificaciones de Windows para AW Next.
6. Abre **Ajustes → Avanzado → Diagnóstico** e inspecciona los registros.

Si el problema continúa, sigue con [Solución de problemas](troubleshooting.md#notifications-do-not-appear).

---

**Siguiente:** [Presets y el Diseñador de presets](presets.md) - el aspecto del popup y cómo crear el
tuyo.

<div align="center">

[← Documentación](README.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
