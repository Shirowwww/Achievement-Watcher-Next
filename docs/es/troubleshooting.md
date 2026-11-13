---
title: "Solución de problemas"
description: "Soluciones para juegos que faltan, progreso erróneo, notificaciones que no aparecen, tiempo de juego y avisos del antivirus o de SmartScreen."
---

# Solución de problemas

## Empieza aquí {#start-here}

Si el problema afecta a **un solo juego**, abre primero el panel **[Game Health](game-health.md)** de ese juego.
Indica si AW Next puede ver el juego, leer sus logros y anunciar sus desbloqueos, y
ofrece solo las reparaciones que se aplican. La mayoría de los problemas de un solo juego terminan ahí.

Usa el resto de esta página para los problemas que afectan a toda la aplicación. **Ajustes → Ayuda** tiene una
versión corta de las primeras comprobaciones en *Algo no funciona* (Game health y Solución de problemas), y su
línea *Tu configuración actual* muestra tu tema, el modo de notificación, el mando, el atajo del overlay y cuántas
fuentes están activadas. Para una duda antes de estar seguro de que es un error, pregunta en el
[servidor de Discord](https://discord.gg/DjTMrDsXTh). En un informe de error, incluye la versión de la aplicación, la versión de
Windows, la fuente implicada, los pasos exactos y los registros relevantes.

## En Linux {#on-linux}

La aplicación de Linux tiene problemas que esta página no cubre. El AppImage no arranca sin FUSE 2
(`libfuse2t64` en Ubuntu 24.04). El llavero solo pide su contraseña con el inicio de sesión automático. El
atajo del overlay en Wayland es uno que asignas en los ajustes de teclado de tu escritorio. Cada uno tiene su solución
en [Linux y Steam Deck](linux.md#install). El resto de esta página describe Windows; en Linux
los registros están en `~/.config/Achievement Watcher Next/logs`.

## Abrir los registros y los datos locales {#open-logs-and-local-data}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Ajustes - Avanzado, diagnóstico"></picture><br>
<sub>Versiones de la aplicación y del entorno de ejecución, y acceso rápido a los registros, los datos y las comprobaciones de actualización</sub>
</div>

La pestaña **Avanzado** existe solo en el modo Avanzado. Si no la ves, cambia el control **Interfaz**
de la parte superior de los **Ajustes** de Simple a Avanzado; no se pierde nada al volver (consulta
[getting-started.md](getting-started.md#simple-and-advanced)).

**Ajustes → Avanzado → Diagnóstico** abre el directorio de registros o de datos. La ruta de registros predeterminada es:

```text
%APPDATA%\Achievement Watcher Next\logs
```

Los archivos más útiles suelen ser `Achievement Watcher.log`, `renderer.log`, `parser.log` y los
registros del Watchdog de la fuente afectada. Un fallo que cruza el escaneo, la interfaz y las notificaciones necesita
varios de ellos, así que usa **Exportar registros (.zip)** en la misma tarjeta en lugar de copiar los archivos a mano:
los procesos que escriben los registros nunca se detienen, así que una copia manual puede pillar una línea a medio escribir. La
exportación funciona con la aplicación en marcha y añade un `about.txt` con las versiones de la aplicación, Electron, Node y Chrome.

El archivo está pensado para una incidencia pública, así que sus copias van enmascaradas: tu nombre de usuario de Windows en cada
ruta pasa a ser `[username]`, y las claves, los tokens y las contraseñas pasan a ser `[redacted]`, `[token]` o
`[apikey]`. Los registros de tu disco no cambian, y un archivo que no se puede enmascarar se deja fuera.
El enmascarado funciona con formas conocidas, así que lee los archivos antes de publicarlos; una carpeta de juego con tu nombre,
por ejemplo, se queda como está.

Los registros se amplían, nunca se truncan, así que un cierre inesperado sobrevive al siguiente inicio. Cada ejecución empieza con una
marca, seguida de un bloque `[diag]` con lo que necesita un informe de error: versiones, rutas de instalación y de datos,
cómo se inició la aplicación, el idioma y el tema, y la geometría de cada pantalla:

```text
===== session 2026-08-11T00:53:31.890Z pid=19276 =====
[diag] app: Achievement Watcher 3.10.0 (packaged)
[diag] runtime: electron 43.4.0 · chrome 150.0.7871.224 · node 24.18.1 · v8 15.0
[diag] display: 3056414223 1080x1920 @1x work=1080x1872 rotation=270
[diag] display: 3933707034 (primary) 2048x1152 @1.25x work=2048x1104 rotation=0
```

Pega ese bloque en una incidencia. Los problemas de tamaño y colocación de la ventana son casi siempre de escalado de pantalla
o de varios monitores, y las líneas `[MainWindow]` que siguen registran los límites y la pantalla de la ventana
cada vez que se muestra, se mueve, cambia de tamaño o se cierra.

Cada archivo de registro rota a `<name>.log.1` al superar 2 MB, así que se conserva una generación anterior.

## Falta un juego {#a-game-is-missing}

1. Abre **Ajustes → Fuentes** y confirma que la integración correspondiente está activada.
2. Abre **Ajustes → Carpetas**, ejecuta **Búsqueda inteligente** y usa después **Generar configuraciones** para un escaneo completo.
3. Añade a mano la biblioteca de juegos o la raíz de las partidas si usa una ubicación personalizada.
4. Desactiva **Mostrar solo los juegos instalados** para ver si el juego es conocido pero ya no se considera
   instalado.
5. Para las partidas de emuladores, inicia el juego una vez para que cree una carpeta de ejecución.

Si solo quedan restos de partidas antiguas y los archivos del juego han desaparecido, el filtro de solo instalados oculta
la entrada.

Un juego cuyos metadatos no se pudieron obtener se queda en la lista: lo que hay en el disco decide que un juego
existe, y la consulta en línea solo lo adorna. La entrada muestra el nombre que se conozca en local y
se completa en un escaneo posterior.

## Los logros siguen bloqueados o muestran 0 % {#achievements-stay-locked-or-show-0}

Sin archivo de desbloqueos de ejecución es 0 %, incluso con una lista de logros completa.

Abre el panel **[Game Health](game-health.md)** del juego: nombra la pieza que falta y ofrece la
reparación, ya sea reescribir los datos de logros, restaurar el archivo del emulador o corregir un
`steam_appid.txt` que nombra otro juego. Para comprobarlo a mano:

- verifica que el AppID o el ID de plataforma detectado pertenece al juego correcto;
- comprueba si hay una ruta de guardado personalizada;
- repara un esquema `steam_settings` que no coincide solo después de revisar el informe;
- si jugaste en otro PC, conecta esa cuenta de Steam: un juego sin nada que leer en local se lee entonces
  desde tu perfil de Steam, cuyos detalles del juego deben ser públicos. La respuesta se guarda en caché seis
  horas (consulta [Cuentas conectadas](sources.md#connected-accounts)).

Las partidas de emuladores de Steam pueden estar repartidas entre `%APPDATA%\GSE Saves` y
`%APPDATA%\Goldberg SteamEmu Saves` para el mismo juego. AW Next lee la que contiene los desbloqueos, así que no
hace falta que lo arregles a mano.

Un juego sin conjunto de logros no tiene barra de progreso en lugar de 0 % (o **Sin logros**, si
volviste a activar esa barra en **Ajustes → Apariencia → Recuadros de la biblioteca**) y se deja fuera de las
estadísticas de completado.

**Funciona desde el botón Jugar de AW Next pero no desde un acceso directo de Steam.** Un juego crackeado añadido a Steam
como juego que no es de Steam se inicia con un ID de juego propio, y GBE Fork lee ese ID antes que su
`steam_appid.txt`, de modo que los desbloqueos se guardan con el número del acceso directo y nunca llegan a la tarjeta del
juego. Steam pasa el ID real cuando un `steam_appid.txt` está en la carpeta de inicio del acceso directo (Iniciar
en); uno junto al ejecutable solamente no se lee. Game Health señala un acceso directo cuya carpeta de inicio
no lo tiene, y su reparación escribe allí el archivo.

**Un crack scene atiende el juego y nunca se registra nada.** Algunos cracks nunca informan de logros.
Tras una hora de juego sin nada registrado, Game Health lo dice y, cuando ese crack es el archivo de la biblioteca
de Steam del juego, ofrece instalar encima el emulador compatible y deshacerlo más tarde.

**Halo: Campaign Evolved y The Crew Motorfest no registran nada sin conexión.** Los servidores del editor
conceden sus logros, así que ningún crack ni emulador puede registrarlos. Su panel Game Health lo dice.

Consulta [Configuración de Goldberg y GBE Fork](emulator-setup.md#common-problems) o [Configuración de Goldberg Uplay R2](uplay-r2.md#achievements-remain-at-0) para los pasos propios de cada fuente.

## Se emparejó el juego equivocado {#the-wrong-game-was-matched}

Cuando el nombre de la carpeta de un juego coincide con varias versiones de Steam y el emparejamiento automático eligió la
equivocada, haz clic derecho en él y elige **Definir el AppID manualmente...**. El AppID que introduces se escribe en
`steam_appid.txt` y se recuerda para esa carpeta de instalación, de modo que las reparaciones posteriores lo usan; **Borrar el AppID manual**,
en el mismo menú, lo deshace. La reparación **Corregir el archivo de identificación del juego** de Game Health también pide
el AppID. Detalles: [Fijar a mano el AppID de un juego](advanced.md#set-a-games-appid-by-hand).

Una discrepancia no siempre es culpa del emulador. Si se configuró a propósito para el ID que hay en el disco, déjalo
como está.

## Faltan nombres, descripciones o arte {#names-descriptions-or-artwork-are-missing}

- Actualiza con conexión para que la aplicación pueda reintentar sus fuentes de metadatos.
- Confirma la identidad de plataforma del juego; un AppID de Steam equivocado puede devolver metadatos convincentes pero sin
  relación.
- Con Goldberg/GBE, un esquema local válido puede rellenar parte del texto que falta sin conexión.
- Usa las acciones de portada del juego para reintentar o elegir arte local cuando las fuentes automáticas fallan.

Una tarjeta titulada solo con su AppID de Steam significa que la búsqueda del nombre volvió vacía mientras el arte,
que sale solo del AppID, se resolvió. El siguiente escaneo sustituye el número cuando la búsqueda
tiene éxito.

Los logros de DLC y de actualizaciones muestran su grupo de pertenencia bajo el título (por ejemplo una etiqueta «Hearts of
Stone»), a partir de los conjuntos de logros propios de Steam o, en un juego que no los tiene, de SteamHunters.

Las descripciones de logros ocultos siguen ocultas cuando todas las fuentes disponibles las omiten.

## Una actualización del juego añadió logros que no aparecen {#a-game-update-added-achievements-that-arent-showing-up}

Un esquema en caché se vuelve a comprobar solo con Steam cada 3 días, ya que Steam nunca anuncia los nuevos
logros. Para recogerlos de inmediato, usa **Ajustes → Avanzado → Revisar de nuevo las listas de logros**, que
funciona incluso con **Actualizaciones automáticas de los datos de logros** desactivado. Ese interruptor, también en Ajustes →
Avanzado, solo detiene la comprobación periódica y la reparación de descripciones en blanco. Ninguna de las dos comprobaciones elimina
logros ni desbloqueos existentes. Desactívalo solo si mantienes `steam_cache` a mano.

## Una actualización se atasca en el mismo archivo {#an-update-is-stuck-on-the-same-file}

Los archivos de actualización descargados se conservan entre ejecuciones. Si una descarga falla una y otra vez con el mismo archivo, usa
**Ajustes → Avanzado → Vaciar cachés** y busca actualizaciones de nuevo. Solo se borran las cachés que se pueden volver a descargar;
los ajustes, los datos de juego y los registros se quedan.

Las actualizaciones normalmente descargan solo la parte del instalador que cambió y recurren por sí solas al instalador
completo si eso falla.

AW Next anuncia una versión nueva con una notificación de Windows y un indicador en la barra de título, y hacer clic en
cualquiera de los dos abre la ventana de actualización, que lista las notas de versión de cada versión que omitiste. El
aviso permanece hasta que lo cierres y vuelve después de una partida, nunca durante una. El icono de la bandeja lleva mientras tanto un
punto azul. **Ajustes → Buscar actualizaciones** abre la ventana de inmediato.

**Actualización rechazada.** Cada actualización se comprueba con el certificado de firma fijado del proyecto antes de
instalarse, no con una firma cualquiera ni con el SHA-512 publicado junto a ella, ya que ambos proceden de
la misma versión. Un rechazo casi siempre significa que el archivo descargado fue manipulado o se corrompió:
vacía las cachés como arriba y descarga de nuevo desde la
[página oficial de Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases).

## Las notificaciones no aparecen {#notifications-do-not-appear}

1. Confirma que el rastreador en segundo plano se está ejecutando.
2. Abre el juego y lee la fila Notificaciones de su panel **Game Health**: nombra el canal
   que entregó la última notificación de ese juego y por qué.
3. Usa las pruebas normal, rara y de overlay en **Ajustes → Notificación**.
4. Confirma el modo de entrega y el preset seleccionado. En **Automático**, que falte el popup del overlay suele ser
   la alternativa prevista: consulta [Notificaciones](notifications.md#how-automatic-decides).
5. Revisa los permisos de notificación de Windows para AW Next.
6. Si el problema ocurre solo mientras juegas o a pantalla completa, activa **Notificaciones prioritarias** en
   **Ajustes → Notificación** y acepta la solicitud de permiso de Windows.
7. Prueba el overlay fuera de la pantalla completa exclusiva.
8. Revisa los registros justo después de una prueba o un desbloqueo fallidos.

Si la biblioteca se actualiza pero no aparece ninguna notificación, el problema es el canal de notificación. Si la
biblioteca tampoco cambia, diagnostica primero la fuente o la ruta de las partidas.

## La fuente de navegador de OBS sigue vacía {#the-obs-browser-source-stays-empty}

1. Pulsa **Vista previa** en **Ajustes → Notificación → Fuente de navegador de OBS**, o abre
   `http://127.0.0.1:8082/obs/?test=1`. Una tarjeta de ejemplo cada diez segundos significa que la página y el canal
   funcionan, y que el problema está en los ajustes de la fuente en OBS.
2. Nada en absoluto, ni siquiera una página en blanco: otra copia de AW Next, u otro programa, ocupa el puerto
   8082. Solo la copia que arrancó primero sirve la dirección.
3. Una página en blanco es normal entre desbloqueos. Usa `?test=1` para verla dibujar.
4. Comprueba que **Websocket @localhost:8082** está activado en **Ajustes → Notificación → Transporte**: la
   fuente lee ese canal.
5. La tarjeta llena el tamaño que tenga la fuente. Si se ve borrosa, dale más píxeles a la fuente y
   colócala más pequeña en la escena.

Consulta [Mostrar los desbloqueos en el stream (OBS)](notifications.md#show-unlocks-on-stream-obs) para la configuración completa.

## Un juego no arranca desde el botón Jugar {#a-game-will-not-start-from-the-play-button}

Algunos juegos necesitan derechos de administrador, porque su manifiesto o su lanzador los pide. Windows
se niega a iniciarlos como AW Next inicia normalmente un juego e informa de `EACCES`.

AW Next lo reintenta entonces a través del shell de Windows, que muestra el aviso habitual de UAC, de modo que el juego
arranca cuando confirmas. Si también se rechaza eso, AW Next ofrece reintentar como administrador. Solo se eleva el
juego, ya que un AW Next elevado crearía archivos que tu cuenta normal no podría reescribir.
Descartar el aviso de UAC se trata como una decisión, no como un error.

## No se registra el tiempo de juego {#playtime-is-not-tracked}

AW Next sigue el ejecutable del juego configurado y la vida de su proceso. Si en su lugar arranca un lanzador, un ayudante o un
binario con otro nombre:

- haz clic derecho en el juego y abre su configuración;
- selecciona el ejecutable que sigue activo mientras juegas;
- evita los procesos de lanzador y de gestión de cierres inesperados;
- reinicia el juego tras guardar.

Un juego de Java que arranca mediante `javaw.exe` y cuyo lanzador termina se rastrea automáticamente a través de ese
proceso de Java.

Para corregir un total que ya es erróneo, usa **Logros y tiempo de juego → Editar tiempo de juego…** (consulta
[Editar el tiempo de juego de un juego](advanced.md#editing-a-games-playtime)).

## Los trofeos de PlayStation no se importan {#playstation-trophies-do-not-import}

- *La sesión de PlayStation ha caducado*: vuelve a conectar la cuenta en **Ajustes → Fuentes**.
- *PlayStation pide que vayas más despacio* o *En pausa por PlayStation*: Sony limita la frecuencia de las solicitudes. Importa
  de nuevo dentro de unos minutos y continúa donde se quedó.
- *Aún no hay lista de trofeos en esta cuenta*: la cuenta no tiene ninguna lista de trofeos que importar.

## Un juego de Epic con Nemirtingas no registra nada {#a-nemirtingas-epic-game-records-nothing}

Cuando la carpeta de un juego contiene el emulador (su biblioteca `EOSSDK` con un
`nepice_settings\NemirtingasEpicEmu.json` al lado), la pestaña **Game health** del juego muestra una fila
**Emulador de Epic**:

- **SavePath debe ser `"appdata"`.** El emulador escribe los logros en
  `%APPDATA%\NemirtingasEpicEmu`, donde AW Next los lee, solo con ese valor; cualquier otro los mantiene
  en la carpeta del juego. La fila avisa cuando está fijado a otra cosa.
- **Algunos juegos necesitan los argumentos de inicio de Epic.** Algunos juegos de EOS inician sesión en el emulador, y por tanto guardan
  un logro, solo cuando un lanzador pasa `-epicapp=...` y los demás. Mientras el emulador no haya
  guardado nada, la fila ofrece **Añadir los argumentos de inicio de Epic**, que los escribe en los ajustes de inicio del juego
  a partir del `AppId` de la configuración. Un `.bat` que los pase también sirve.
- Si el juego se cierra al arrancar con el emulador instalado, desactiva su plugin de overlay
  (`"Plugins": { "Overlay": { "Enabled": false } }`); la fila te lo recuerda mientras esté activado.

## Ubisoft o Uplay R2 usa la acción equivocada {#ubisoft-or-uplay-r2-uses-the-wrong-action}

Los juegos de Ubisoft deben recibir metadatos de Ubisoft y la reparación de Uplay R2, no la acción GBE de Steam. Ejecuta un
nuevo escaneo de carpetas y comprueba el icono de la fuente. Si el juego sigue mal identificado, adjunta `parser.log`,
la fuente y los ID mostrados, y el nombre del directorio del juego a un informe.

## Aviso del antivirus o de SmartScreen {#antivirus-or-smartscreen-warning}

Las versiones empaquetadas se firman con el certificado propio del proyecto, fijado por su huella exacta, no
emitido por una autoridad de confianza pública, así que Windows SmartScreen puede avisar igualmente. Nunca necesitas
instalar el certificado. Antes de instalar una actualización, AW Next comprueba que está firmada, que el
firmante es `CN=Shirow`, que la huella coincide con una de las dos que la aplicación tiene fijadas y que el
archivo no se modificó tras la firma. El SHA-512 publicado con una versión no puede sustituir esa comprobación,
ya que ambos se sustituirían juntos. Las DLL opcionales de emuladores también pueden provocar detecciones heurísticas.
Descarga solo desde la
[página oficial de Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases) y compara
el instalador con el SHA-512 del `latest.yml` correspondiente como segunda comprobación.

No desactives la protección de todo el sistema. Informa de un archivo puesto en cuarentena de la versión oficial al
fabricante del antivirus como falso positivo.

### Comprobar una versión por ti mismo {#checking-a-release-yourself}

Cada instalador publicado se puede buscar en VirusTotal por su SHA-256:

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.12.7.exe" -Algorithm SHA256
```

Abre `https://www.virustotal.com/gui/file/<the hash it prints>`. Si el archivo es el publicado,
el informe ya está ahí. Para la versión actual es
[el instalador 3.12.7](https://www.virustotal.com/gui/file/fb836d9224e789f3095243771266457fca1cb0cee367724e9c9b3c370f4e260d)
(`fb836d9224e789f3095243771266457fca1cb0cee367724e9c9b3c370f4e260d`).

El resultado lista lo que opina cada motor. Un puñado de detecciones heurísticas en una compilación que incluye
archivos de emuladores es el falso positivo que se describe a continuación. Lo que importa es que el hash coincida con el archivo
que publicó la página de versiones.

### Los archivos del emulador aparecen marcados {#the-emulator-files-are-flagged}

Esta es la detección con la que la gente se topa de verdad, y es un falso positivo. Registrar logros de un
juego sin cliente de tienda en ejecución significa colocar a su lado una biblioteca sustituta: el emulador de Steam (GBE
Fork) o un cargador de Ubisoft. Los motores de detección vigilan justo eso, así que marcan lo que el archivo
*hace*, no lo que contiene. Windows Defender pone en cuarentena de golpe todas las copias que ve: en la carpeta
del juego, instaladas con AW Next y en su caché.

**Cuándo se dispara.** En el momento en que se escribe un archivo, y solo entonces:

| Lo que hiciste | Lo que se escribe |
|---|---|
| Ejecutaste una reparación, desde el menú de un juego o desde los Ajustes | el emulador o el cargador, en la carpeta de ese juego |
| Abriste **Ajustes → Emuladores → Ubisoft / Uplay R1/R2** | los cargadores incluidos, en la propia caché de AW Next |
| Activaste **Arreglar automáticamente los juegos recién detectados** | lo mismo, durante un escaneo, para cada juego que lo necesita |

Iniciar AW Next no escribe ninguno. La reparación automática está desactivada salvo que la actives, y te avisa
antes, con la posibilidad de añadir primero una exclusión en Defender. Si ya estaba activada, el mismo
aviso aparece una vez, antes de la primera escritura, con la exclusión y el interruptor de desactivación en el cuadro de diálogo.
No se escribe nada mientras la ventana está oculta en la bandeja.

**Qué hace AW Next al respecto.** Una cuarentena se notifica como un problema del antivirus, con un botón para
permitir la carpeta en Windows Defender y otro para devolver los archivos retirados. **Ajustes →
Emuladores → Ubisoft / Uplay R1/R2 → Restaurar DLL integradas** los restaura en cualquier momento.

**Qué hacer.** Permite el archivo que nombró tu antivirus, o excluye
`%APPDATA%\Achievement Watcher Next\cache`. Eso protege las copias propias de AW Next; la copia de la carpeta de un
juego aún puede aparecer marcada, así que excluye también esa carpeta si sigue ocurriendo. Informar del falso
positivo a tu fabricante lo arregla para todo el mundo.

Windows Defender llama al archivo de GBE Fork `Trojan:Win32/Suschil!rfn` mientras AW Next lo descarga en
su caché. Es el mismo falso positivo: permítelo, o excluye la carpeta de la caché, y vuelve a ejecutar
el arreglo.

**Para comprobar antes.** Ambos son de terceros y de código abierto: el emulador de Steam procede de las
[versiones oficiales de GSE Fork](https://github.com/Detanup01/gbe_fork), y los cargadores de Ubisoft se incluyen en
`app/resources/uplayR1/` y `app/resources/uplayR2/` del repositorio. AW Next verifica los incluidos
con resúmenes SHA-256 conocidos, su arquitectura PE y su capacidad para gestionar logros antes de que cualquier
reparación los use, y rechaza un archivo que no pase.

### Un antivirus reacciona mientras AW Next se ejecuta {#an-antivirus-reacts-while-aw-next-runs}

Los motores de comportamiento (System Watcher de Kaspersky, Advanced Threat Defense de Bitdefender) juzgan lo que hace un
programa, no lo que contiene. AW Next no inicia PowerShell para las notificaciones de Windows, los sonidos de los
toasts ni la comprobación de la firma de las actualizaciones, y no compila código en `%TEMP%`: las capturas de pantalla usan el
ayudante nativo que se incluye con la aplicación, y la comprobación de notificaciones llama a Windows directamente.

Si tu antivirus reacciona igualmente, anota el nombre exacto de la detección e informa del archivo que nombra como falso
positivo. En Kaspersky es [opentip.kaspersky.com](https://opentip.kaspersky.com): busca el archivo
por su hash y después **Submit to reanalyze**.

## La ventana no se abre {#the-window-does-not-open}

- Usa el icono de la bandeja (en el área de notificación) por si la aplicación arrancó oculta.
- Termina un proceso de AW Next atascado y vuelve a iniciarlo.
- Quita `ELECTRON_RUN_AS_NODE` del entorno si se fijó para desarrollo; hace que
  Electron arranque como Node a secas.
- Revisa `renderer.log` y el registro principal de la aplicación para ver el primer error.
- Prueba **Ajustes → General → Desactivar la aceleración por hardware** si la interfaz sigue visible el tiempo suficiente para
  cambiarlo.

## Empezar con un perfil nuevo {#start-with-a-fresh-profile}

Úsalo solo después de hacer una copia de los datos que quieras conservar:

1. Sal de AW Next por completo desde la bandeja.
2. Renombra `%APPDATA%\Achievement Watcher Next` a `Achievement Watcher Next.backup`.
3. Inicia la aplicación y reproduce el problema con el perfil nuevo.

Si el problema desaparece, restaura solo los datos que necesites o adjunta los archivos de configuración relevantes al
informe. Renombrar deja una vía de vuelta; borrar, no.

## Informar del problema {#report-the-problem}

Busca primero entre las [incidencias existentes](https://github.com/Shirowwww/Achievement-Watcher-Next/issues). Si
ninguna coincide, abre un error con la plantilla del repositorio y adjunta los registros después de quitar todo lo que no
quieras compartir públicamente.

---

**Consulta también:** [FAQ](faq.md) para respuestas cortas · [Herramientas avanzadas](advanced.md) para mantenimiento,
vaciado de cachés y restablecimientos · [Game Health](game-health.md) para problemas de un solo juego.

El camino del usuario termina aquí. La documentación pasa después a ser técnica:
la [referencia de Goldberg/GBE](../goldberg-gbe.md) para formatos de archivo y reglas de detección, y
[Architecture](../architecture.md) para los límites entre aplicación / renderizador / Watchdog.

<div align="center">

[← Documentación](README.md) · [Primeros pasos](getting-started.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
