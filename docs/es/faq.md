---
title: "FAQ del rastreador de logros"
description: "Respuestas breves sobre cuentas, fuentes, notificaciones, seguridad, copias de seguridad y plataformas compatibles de Achievement Watcher Next."
---

# FAQ del rastreador de logros

Respuestas breves a las preguntas habituales. Cada una enlaza con la guía que la trata.

## Primeros ajustes {#getting-set-up}

### ¿Necesito una clave de la API web de Steam o iniciar sesión en Steam? {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
No. Las listas de logros salen de una cadena de puntos de acceso públicos que no necesita clave, y nada exige una
cuenta. Tus propios desbloqueos de Steam se leen de las estadísticas que Steam guarda en este PC, así que un perfil privado
funciona con todos los juegos jugados aquí. Conectar Steam es opcional: añade los juegos jugados solo en tus
otros PC y Steam Family. Consulta [Cuentas conectadas](sources.md#connected-accounts).

### ¿En qué plataformas funciona? {#which-platforms-does-it-run-on}
Windows 10 y 11, y Linux (x64). Las versiones incluyen su propio entorno de ejecución. Node.js solo hace falta para
compilar desde el código fuente.

### ¿Funciona en Linux o en la Steam Deck? {#does-it-run-on-linux-or-the-steam-deck}
En Linux, sí, como beta: un AppImage nativo (nunca ejecutado con Wine) para GNOME y KDE Plasma, con
Wayland o X11. Encuentra los juegos ejecutados con Steam y Proton, Wine, Lutris, Heroic o Bottles, y se actualiza
solo desde las mismas versiones que la aplicación de Windows. En la Steam Deck la compatibilidad es nueva y no se ha
comprobado en una Deck real. Consulta [Linux y Steam Deck](linux.md).

### ¿Es compatible con RetroAchievements? {#does-it-support-retroachievements}
Sí. Activa la fuente **RetroAchievements**, conecta tu cuenta con su nombre de usuario y su clave Web
API, e **Importar biblioteca** trae todos los juegos que has jugado. Los nuevos desbloqueos se anuncian mientras se ejecuta cualquier
emulador compatible con RetroAchievements. Consulta [RetroAchievements](sources.md#retroachievements).

### ¿Muestra los trofeos de PlayStation? {#does-it-show-playstation-trophies}
Sí. Conecta tu cuenta de PlayStation en **Ajustes → Fuentes** (inicias sesión en la página de Sony) y tus
juegos y trofeos se importan, con la tasa de Sony para cada trofeo. Un juego de otra fuente que
también salió en PlayStation muestra el platino real de su lista. Consulta
[Cuentas conectadas](sources.md#connected-accounts).

### ¿Tengo que conectar una cuenta? {#do-i-have-to-connect-an-account}
No. Steam, Epic, Xbox PC y PlayStation se pueden conectar para leer lo que los archivos locales no contienen,
y RetroAchievements pide tu nombre de usuario y tu clave Web API. Cada token y cada clave se cifra antes de
guardarse en este PC. Todo lo demás funciona sin cuenta.

### ¿Funciona sin conexión? {#does-it-work-offline}
Sí, con las fuentes locales y todo lo que ya está en caché. Los nombres, descripciones y arte de los logros se
obtienen una vez y después se reutilizan desde `%APPDATA%\Achievement Watcher Next\steam_cache`
(`~/.config/Achievement Watcher Next/steam_cache` en Linux).

### ¿Pierdo algo si elijo el modo Simple? {#do-i-lose-anything-by-choosing-simple-mode}
No. Simple oculta controles y nunca desactiva una función. Nada de lo que escanea, vigila o se guarda
cambia, y al volver se restablece cada control con su valor. Consulta
[Primeros pasos](getting-started.md#simple-and-advanced).

### ¿Puede mostrar juegos que poseo pero nunca instalé, o desbloqueos de otro PC? {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
Sí. Con la fuente de Steam en **En propiedad**, dos interruptores de la tarjeta de la cuenta de Steam, **Añadir los juegos que
posees** y **Añadir los juegos compartidos contigo a través de Familia de Steam**, listan toda tu biblioteca. Ambos
están desactivados por defecto porque una biblioteca grande alarga mucho el primer escaneo. Con una cuenta de Steam
conectada, un juego sin nada que leer en local se lee desde tu perfil de Steam (sus detalles del juego
deben ser públicos) y la respuesta se guarda en caché seis horas. Consulta
[Cuentas conectadas](sources.md#connected-accounts).

## La biblioteca {#the-library}

### Falta un juego {#a-game-is-missing}
Comprueba que su fuente está activada en **Ajustes → Fuentes**, ejecuta **Búsqueda inteligente** en **Ajustes →
Carpetas** y desactiva **Mostrar solo los juegos instalados** para ver si el juego es conocido pero ya no está
instalado. La lista de comprobación completa está en [Solución de problemas](troubleshooting.md#a-game-is-missing).

### Un juego muestra «Sin logros» {#a-game-shows-no-achievements}
Ese juego no tiene conjunto de logros. Sigue siendo lanzable y conserva el seguimiento del tiempo de juego, y se deja fuera
de las estadísticas de completado en lugar de contar como 0 %. Su recuadro muestra arte donde estaría la barra de progreso.
**Ajustes → Apariencia → Recuadros de la biblioteca → Barra de juegos sin logros** devuelve la
barra.

### Un juego muestra 0 % aunque he desbloqueado logros {#a-game-shows-0-although-i-have-unlocked-achievements}
El juego tiene un esquema pero ningún archivo de desbloqueos en tiempo de ejecución. Abre su panel [Game Health](game-health.md): 
nombra la pieza que falta y ofrece solo las reparaciones que se aplican.

### ¿Por qué aparece el mismo juego dos veces? {#why-does-the-same-game-appear-twice}
Se encontró por dos fuentes. **Combinar duplicados** en Ajustes → General las une. Si una
entrada es una carpeta de partidas obsoleta de un juego que ahora posees en otro sitio, ponla en la lista negra.

### Una actualización del juego añadió logros y no los veo {#a-game-update-added-achievements-and-i-do-not-see-them}
Una lista en caché se vuelve a comprobar sola cada 3 días. Para recoger los nuevos ahora, usa **Ajustes → Avanzado →
Revisar de nuevo las listas de logros**, que funciona incluso con **Actualizaciones automáticas de los datos de logros** desactivado. Ninguna
de las dos comprobaciones elimina nada que ya esté en caché.

### Un juego se emparejó con la versión equivocada de Steam {#a-game-was-matched-to-the-wrong-steam-release}
Haz clic derecho en él y elige **Definir el AppID manualmente...**. El AppID se escribe en `steam_appid.txt` y
se recuerda para esa carpeta de instalación. Consulta [Fijar a mano el AppID de un juego](advanced.md#set-a-games-appid-by-hand).

## Notificaciones {#notifications}

### No aparece nada cuando desbloqueo algo {#nothing-appears-when-i-unlock-something}
Empieza por la fila Notificaciones del panel [Game Health](game-health.md) de ese juego, que nombra el
canal que entregó por última vez y por qué. Sigue después
[Si una prueba o un desbloqueo no aparece](notifications.md#if-a-test-or-unlock-does-not-appear).

### El popup del overlay no se muestra en un juego concreto {#the-overlay-popup-does-not-show-in-one-particular-game}
Probablemente ese juego está en pantalla completa exclusiva, donde no se puede dibujar un popup siempre visible. En
**Automático**, AW Next envía ese desbloqueo como una notificación de Windows mostrada sobre el juego. Un juego en
modo exclusivo heredado no deja pasar nada: cámbialo a sin bordes. Consulta
[cómo decide Automático](notifications.md#how-automatic-decides).

### Las notificaciones se ocultan mientras juego {#notifications-are-hidden-while-i-play}
Eso es No molestar de Windows. Activa **Notificaciones prioritarias** y aprueba la solicitud única de Windows.
Consulta [Notificaciones prioritarias de Windows](notifications.md#priority-windows-notifications).

### ¿Puedo cambiar el aspecto del popup o compartir un diseño? {#can-i-change-how-the-popup-looks-or-share-a-design}
Sí. Diez presets vienen con la aplicación, el **Diseñador de presets** construye los tuyos con controles normales
y cualquier preset se exporta a un archivo `.awpreset`. Consulta [Presets y el Diseñador de presets](presets.md).

### ¿Puedo poner los desbloqueos en mi stream? {#can-i-put-unlocks-on-my-stream}
Sí, con una fuente de Navegador en OBS. Capturar el popup como ventana no puede funcionar, ya que existe solo para
un desbloqueo y desaparece antes de que OBS lo liste, así que AW Next sirve el mismo popup como página. La dirección está
en Ajustes → Notificación → **Fuente de navegador de OBS**. Consulta
[Mostrar los desbloqueos en el stream (OBS)](notifications.md#show-unlocks-on-stream-obs).

### ¿Es el overlay lo mismo que el popup? {#is-the-overlay-the-same-thing-as-the-popup}
No. El popup es una notificación puntual con el estilo de un preset. El **overlay** es la lista completa de logros
que abres con `Ctrl+Mayús+K` mientras se ejecuta un juego. Consulta la [guía del overlay](overlay.md).

### En Linux, Ctrl+Mayús+K no hace nada en mi juego {#on-linux-ctrlshiftk-does-nothing-in-my-game}
En Wayland, AW Next no puede ver las teclas pulsadas mientras una ventana nativa de Wayland tiene el foco, como un
juego de Linux en modo Wayland o Proton con su controlador de Wayland. Asigna una tecla en los ajustes de teclado de tu escritorio
a `/home/you/.local/bin/achievement-watcher --toggle-overlay`, sustituyendo `you` por tu nombre
de usuario. AW Next mantiene ese comando apuntando al AppImage actual, así que el atajo sobrevive a las
actualizaciones. Consulta [Atajo del overlay](linux.md#overlay-shortcut).

## Seguridad y datos {#safety-and-data}

### ¿Modifica AW Next mis juegos o envía algo fuera de mi PC? {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
Solo cuando lo pides. Leer logros es de solo lectura. Las herramientas de reparación de emuladores (el submenú
**Emulador y herramientas** del clic derecho de un juego y **Ajustes → Emuladores**) escriben en la carpeta de un juego, siempre
tras una confirmación y con una copia de seguridad. Úsalas solo con juegos que poseas. Más allá de las consultas de solo lectura
y de lo que devuelve una cuenta conectada, nada sale de este PC. Consulta
[Qué sale de este PC](README.md#what-leaves-this-pc).

### Mi antivirus marcó o eliminó un archivo {#my-antivirus-flagged-or-removed-a-file}
Casi con seguridad es el emulador de Steam o un cargador de Ubisoft, y un falso positivo: esos archivos sustituyen
a la biblioteca de Steam o de Ubisoft de un juego, que es el comportamiento que buscan los motores de detección. No se escribe
nada salvo que hayas ejecutado una reparación, abierto **Ajustes → Emuladores** o activado la reparación automática. Permite
el archivo que nombró tu antivirus, o excluye `%APPDATA%\Achievement Watcher Next\cache`. No desactives nunca
la protección. Consulta [Solución de problemas → Antivirus](troubleshooting.md#antivirus-or-smartscreen-warning).

### Windows SmartScreen avisa sobre el instalador {#windows-smartscreen-warns-about-the-installer}
Las versiones se firman con el certificado propio del proyecto, fijado por su huella, en lugar de uno comercial,
así que SmartScreen puede pedir confirmación. Nunca necesitas instalar ese certificado: el actualizador de la aplicación
comprueba el firmante, la huella fijada y que el archivo no se modificó tras la firma
antes de instalar nada. Descarga solo desde la
[página oficial de versiones](https://github.com/Shirowwww/Achievement-Watcher-Next/releases). Para comprobar un
instalador por ti mismo, ejecuta `Get-FileHash <installer> -Algorithm SHA256` y abre
`https://www.virustotal.com/gui/file/<hash>`. La versión actual es la
[3.12.6](https://www.virustotal.com/gui/file/53f6f16421d88687ea70c16ac7a3d016202dc6ad3a008bb986e29160a48f5709).
Consulta [Solución de problemas → Comprobar una versión por ti mismo](troubleshooting.md#checking-a-release-yourself).

### En Linux, ¿por qué aparece un aviso del llavero? {#on-linux-why-does-a-keyring-prompt-appear}
AW Next cifra sus tokens de inicio de sesión con una clave que guarda el llavero de tu escritorio (GNOME Keyring o KDE
Wallet). Con el inicio de sesión automático el llavero permanece bloqueado, así que el escritorio te pide desbloquearlo o crear
uno cuando arranca AW Next. Cancelar no tiene riesgo: la aplicación sigue funcionando y el aviso vuelve en el siguiente inicio.
Consulta [Aviso del llavero](linux.md#keyring-prompt).

### ¿Dónde están mis datos, los pierdo al actualizar y qué tamaño tienen las actualizaciones? {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
Todo está en `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next` en Linux),
e instalar una compilación más reciente lo conserva. El primer inicio tras actualizar importa una carpeta anterior de Achievement
Watcher sin modificarla ni borrarla. Las actualizaciones descargan solo lo que cambió desde tu versión
instalada y recurren por sí solas a una descarga completa si eso falla. Consulta
[Actualizaciones y datos existentes](getting-started.md#updates-and-existing-data).

### ¿Cómo me paso a un PC nuevo o hago una copia de mi configuración? {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**Ajustes → Avanzado → Copia de seguridad del perfil → Exportar perfil…** escribe tus ajustes, elecciones de biblioteca,
presets, temas, portadas y tiempo de juego en un único archivo `.awbackup`. Instala AW Next en el PC nuevo, elige
**Restaurar perfil…** y se aplica en el siguiente inicio; los archivos que reemplaza se conservan. Los inicios de sesión
nunca se guardan, así que vuelve a conectar Steam, Epic, Xbox, PlayStation y RetroAchievements. Consulta
[Copia de seguridad del perfil](advanced.md#profile-backup).

### ¿Hay una versión portable? {#is-there-a-portable-version}
Sí. El ZIP portable guarda la aplicación y sus datos en una carpeta y consulta el mismo canal de versiones que la
aplicación instalada. Nunca descarga ni ejecuta el instalador: ofrece la página de la versión cuando hay una más
nueva, y extraer el archivo nuevo sobre la carpeta antigua conserva tus datos.

### ¿Cómo salgo por completo? {#how-do-i-quit-completely}
Al cerrar la ventana, AW Next se queda en la bandeja del sistema para que el seguimiento continúe. Usa el menú de la bandeja para salir.

## El proyecto {#the-project}

### ¿Funciona con juegos de Goldberg, GBE Fork y CODEX? {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
Sí. AW Next lee los archivos de logros que escriben Goldberg, GBE Fork, CODEX, RUNE y CPY, y puede
instalar y reparar el entorno de GBE Fork de un juego. Consulta [Fuentes compatibles](sources.md) y
[Configuración de Goldberg y GBE Fork](emulator-setup.md).

### ¿Es la misma aplicación que el Achievement Watcher de Xan105? {#is-this-the-same-app-as-xan105s-achievement-watcher}
No, es una continuación. AW Next continúa el Achievement Watcher de Xan105 y la rama 2.x de darktakayanagi,
sobre un entorno Electron actual, con compatibilidad con Linux, más fuentes y un informe de estado por juego
con reparaciones guiadas. Consulta la [Comparación](comparison.md).

### ¿Es seguro usarlo con juegos crackeados? {#is-it-safe-to-use-with-cracked-games}
Leer logros es de solo lectura. Las herramientas de reparación escriben en la carpeta de un juego solo tras una confirmación y
con una copia de seguridad, y la reparación automática está desactivada por defecto. Úsalas solo con juegos que poseas. Un antivirus
puede marcar un archivo de emulador como falso positivo. Consulta
[Solución de problemas → Antivirus](troubleshooting.md#antivirus-or-smartscreen-warning).

### ¿En qué se diferencia de Achievement Watcher 2.x? {#how-does-this-differ-from-achievement-watcher-2x}
AW Next lo continúa con un entorno de ejecución moderno y un gran repaso de compatibilidad, fiabilidad y
funciones. Consulta la [Comparación](comparison.md).

### ¿Puede conseguirme juegos, claves o cuentas? {#can-it-get-me-games-keys-or-accounts}
No, y el gestor de incidencias tampoco puede ayudar con eso. AW Next no contiene archivos de juegos y no esquiva
las comprobaciones de propiedad en línea.

### He encontrado un error o tengo una idea {#i-found-a-bug-or-have-an-idea}
[Abre una incidencia](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) con la versión de la aplicación,
tu versión de Windows (o distribución de Linux y escritorio), la fuente implicada y los registros relevantes.
Informa de una sospecha de vulnerabilidad en privado mediante la
[política de seguridad](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md). Para una
pregunta, o ayuda antes de saber si es un error, pregunta en el [servidor de Discord](https://discord.gg/DjTMrDsXTh).

---

**¿Sigues atascado?** [Solución de problemas](troubleshooting.md) repasa cada síntoma por orden.

<div align="center">

[← Documentación](README.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
