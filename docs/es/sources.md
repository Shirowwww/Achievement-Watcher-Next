---
title: "Fuentes compatibles"
description: "Todas las fuentes de juegos que lee Achievement Watcher Next - Steam, GOG, Epic, Ubisoft, EA, Xbox PC, emuladores y RetroAchievements - y lo que necesita cada una."
---

# Fuentes compatibles

Una **fuente** es un lugar del que AW Next lee logros: los datos locales de un lanzador, un archivo de partida
compatible con Steam o el archivo de trofeos de un emulador de consola. Cada fuente tiene su propio interruptor en **Ajustes →
Fuentes**.

AW Next lee Steam, GOG Galaxy, Ubisoft Connect, Epic Games, Xbox PC, el registro local de logros de EA Desktop,
RetroAchievements, los emuladores de consola y los archivos de partida de emuladores de Steam como Goldberg, GBE
Fork, CODEX, RUNE y CPY. No necesita clave de la API web de Steam ni ninguna cuenta.

<div align="center">
<picture><source srcset="../assets/shot/sources-panel-800.webp 800w, ../assets/shot/sources-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/sources-panel.png" width="720" height="529" alt="Ajustes - Fuentes de juegos"></picture><br>
<sub>Cada fuente es un interruptor aparte; el escudo marca las bibliotecas oficiales de escritorio</sub>
</div>

Tras activar una fuente, actualiza la biblioteca. Solo se muestran las bibliotecas detectadas en este PC.

## Bibliotecas oficiales de las plataformas {#official-platform-libraries}

Estas leen los datos locales del propio lanzador y llevan un escudo en los Ajustes.

| Fuente | Lo que lee AW Next | Lo que necesita |
|---|---|---|
| **Steam** | El estado local del appcache, los datos del perfil público, los esquemas de logros y los metadatos de los productos | Steam instalado; conectar una cuenta es opcional |
| **GOG Galaxy** | Las bases de datos locales del cliente Galaxy, además de partidas antiguas compatibles y UniverseLAN | GOG Galaxy instalado, o un juego con UniverseLAN |
| **Ubisoft Connect** | Datos locales nativos y formatos antiguos de Uplay | Ubisoft Connect instalado |
| **Epic Games** | Las instalaciones locales, además de los juegos que posee la cuenta y su estado oficial de logros una vez conectada | El lanzador de Epic Games para las instalaciones locales; una conexión de cuenta para el resto |
| **Xbox PC** | Las instalaciones locales de Game Pass y Microsoft Store, además de los juegos que posee la cuenta y su estado en Xbox Network | La aplicación de Xbox para las instalaciones locales; una conexión de cuenta para el resto |
| **Rockstar Games Launcher** | Los juegos que ha instalado, con la lista de logros de su versión de Steam y su estado de desbloqueo una vez conectada la cuenta | El Rockstar Games Launcher instalado; una conexión de cuenta para los desbloqueos |

**Steam**, **Epic Games** y **Xbox PC** tienen cada uno tres opciones: **Ninguno**, **Instalados** (los juegos de
este PC) o **En propiedad** (toda la biblioteca que posee la cuenta). **En propiedad** lista también juegos que no están
instalados aquí y necesita la conexión de cuenta que se describe abajo. **GOG Galaxy** ofrece **Ninguno**, **Instalados**
o **Jugados**: Galaxy conserva los datos de juego de un título tras desinstalarlo, y **Jugados** sigue
listando esos juegos.

Las **Bibliotecas de Steam**, bajo la tarjeta de la cuenta de Steam, listan cada carpeta de biblioteca de Steam de este PC. Si desactivas
una, sus juegos salen de la lista, incluido Todos los juegos, por ejemplo con una unidad que dejas conectada como
almacenamiento. Vuelven cuando la activas de nuevo.

> [!NOTE]
> Los desbloqueos de Steam se leen de las estadísticas que Steam guarda en este PC. Un perfil privado, o unos **Detalles
> del juego** privados, funcionan con todos los juegos jugados aquí, incluidos los añadidos con SteamTools, LuaTools o
> GreenLuma, y una tarjeta se actualiza en el momento en que Steam registra un desbloqueo. Un perfil público solo añade tu
> nombre y avatar. Los juegos jugados solo en otro PC necesitan la conexión de cuenta que se describe abajo. Estos desbloqueos
> generan una notificación de AW Next cuando **Juegos del cliente de Steam** está activado en Notificación (consulta
> [Notificaciones](notifications.md#games-steam-runs)).

> [!NOTE]
> **EA Desktop** es distinto: lee el registro local de logros de EA Desktop de los juegos que están fuera de las carpetas
> gestionadas por EA, y no importa tu biblioteca habitual de EA.

> [!NOTE]
> Los juegos del **Rockstar Games Launcher** muestran todos los logros bloqueados hasta que conectes tu cuenta de Rockstar Games. Social Club guarda cuáles has desbloqueado en un archivo cifrado con la clave de tu cuenta, así que AW Next se lo pregunta a Rockstar.

### Cuentas conectadas {#connected-accounts}

Steam, Epic, Xbox PC, PlayStation y Rockstar Games se pueden conectar desde los Ajustes para leer lo que los archivos locales
no contienen. Cada token se cifra antes de guardarse en este PC, y todo lo demás funciona
sin ninguna cuenta.

| Cuenta | Qué añade la conexión |
|---|---|
| **Steam** | Dos interruptores, desactivados por defecto y visibles mientras la fuente Steam está en **En propiedad**: **añadir los juegos que posees** y **añadir los juegos compartidos contigo mediante Steam Family**. Permiten que un perfil privado, o uno que nunca instaló aquí la mayor parte de su biblioteca, liste los juegos correctos. Cada uno alarga notablemente el primer escaneo, porque cada juego añadido resuelve sus logros y su arte una vez. Un juego sin nada que leer en local se lee entonces desde tu perfil de Steam, que necesita sus detalles del juego públicos; la respuesta se guarda en caché seis horas. **Ocultar los juegos que ya no están en tu biblioteca de Steam** elimina los restos, pero nunca un juego instalado aquí ni compartido mediante Steam Family. Inicias sesión en la propia página de Valve. |
| **Epic Games** | Tus logros desbloqueados y, con **En propiedad**, toda la biblioteca: cada juego con su lista completa, estado de desbloqueo y rareza. Algunos juegos en propiedad tienen logros que los datos de la tienda de Epic nunca listan (Shadow of the Tomb Raider, Civilization VI). Aun así se listan, a partir de games-infos-datas de Nemirtingas, pero sin estado de desbloqueo, que Epic no comparte ni con la sesión iniciada. Los nombres, descripciones y rareza de un juego instalado funcionan sin cuenta. |
| **Xbox PC** | Estado de desbloqueo y rareza desde Xbox Network para tu biblioteca, guardados en caché en local. Con **En propiedad** también trae los juegos que la cuenta solo ha jugado en otro sitio. |
| **PlayStation** | Tus juegos y trofeos de PlayStation, con la tasa propia de Sony para cada trofeo, actualizados cada tres días en segundo plano. Un juego que no posees se puede añadir por su nombre desde el catálogo de Sony y quitar del mismo modo. Un juego de cualquier otra fuente que también salió en PlayStation muestra el platino real de su lista y, en el modo trofeos, sus grados y grupos de DLC reales (consulta [Notificaciones](notifications.md#trophy-mode)). Inicias sesión en la propia página de Sony. |
| **Rockstar Games** | El estado y las fechas de desbloqueo de los juegos que instaló el Rockstar Games Launcher. Rockstar numera sus logros, y AW Next les pone nombre con la lista que el launcher guarda en `Documents\Rockstar Games\Social Club\Titles`: un juego cuya lista falta ahí se queda todo bloqueado. Comprobado en GTA V, en sus dos ediciones. Inicias sesión en la propia página de Rockstar, y la sesión que deja se guarda cifrada para renovar el token. |

Un recuadro lleva una pequeña insignia por lo que estableció la conexión: comprado en esa tienda, compartido mediante
Steam Family o ya no está en tu biblioteca.

## Partidas guardadas compatibles con Steam {#steam-compatible-saves}

AW Next lee los archivos de logros y estadísticas que escriben los emuladores de Steam (`achievements.json`,
`achievements.ini`, `achievements.bin`, `stats.ini` y estructuras compatibles) en los lugares que usan esas
herramientas. Eso abarca **Goldberg** y **GBE Fork** (que AW Next también puede instalar y reparar),
**GreenLuma**, **LumaPlay**, **SmartSteamEmu**, **CreamAPI**, los emuladores **Nemirtingas** y las versiones
scene con una estructura compatible. Para un juego cuyos archivos están en otro sitio, añade la carpeta en
**Ajustes → Carpetas**.

<div align="center">
<picture><source srcset="../assets/shot/folders-panel-800.webp 800w, ../assets/shot/folders-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/folders-panel.png" width="720" height="529" alt="Ajustes - Carpetas" loading="lazy" decoding="async"></picture><br>
<sub>Las carpetas que AW Next comprueba por su cuenta y las que añades - partidas de un juego o bibliotecas enteras</sub>
</div>

Una versión portable de CODEX, RUNE o CPY normalmente escribe en `%PUBLIC%\Documents\Steam\<SOURCE>\<appid>`,
pero una copia portable guarda ese árbol dentro de la carpeta del juego, donde nada lo busca. Basta con añadir la
carpeta del propio juego en **Ajustes → Carpetas**: su `steam_emu.ini` (o `cpy.ini`) indica el
AppID, y el árbol de partidas se busca a su lado antes que en la ubicación compartida. Un juego sin partida
guardada se añade igualmente, al 0 %.

También funciona una versión sin configuración de emulador, o cuyo ini hayas borrado: el árbol de partidas se lee directamente,
ya que `Steam\RUNE\<appid>` lleva el AppID en el nombre de su carpeta. Las mismas estructuras se comprueban un nivel
por debajo de la carpeta que añades, así que puedes apuntar AW a una biblioteca de juegos entera.

Cuando una carpeta no se puede usar, AW dice por qué: contiene un juego pero ningún archivo de desbloqueos legible, no contiene
nada relacionado con logros, o es una versión de **EA app**. Las versiones de EA app guardan los logros en la
cuenta de EA, no en el disco, así que se leen mediante la fuente de EA y ninguna carpeta que añadas puede hacer que
aparezcan. El mensaje también dice cuántas estructuras se comprobaron, lo que distingue «no se encontró nada» de «no se
miró».

Tres casos tienen su propio tratamiento:

- **Goldberg SocialClub**: la variante de Rockstar y Social Club, con su propio interruptor.
- **RUNE Ubisoft Connect**: el emulador de Ubisoft de RUNE guarda archivos `achievements.cfg` en
  `Documents\RUNE\Ubisoft Connect\achievements`. Se encuentran sin añadir una carpeta (añadir una
  carpeta `RUNE\Ubisoft Connect` en **Ajustes → Carpetas** también funciona) y siguen el interruptor del emulador de
  Ubisoft Connect. Los nombres y los iconos salen de la lista de Ubisoft Connect para el juego; sin ella
  solo se ven los números de los logros.
- **Uplay R2**: el equivalente de Ubisoft de la vía Goldberg, para títulos compatibles. No tiene interruptor
  propio: las partidas pasan por la fuente de emulador de Steam, y sus herramientas de reparación y de cargador están en
  **Ajustes → Emuladores → Ubisoft / Uplay R1/R2**. Consulta [Configuración de Uplay R2](uplay-r2.md).

Si un juego que usa alguno de estos no muestra logros, su panel **Game Health** indica la pieza que falta.
Consulta [Game Health](game-health.md) y [Configuración de Goldberg / GBE](emulator-setup.md).

## Emuladores de consola {#console-emulators}

| Emulador | Consola | Archivo de trofeos / logros |
|---|---|---|
| **RPCS3** | PlayStation 3 | `TROPUSR.DAT` junto a la lista de trofeos |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`, que contiene la lista y el estado conseguido |
| **KytyPS5** | PlayStation 5 | `_Trophies\<title>\trophies_*.json` junto al emulador; la lista sale del paquete `sce_sys\trophy2` del juego |
| **Xenia** | Xbox 360 | `.gpd`, que también contiene ambos |

Cada uno se vigila en directo, así que un desbloqueo genera una notificación como cualquier otro. RPCS3, ShadPS4 y Xenia pueden
mover sus datos fuera de la ruta predeterminada, y AW Next lee los ajustes que lee el emulador:

- **RPCS3**: la carpeta de trofeos sigue `vfs.yml` (incluida una redirección relativa a `$(EmulatorDir)`), una
  carpeta `portable` junto al ejecutable y `RPCS3_CONFIG_DIR`.
- **ShadPS4**: se reconoce tanto si apuntas al emulador, a su carpeta `user`, a `game_data` mismo o
  (desde la 0.19) a su carpeta `trophy` o `home\<user>\trophy`. Su configuración se lee en cualquiera de los dos sitios
  donde shadPS4 la ha guardado.
- **Xenia**: sigue `storage_root` y `content_root` de su configuración.
- **KytyPS5**: se reconoce tanto si apuntas al emulador, a su carpeta `_Trophies` o a la carpeta de un solo
  juego. Los juegos se buscan en las carpetas de juegos del lanzador de KytyPS5 (`Kyty.ini`) y junto al
  emulador, descomprimidos o como archivo `.zar`. La lista de trofeos está en el propio juego, así que un juego
  borrado después de que AW Next lo viera sigue listado como no instalado, a partir de la copia de su lista y su arte guardada
  entonces. Un juego del lanzador se lista antes de su primer trofeo. Solo cuenta el usuario activo: el definido
  para el juego en el lanzador o, si no, el usuario global del emulador. Sin ningún ajuste de usuario, se añaden los trofeos
  de todos los usuarios.

Así, un disco virtual de RPCS3 reubicado o una carpeta de datos de ShadPS4 se puede añadir directamente en **Ajustes → Carpetas**,
sin ningún ejecutable del emulador a mano.

## RetroAchievements {#retroachievements}

Los juegos jugados en cualquier emulador que informe a RetroAchievements vienen de tu cuenta, no de un
archivo. Activa la fuente **RetroAchievements** y rellena la tarjeta de la cuenta que hay debajo: tu nombre de usuario
y la **Clave Web API** de retroachievements.org/settings. La clave se cifra antes de guardarse
en este PC.

<div align="center">
<picture><source srcset="../assets/shot/retroachievements-panel-800.webp 800w, ../assets/shot/retroachievements-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/retroachievements-panel.png" width="720" height="529" alt="Ajustes, Fuentes: el interruptor de RetroAchievements sobre las tarjetas de cuenta" loading="lazy" decoding="async"></picture><br>
<sub>El interruptor de RetroAchievements, con las tarjetas de cuenta de Epic y Steam debajo</sub>
</div>

**Importar biblioteca** añade todos los juegos que has jugado, con sus logros, fechas de desbloqueo, puntos y rareza.
Una segunda importación solo trae los juegos cuyo progreso cambió, y un juego jugado por primera vez se
añade solo. Los nuevos desbloqueos se anuncian en segundos mientras se ejecuta un emulador que informa a
RetroAchievements (RetroArch, DuckStation, PCSX2, PPSSPP, Dolphin, BizHawk, Project64 o cualquier
otra compilación con RA integrado, reconocida por el nombre o por la dll de RetroAchievements que lleva al lado), y en unos
pocos minutos en los demás casos.

AW Next lee los desbloqueos de retroachievements.org, así que RetroAchievements debe seguir activado en el emulador:
si lo desactivas allí, los desbloqueos dejan de enviarse. Para ver solo la notificación de AW Next, oculta la ventana
emergente del propio emulador. En RetroArch es **Settings → Achievements → Visibility → Unlock
Notifications**. RetroBat reescribe `retroarch.cfg` en cada inicio, así que cierra RetroBat y añade esta línea
a `RetroBat\emulationstation\.emulationstation\es_settings.cfg`:

```xml
<string name="global.retroarch.cheevos_visibility_unlock" value="false" />
```

Usa `cheevos_visibility_mastery` de la misma forma para la ventana emergente de maestría.

## Otras fuentes {#other-sources}

| Fuente | Qué es |
|---|---|
| **Juegos de Xbox 360 recompilados para PC** | Las adaptaciones de ReXGlue y similares guardan su lista de logros en una carpeta `achievements` (`.toml`, `.tsv`) o en `SaveData\Achievements.json`, en la carpeta del juego o en `Documents\<game>`. La lista sale del `default.xex` del propio juego, en todos los idiomas que incluye, y los logros secretos siguen siendo secretos. [dbox.tools](https://dbox.tools) añade los logros de DLC y Exophase el porcentaje de jugadores por logro. Una lista en `Documents` se encuentra sola; para una en la carpeta del juego, la **Búsqueda inteligente** encuentra una adaptación conocida en tus bibliotecas de juegos por su ejecutable, antes de su primer logro; en cualquier otro sitio, añade esa carpeta en **Ajustes → Carpetas**. Los desbloqueos se notifican en directo, se registra el tiempo de juego y Restablecer los logros funciona. Más de ochenta adaptaciones conocidas (Sonic Unleashed, Sonic the Hedgehog hasta Marathon Recompiled, Blue Dragon re:Blue, Lost Odyssey, Perfect Dark Zero, Fable II, Gears of War 2, Forza Motorsport 4, GoldenEye 007, Skate 2, Marvel Ultimate Alliance, Eternal Sonata, la colección Trials y otras) se listan a partir de su ejecutable antes de su primer logro. Una adaptación que guarda una lista por perfil cuenta como un solo juego. La fuente sigue el interruptor de Xenia. |
| **Juegos de PS4 adaptados a PC** | Bloodborne, la colección Uncharted (una entrada por juego), God of War III Remastered, MediEvil y otras adaptaciones construidas sobre el ejecutor `run.py`. También adaptaciones sin él (Dragon's Crown Pro, inFAMOUS Second Son y First Light, The Last Guardian, Gravity Rush 2, Killzone Shadow Fall, Driveclub, Unicorn Overlord, Fist of the North Star: Lost Paradise, UFC 3, PROTOTYPE y PROTOTYPE 2 con una entrada cada uno, los juegos UFC de PORTHEON), adaptaciones sobre el entorno de BilalReloaded, como su adaptación de la Nathan Drake Collection, Odin Sphere Leifthrasir y 13 Sentinels: Aegis Rim, ReCasted (Ratchet & Clank, cuyo `trophies\trophies.log` está en su propia carpeta y cuyo platino se concede cuando están los otros 46 trofeos), y adaptaciones que escriben su propia lista, como Crash Team Racing Nitro-Fueled. La **Búsqueda inteligente** encuentra una adaptación en tus bibliotecas de juegos por sus propios archivos (`run.py`, `trophy.key`, `rcps4-probe.exe` de ReCasted) y entre los juegos que instaló Quiver Launcher; en cualquier otro sitio, añade la carpeta de la adaptación en **Ajustes → Carpetas**. La lista de trofeos, los grados y los iconos salen del volcado del juego original al que apunta el lanzador de la adaptación (`sce_sys\trophy`, incluso con un `npbind.dat` cifrado), o del `user\trophies\<title id>\trophies.tsv` de la propia adaptación. Los desbloqueos salen de cualquiera de `trophies.log`, `last_run.log`, `analysis\<name>-user\trophy\trophyNN.txt`, `progress_user<N>.txt`, `<title id>-user<N>.bin`, `trophies.dat` o `unlocked.txt` que escriba la adaptación, con todos los perfiles combinados, y se notifican en directo. La rareza sale de las listas de PS4 de Exophase. Su interruptor es **PS4 Recomp**. |
| **Games for Windows LIVE** | Instalaciones de XLiveLessNess. Se leen los registros de desbloqueo de cada perfil, y la lista, sus textos y sus iconos salen del propio ejecutable del juego, así que no se descarga nada. Los logros de DLC salen del `spa.bin` de cada paquete de contenido en la carpeta `dlc\<title id>` de XLiveLessNess. Se vigila en directo. |
| **Dead Space 2 MarkerPatch, Alice: Madness Returns MadnessPatch** | Una copia de Steam con el mod instalado se encuentra sola. Para cualquier otra copia, añade la carpeta del juego en **Ajustes → Carpetas** (una carpeta dentro de ella, como `Binaries\Win32`, cuenta como la carpeta del juego) o deja que la **Búsqueda inteligente** recorra tus bibliotecas. La lista se construye a partir de los textos e imágenes del propio mod, y los desbloqueos que guarda se notifican en directo. Cada uno tiene su propio interruptor, y no se lee nada mientras el `AchievementSupport` del mod esté desactivado. |
| **Adaptaciones a PC** | *The Legend of Zelda: Link's Awakening DX HD* (LADXHD Updated). Añade la carpeta del juego en **Ajustes → Carpetas**. Los 110 logros, sus textos en los idiomas del juego y sus imágenes salen de la instalación. Los desbloqueos se leen de `%LOCALAPPDATA%\Zelda_LA\achievements` (junto al juego cuando tiene un `portable.txt`). El archivo no contiene fechas, así que un desbloqueo se fecha cuando se vio. |
| **Adaptaciones a PC recompiladas** | *Twilight Princess* (Dusklight), *Super Mario 64* (Ghostship), *Diddy Kong Racing* (DKR-R), *Super Mario Bros. Remastered*, *Super Mario Sunshine* con el mod Super Mario Eclipse (SMS Launcher), *Super Mario All-Stars* (la adaptación a PC de Darhkfox), *Road Rash 64 Recompiled*, *F-Zero X* (G-Diffuser), y *Pikmin* y *Pikmin 2* (Open Nectar). Estas adaptaciones integran su lista de logros en el juego, así que AW Next incluye cada lista, en inglés, tomada del código fuente de la adaptación. Las imágenes de los logros salen de la propia carpeta de SMS Launcher, o se descargan una vez de los repositorios de Ghostship, Super Mario Bros. Remastered y Road Rash 64; las demás adaptaciones dibujan las suyas en código, así que sus logros muestran el icono del juego. Una adaptación se encuentra por su archivo de desbloqueos en `%APPDATA%` o `%LOCALAPPDATA%` (`TwilitRealm\Dusklight`, `DKRPort`, `SMB1R`, `sms-launcher`, `RoadRash64Recompiled`), por los juegos que instaló Quiver Launcher (versión 3 o 4), por la **Búsqueda inteligente** a partir de su ejecutable en tus bibliotecas de juegos o por su carpeta en **Ajustes → Carpetas**. Ghostship, Super Mario All-Stars, G-Diffuser y Open Nectar guardan sus partidas junto al juego, así que necesitan una de las tres últimas vías; al añadir la carpeta de Open Nectar se encuentra también Pikmin 2 en su carpeta `pikmin2`. Una instalación portable (`portable.txt`, o el `data_location.json` de Dusklight) se lee donde escribe. DKR-R, SMS Launcher, Super Mario All-Stars y G-Diffuser conservan la fecha de cada desbloqueo; en las demás, un desbloqueo se fecha cuando se vio. En Linux, las compilaciones nativas se leen de `~/.local/share` y `~/.config`, y las de Windows de su prefijo de Wine o Proton. Comparten el interruptor de adaptaciones a PC. |
| **FINAL FANTASY VII (2013)** | Esta reedición es anterior a los logros de Steamworks y guarda sus 36 desbloqueos en un campo de bits de 8 bytes junto a sus partidas, que se encuentra en Documentos sin añadir la carpeta. |
| **Recordar logros vistos** | Mantiene listado un juego después de que su partida desaparezca, con los desbloqueos que vio el rastreador en segundo plano. |
| **Juegos añadidos manualmente** | Un juego añadido a partir de un título y un ejecutable, con una plataforma y un AppID de Steam opcionales. Consulta [Herramientas avanzadas](advanced.md#add-a-game-manually). |

## Metadatos de Steam, sin clave de API {#steam-metadata-without-an-api-key}

AW Next no usa para esto ninguna clave de la API web de Steam ni ninguna cuenta de Steam conectada. La lista de cada juego sale de
una cadena sin clave: primero el punto de acceso oficial `GetGameAchievements` (descripciones ocultas, iconos, rareza
global y los conjuntos de logros de Steam), luego la página de logros de SteamCommunity (el mismo esquema, en
tu idioma), después SteamHunters y un raspado con el navegador solo como último recurso.

Como en Steam, un logro que el desarrollador archivó cuenta solo si lo conseguiste. En caso contrario se deja fuera
de la lista, del porcentaje y de la notificación de platino.

Los resultados se guardan en caché por idioma en `%APPDATA%\Achievement Watcher Next\steam_cache\schema`, así que las fuentes
locales y los juegos vistos antes funcionan sin conexión.

Steam nunca anuncia que una actualización añadió logros, así que una lista en caché se vuelve a comprobar sola cada 3
días y recoge los nuevos sin quitar ninguno. Para comprobar de inmediato, usa **Ajustes → Avanzado →
Revisar de nuevo las listas de logros**. **Actualizaciones automáticas de los datos de logros**, en el mismo sitio, desactiva la
comprobación periódica para quien mantiene `steam_cache` a mano. El botón sigue funcionando.

Los logros de DLC y de actualizaciones llevan el nombre de su grupo (por ejemplo *Hearts of Stone*) bajo el
título, tomado de la misma consulta.

## Fuentes que no ves {#sources-you-do-not-see}

En el modo **Simple**, la lista de Fuentes pliega seis filas poco habituales: GreenLuma, LumaPlay, los dos
emuladores Nemirtingas (los lectores de partidas de GOG y Epic), Goldberg SocialClub y la importación de la caché de
notificaciones. Una fila se pliega solo mientras está activada y ningún juego de tu biblioteca procede de ella. Desactiva una
o ten un juego que detectó, y la fila vuelve, de modo que el modo de interfaz nunca oculta el control que
explicaría un juego que falta. **Avanzado** siempre lista todas las fuentes.

---

**Siguiente:** [Notificaciones](notifications.md), para elegir cómo se anuncian los desbloqueos.

*Configuración específica de cada fuente: [Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[Game Health](game-health.md)*

<div align="center">

[← Documentación](README.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
