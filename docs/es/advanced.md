---
title: "Herramientas avanzadas"
description: "Las herramientas de mantenimiento de Ajustes, Avanzado: vaciado de cachés, diagnóstico, copia de seguridad del perfil, AppID manuales y restablecimientos."
---

# Herramientas avanzadas

Estas herramientas están en **Ajustes → Avanzado** o en el menú de clic derecho de un juego. La pestaña Avanzado
existe solo mientras la interfaz está en modo **Avanzado**: cambia el control **Interfaz** de la parte superior
de los Ajustes si no la ves. No se pierde nada al volver.

<div align="center">
<picture><source srcset="../assets/shot/advanced-panel-800.webp 800w, ../assets/shot/advanced-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/advanced-panel.png" width="720" height="529" alt="Ajustes - Avanzado, configuración y mantenimiento"></picture><br>
<sub>Configuración &amp; mantenimiento; las demás secciones se pliegan debajo</sub>
</div>

## Configuración y mantenimiento {#setup-and-maintenance}

| Herramienta | Qué hace |
|---|---|
| **Arreglar todos los juegos detectados** | Ejecuta la reparación correspondiente (Steam/GBE Fork o Ubisoft/Uplay R2) en cada juego compatible detectado con carpeta de instalación conocida. Reconstruye los juegos que ya tienen una configuración. |
| **Desactivar la aceleración por hardware** | Apaga la aceleración por GPU cuando la ventana o el overlay se comportan mal. Necesita reiniciar. |
| **Vaciar cachés** | Borra solo las cachés que se pueden volver a descargar: archivos de actualización, la caché de esquemas e iconos de Steam/Ubisoft y las herramientas de corrección de emuladores descargadas. Los ajustes, las partidas guardadas, las copias de seguridad y los archivos colocados a mano nunca se tocan. |
| **Revisar de nuevo las listas de logros** | Consulta a Steam los logros añadidos por una actualización de un juego. Se ejecuta cada 3 días; el botón lo fuerza ahora. |
| **Actualizaciones automáticas de los datos de logros** | Activado por defecto. Desactivado detiene esa nueva comprobación y la reparación de descripciones en blanco, para quien mantiene `steam_cache` a mano. **Revisar de nuevo las listas de logros** sigue funcionando mientras está desactivado. |

Los ajustes de reparación propios de cada fuente están en **Ajustes → Emuladores**. **Ubisoft / Uplay R2** contiene el
estado del paquete, los controles de importación y restauración de DLL y la reparación por lotes dirigida; los detalles del cargador y del INI siguen siendo
automáticos.

**Vaciar cachés** es lo primero que hay que probar cuando una actualización falla una y otra vez con el mismo archivo descargado.

## Diagnóstico {#diagnostics}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Ajustes - Avanzado, diagnóstico" loading="lazy" decoding="async"></picture><br>
<sub>Versiones y un clic para llegar a las carpetas de registros y de datos</sub>
</div>

La tarjeta Diagnóstico muestra las versiones de la aplicación, Electron, Node y Chrome, y abre la carpeta de registros,
la carpeta de datos o una comprobación de actualización. **Exportar registros (.zip)** agrupa todos los archivos de registro en un archivo
mientras la aplicación se ejecuta; copiarlos a mano no es fiable porque los procesos que los escriben nunca se detienen.
Tu nombre de usuario y cualquier clave, token o contraseña se enmascaran en el archivo, no en los registros del disco. Consulta
[Solución de problemas](troubleshooting.md#open-logs-and-local-data) para saber qué necesita un informe de error.

## Copia de seguridad del perfil {#profile-backup}

<div align="center">
<picture><source srcset="../assets/shot/profile-backup-panel-800.webp 800w, ../assets/shot/profile-backup-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/profile-backup-panel.png" width="720" height="529" alt="Ajustes - Avanzado, copia de seguridad del perfil" loading="lazy" decoding="async"></picture><br>
<sub>Exportar perfil y Restaurar perfil, en Ajustes → Avanzado</sub>
</div>

**Exportar perfil…** guarda tus ajustes, elecciones de biblioteca, presets, temas, portadas, fondos personalizados,
puntos de restauración de GBE y tiempo de juego en un único archivo `.awbackup`, para una reinstalación o un PC nuevo. Los inicios de sesión,
las cachés y los registros nunca se guardan, así que después vuelves a iniciar sesión en Epic, Steam, Xbox, PlayStation y
RetroAchievements. **Restaurar perfil…** comprueba primero el archivo entero y lo aplica en el
siguiente inicio. Los archivos que reemplaza se conservan, y una restauración fallida lo devuelve todo a su sitio.

## Juegos quitados {#removed-games}

Un juego retirado con **Quitar de AW Next** aparece en **Ajustes → General → Juegos quitados**
y se puede recuperar uno a uno o todos a la vez. Úsalo para una carpeta suelta que el escaneo sigue
encontrando pero que no es un juego; para mantener fuera de la vista un juego de verdad, **Ocultar de la vista** es más ligero
(consulta [Ocultar, quitar o borrar un juego](#hide-remove-or-clear-a-game)).

## Restablecer los logros de un juego {#reset-a-games-achievements}

**Restablecer los logros**, en la página del juego junto al tiempo de juego o en su menú de clic derecho, devuelve
cada logro al estado bloqueado para que puedas volver a jugar el juego entero. AW Next los anuncia como
nuevos cuando se desbloquean.

<div align="center">
<picture><source srcset="../assets/shot/achievements-800.webp 800w, ../assets/shot/achievements.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/achievements.png" width="800" height="492" alt="Una página de juego con Restablecer los logros" loading="lazy" decoding="async"></picture><br>
<sub>Restablecer está junto al recuento de completado en la propia página del juego</sub>
</div>

Antes se hace copia de seguridad de cada archivo implicado en
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`, y la confirmación lista
los archivos exactos antes de tocar nada. Un archivo cuya copia de seguridad falla se omite, no se vacía.

| Fuente | Qué hace un restablecimiento |
|---|---|
| Emuladores de Steam (Goldberg / GBE y estructuras compatibles, incluidos Goldberg SocialClub y Uplay R2) | Elimina la partida de logros. El emulador escribe una nueva en el siguiente desbloqueo. |
| RPCS3 | Elimina `TROPUSR.DAT`. La lista de trofeos (`TROPCONF.SFM`) se deja intacta. |
| ShadPS4 | Vuelve a bloquear los trofeos dentro de `TROP*.XML`, que también contiene la lista de trofeos, así que el archivo se edita, no se elimina. |
| KytyPS5 | Elimina los archivos de desbloqueo `trophies_*.json` del juego. La lista de trofeos permanece en el paquete del propio juego. |
| Xenia | Borra el indicador de conseguido dentro del `.gpd`, que también contiene la lista de logros, así que el archivo se edita. |
| Steam, GOG Galaxy, Ubisoft Connect, EA, Epic, Xbox | **No es posible.** Estas guardan los desbloqueos en tu cuenta y los vuelven a sincronizar; solo la cuenta puede borrarlos. AW Next lo dice. |

Los contadores de progreso guardados junto a los logros (`stats.ini`, `stats.bin`, …) también se restablecen y
se les hace copia de seguridad: en un logro de «recorrer 1000 km» el contador es el progreso, y dejarlo lleno haría
que el logro se dispare de inmediato o nunca más.

**Restaurar una copia de seguridad de logros**, en el mismo menú de clic derecho, devuelve todo un restablecimiento. Actualiza la
biblioteca después para leer los desbloqueos restaurados.

> [!NOTE]
> Un restablecimiento también borra el registro propio de AW Next de lo que ya estaba desbloqueado, incluso en el
> rastreador en segundo plano en ejecución. De lo contrario, un logro conseguido de nuevo no se volvería a anunciar nunca.

## Volver a bloquear un solo logro {#re-lock-a-single-achievement}

Haz clic derecho en un logro desbloqueado en la página del juego y elige **Volver a bloquear este logro** para
jugar de nuevo ese. Solo ese logro vuelve a estar bloqueado: su indicador, su hora de desbloqueo y su
progreso en la partida del emulador, su contador cuando la partida enlaza uno con él, y el
registro propio de AW Next, de modo que se anuncia como nuevo cuando lo consigues. La confirmación lista los archivos y de cada archivo
se hace antes copia de seguridad, como en un restablecimiento; **Restaurar una copia de seguridad de logros** lo devuelve.

Cierra primero el juego. Un emulador guarda sus desbloqueos en memoria y los vuelve a escribir cuando el juego
termina, lo que desharía el cambio, así que AW Next lo rechaza mientras hay un juego en ejecución.

Funciona con las partidas de texto de los emuladores de Steam (Goldberg y GSE, CODEX, RUNE, OnlineFix, RLD!,
3DM, ALI213, TENOKE, Hoodlum, RAZOR1911, CreamAPI), UniverseLAN, Nemirtingas, Uplay R1 y R2,
GreenLuma y LumaPlay en Windows, y las partidas de consola de RPCS3, ShadPS4, Xenia, KytyPS5, las adaptaciones de Xbox
360 y XLLN. Las partidas de SmartSteamEmu (`stats.bin`) y de SKIDROW (`achieve.dat`) no se editan logro
a logro, ya que su estructura no está documentada; usa **Restablecer los logros** para esas.

## Ocultar, quitar o borrar un juego {#hide-remove-or-clear-a-game}

El menú de clic derecho de un juego tiene tres maneras de hacerlo desaparecer, de la más ligera a la más fuerte:

| Entrada | Qué ocurre | Cómo deshacerlo |
|---|---|---|
| **Ocultar de la vista** | El juego sale de Todos los juegos, de todas las colecciones y de las estadísticas, pero se sigue rastreando y sigue notificando. | El menú Colecciones muestra una vista **Ocultos** mientras haya un juego oculto; haz clic derecho en él allí y elige **Mostrar de nuevo**. |
| **Quitar de AW Next** | El escaneo omite el juego: sale de la biblioteca. Pensado para herramientas y otras cosas que no son juegos. | **Ajustes → General → Juegos quitados**. |
| **Borrar los datos de este juego...** | Se borra todo lo que AW Next guarda sobre el juego: sus partidas de logros (con copia de seguridad previa, como en un restablecimiento), el tiempo de juego, la lista de logros y los iconos en caché, los ajustes por juego y la configuración de emulador que AW Next escribió en su carpeta. La confirmación lista antes cada parte. | Nada que deshacer: el siguiente escaneo vuelve a encontrar el juego como uno nuevo. |

## Renombrar un juego {#renaming-a-game}

**Ajustes del juego → Renombrar…**, en el menú de clic derecho, fija el nombre con el que se muestra un juego: en su
recuadro y su pantalla, en la búsqueda y la ordenación, en las notificaciones y en las carpetas donde se guardan las capturas de pantalla
y los clips. La búsqueda sigue encontrando el juego por su nombre original. Deja el campo vacío o elige
**Restaurar el nombre original** para volver atrás. El nombre se guarda por juego en `cfg/gameTitles.json`, así que
sobrevive a los reescaneos y forma parte de una copia de seguridad del perfil. Las búsquedas de portadas y el emparejamiento de juegos usan el nombre
original.

**Ajustes → General → Títulos de juegos en mi idioma**, activado por defecto, muestra los juegos de Steam con el
título que Steam les da en el idioma de tus logros (el idioma propio del juego cuando lo tiene).
Las portadas siguen el mismo idioma. El catálogo local de Steam responde por los juegos que tu cliente de Steam conoce;
los demás se consultan una vez, por lotes, y se vuelven a comprobar al cabo de un mes. Un nombre que pongas tú mismo siempre
tiene prioridad.

## Editar el tiempo de juego de un juego {#editing-a-games-playtime}

**Logros y tiempo de juego → Editar tiempo de juego…**, en el menú de clic derecho, reemplaza el tiempo de juego
total de un juego, por ejemplo uno traído de otro rastreador o uno al que le faltaron sesiones. Escribe horas
(`12.5`) u horas y minutos (`12h30` o `12:30`). Se conserva la fecha de la última sesión, y AW Next
suma las sesiones posteriores al nuevo total. Un juego que posees en Steam nunca baja del tiempo de juego que Steam
indica: el siguiente escaneo sube un total más bajo hasta el de Steam.

## Un idioma de logros distinto para un solo juego {#a-different-achievement-language-for-one-game}

**Ajustes del juego → Idioma de los logros**, en el menú de clic derecho, muestra los logros y las notificaciones de un juego
en un idioma distinto del resto de la biblioteca. **Igual que la app** vuelve a la
elección global.

## Añadir un juego manualmente {#add-a-game-manually}

El `+` junto a la búsqueda de la biblioteca añade un juego a partir de un título y un ejecutable, con una plataforma
y un AppID de Steam opcionales. Úsalo para un juego que ninguna fuente detecta: una compilación independiente, una instalación
portable o un emulador que inicias tú mismo.

Un juego añadido manualmente:

- es lanzable y registra el tiempo de juego como cualquier otra entrada;
- muestra **Sin logros** si no los tiene, y se deja fuera de las estadísticas de completado en lugar de
  contar como 0 %;
- puede adoptar más adelante un esquema de logros de Steam añadiendo el AppID, sin tener que recrearlo;
- conserva diagnósticos protegidos por juego, mientras las acciones destructivas permanecen ocultas.

Las carpetas añadidas manualmente llevan un icono compacto en la lista de Carpetas, para distinguirlas de las ubicaciones que la
Búsqueda inteligente descubrió.

## Fijar a mano el AppID de un juego {#set-a-games-appid-by-hand}

Haz clic derecho en un juego cuyo nombre de carpeta coincide con varias versiones de Steam, de modo que el emparejamiento automático eligió
la equivocada, y elige **Definir el AppID manualmente...**. La elección se recuerda por carpeta de instalación y se
escribe en `steam_appid.txt`; **Borrar el AppID manual** la deshace. La reparación **Corregir
el archivo de identificación del juego** de Game Health también pide el AppID, partiendo de la propia sugerencia de AW Next.

## Marcar un logro como desbloqueado {#mark-an-achievement-as-unlocked}

Un logro que una fuente no puede ver (conseguido antes de configurar el seguimiento, o nunca registrado por un
emulador) se puede marcar desde su menú de clic derecho con **Marcar como desbloqueado manualmente**. **Anular desbloqueo
manual** lo deshace. Los desbloqueos manuales persisten entre escaneos y se borran con un restablecimiento.

## Pasos bajo un logro {#steps-under-an-achievement}

Un logro largo se puede dividir en pasos que tú escribes y marcas. Pasa el ratón por encima en la página del juego
y abre **Pasos**, o haz clic derecho en él y elige **Añadir pasos**, escribe después un paso y pulsa Intro.
Haz clic en una casilla para marcar un paso, doble clic en su texto para renombrarlo y usa la cruz para quitarlo.
El juego nunca informa de pasos, así que solo rellenan la barra del logro: el desbloqueo sigue viniendo del
juego, y cuando ocurre todos los pasos aparecen como hechos. El overlay en el juego muestra los mismos pasos y
los marca con el ratón o con un mando.

**Pasos** en la cabecera del juego exporta la lista a un archivo para compartir, o importa una. Un archivo lleva
los textos, no las marcas, y sus logros se emparejan por id y después por nombre; los pasos que ya existen
conservan sus marcas. Los pasos están en `cfg/achievement-steps.json` y van a la copia de seguridad del perfil.

## Herramientas de emulador y reparación {#emulator-and-repair-tools}

El diagnóstico y la reparación de configuraciones de Goldberg / GBE Fork, el instalador del entorno de GBE, Steamless y la
omisión opcional de la comprobación de API están en **Ajustes → Emuladores** y en el submenú **Emulador y herramientas**
de cada juego. Sus guías:

- [Configuración de Goldberg / GBE](emulator-setup.md) - diagnosticar y reparar un juego de Steam emulado
- [Configuración de Uplay, R1 y R2](uplay-r2.md) - el equivalente de Ubisoft
- [Referencia de Goldberg / GBE](../goldberg-gbe.md) - formatos de archivo y reglas de detección

**Quitar la configuración de emulador de AW Next**, en el mismo menú, deshace solo la sección de DLC, los interruptores
y las claves de identidad que AW Next escribió en el `configs.user.ini` de un juego, nunca un valor que fijaste tú o el repack,
y borra el archivo solo cuando no queda nada más dentro. Muestra primero exactamente lo que va a quitar,
que es la única forma de recuperarlo si nunca hiciste copia de seguridad de ese archivo.

**Aplicar la corrección de logros de GOG (UniverseLAN)...** aparece en un juego de GOG que incluye una dll de Galaxy. Instala
la compilación de UniverseLAN que coincide con el SDK de Galaxy de ese juego, conserva la dll original como copia de seguridad y
nunca sobrescribe las partidas de UniverseLAN existentes. Los desbloqueos que escribe en `%LOCALAPPDATA%\UniverseLAN`
se leen y se notifican como cualquier otro.

Si una reparación puso el emulador compatible, **Deshacer el cambio de emulador** en
[Game Health](game-health.md#the-repairs) devuelve los archivos propios del crack.

> [!WARNING]
> Las reparaciones crean copias de seguridad, pero aun así modifican archivos del juego. Úsalas solo con juegos que poseas.

---

**Siguiente:** [FAQ](faq.md) - respuestas breves a las preguntas que más surgen.

<div align="center">

[← Documentación](README.md) · [Solución de problemas](troubleshooting.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
