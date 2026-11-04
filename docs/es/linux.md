---
title: "Rastreador de logros para Linux y Steam Deck"
description: "Instala el AppImage y mantenlo actualizado, asigna el overlay a una tecla en GNOME o KDE y ejecuta tus juegos con Steam, Proton, Lutris, Heroic o Bottles."
---

# Rastreador de logros para Linux y Steam Deck

AW Next funciona en Linux (x64) como aplicación nativa, nunca a través de Wine. Sigue los juegos ejecutados con Steam
y Proton, Wine, Lutris, Heroic o Bottles, los juegos nativos de Linux y los emuladores compatibles, con la
misma biblioteca, popups, overlay y tiempo de juego que en Windows.

La versión de Linux es una **beta**. Se probó en GNOME y KDE Plasma, en prefijos de Wine y Proton y
con juegos de prueba, pero no en muchos equipos reales: una Steam Deck real, mandos reales, todos los lanzadores y
todas las versiones scene. Si algo no funciona, una
[incidencia](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) con tu distribución, escritorio
y registros es lo que más ayuda.

## Instalación {#install}

1. Abre la [última versión](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
   y descarga `Achievement.Watcher.<version>.AppImage`.
2. Ponlo en una carpeta tuya, como `~/Applications`, y hazlo ejecutable: en el gestor
   de archivos, **Propiedades → Permitir ejecutar el archivo como un programa**, o en una terminal:

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. Inícialo y sigue la guía del primer inicio como en Windows (consulta [Primeros pasos](getting-started.md)).

Un AppImage necesita FUSE 2, que algunas distribuciones, Ubuntu 24.04 entre ellas, ya no instalan por
defecto. Si el archivo no arranca, instálalo: `libfuse2t64` en Ubuntu 24.04 y posteriores, `libfuse2` en
versiones anteriores de Ubuntu y Debian, `fuse-libs` en Fedora, `fuse2` en Arch.

En su primer inicio, AW Next se añade al menú de aplicaciones. **Ajustes → General → Iniciar con el
sistema** lo inicia, oculto en la bandeja, en cada inicio de sesión. Los ajustes, cachés, tiempo de juego y registros están en
`~/.config/Achievement Watcher Next`.

## Actualizaciones {#updates}

El AppImage se actualiza solo desde las mismas versiones de GitHub que la aplicación de Windows. Una versión nueva se
anuncia con una notificación de escritorio y el indicador de la barra de título, y pregunta antes de descargar. Después
comprueba el archivo con el resumen SHA-512 publicado con la versión (`latest-linux.yml`), sustituye
el AppImage antiguo y se reinicia. Si hay un juego en ejecución, la actualización espera a que se cierre. Tus datos se quedan
donde estaban.

El archivo nuevo lleva la versión nueva en su nombre. La entrada **Iniciar con el sistema** y el
comando `~/.local/bin/achievement-watcher` la siguen. Un lanzador que hayas creado tú y que nombre el archivo
AppImage sigue apuntando al nombre antiguo, así que haz que apunte a ese comando.

## Escritorios compatibles {#supported-desktops}

AW Next se prueba en GNOME y KDE Plasma, con Wayland y X11 (Ubuntu 24.04 con GNOME 46 y
Plasma 5.27), y en Fedora 44 con GNOME 50, Plasma 6.7, Hyprland 0.56 y COSMIC 1.0, en una máquina
virtual. Otros escritorios pueden funcionar, pero no se han probado.

- **Wayland.** AW Next se reinicia una vez a través de XWayland al arrancar para que sus popups y su overlay puedan
  quedarse por encima de los juegos, que se ejecutan como ventanas X11 bajo Wine y Proton. Hyprland y COSMIC inician XWayland
  por defecto. Sin él (`xwayland.enabled = false` en Hyprland), AW Next sigue siendo una aplicación Wayland nativa:
  la biblioteca, la bandeja y las notificaciones funcionan, pero el compositor coloca los popups y el overlay como
  cualquier ventana, y un popup le quita el teclado al juego mientras se muestra.
- **Bandeja.** KDE y COSMIC muestran el icono de la bandeja tal cual. GNOME necesita la extensión AppIndicator, que
  Ubuntu incluye activada. Hyprland necesita una barra con bandeja, como Waybar con su módulo `tray`.
  Sin bandeja, cerrar la ventana minimiza AW Next en lugar de ocultarlo; Hyprland no tiene ventanas
  minimizadas, así que allí se oculta, y volver a iniciar AW Next trae la ventana de vuelta.
- **Las notificaciones** son las del propio escritorio. No molestar las oculta salvo que **Ajustes → Notificación →
  Notificaciones prioritarias** esté activado, en cuyo caso los desbloqueos se siguen mostrando en GNOME y KDE. Hyprland no tiene
  propias: ejecuta un demonio de notificaciones como mako, dunst o SwayNC. mako dibuja bajo un juego a pantalla
  completa salvo que su configuración fije `layer=overlay`, y mantiene cada notificación hasta que hagas clic salvo que
  fije `default-timeout` (en milisegundos). COSMIC retiene sus notificaciones mientras un juego está a pantalla
  completa. El popup propio de AW Next se muestra sobre el juego en ambos casos.
- Las opciones que solo existen en Windows están marcadas como tales en los Ajustes.

## Capturas de pantalla y clips {#screenshots-and-clips}

Las capturas de pantalla y los clips de cada desbloqueo funcionan en X11 y en Wayland. Los clips los graba
gpu-screen-recorder con la tarjeta gráfica cuando está instalado. Si eliges en los Ajustes el grabador por software de
AW Next, guarda archivos WebM en su lugar y muestra cuánto ha costado.

En Wayland, la primera captura de pantalla hace que el escritorio pregunte si las aplicaciones pueden hacer capturas (GNOME 47
y posteriores, KDE Plasma 6, COSMIC y Hyprland). AW Next espera unos segundos la respuesta y después omite
esa captura y las de los desbloqueos que lleguen mientras la pregunta está abierta. Haz clic en **Permitir**, ya que Intro
elige **Denegar** en GNOME y Hyprland, y las siguientes capturas se hacen sin decir nada. Si la deniegas,
AW Next no hace capturas y no vuelve a preguntar. Para que te vuelva a preguntar en la siguiente captura,
ejecuta:

```bash
flatpak permission-remove screenshot screenshot
```

El grabador por software captura la pantalla mediante el cuadro de diálogo de compartir pantalla del escritorio, que vuelve
cada vez que se inicia un juego y, en COSMIC y Hyprland, saca el juego de la pantalla completa.
gpu-screen-recorder pregunta una sola vez.

## Atajo del overlay {#overlay-shortcut}

`Ctrl+Mayús+K` abre el overlay mientras un juego de Wine o Proton tiene el foco. En Wayland, AW Next no puede
ver una tecla pulsada mientras una **ventana nativa de Wayland** tiene el foco, como un juego de Linux en modo Wayland o
Proton con su controlador de Wayland. No hay atajo dentro del juego para esos juegos.

Un atajo de los ajustes de teclado de tu escritorio no depende de eso. Haz que ejecute este comando,
sustituyendo `you` por tu nombre de usuario (GNOME no expande `~`, así que escribe la ruta completa):

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

Abre o cierra el overlay de la copia que ya se está ejecutando y no inicia nada más. El comando existe
desde el primer inicio del AppImage, y AW Next lo renueva en cada inicio, así que sigue las actualizaciones.

- **GNOME:** **Ajustes → Teclado → Ver y personalizar atajos → Atajos personalizados → Añadir atajo**.
  Ponle nombre, pega el comando y pulsa después las teclas que quieras.
- **KDE Plasma 6:** **Preferencias del sistema → Teclado → Atajos → Añadir nuevo → Comando o script**, pega
  el comando y fija después el atajo.
- **KDE Plasma 5:** **Preferencias del sistema → Atajos → Atajos personalizados → Editar → Nuevo → Atajo global →
  Comando/URL**. Fija las teclas en **Disparador** y el comando en **Acción**.
- **Hyprland** 0.55 y posteriores, en `~/.config/hypr/hyprland.lua`:

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  En un `hyprland.conf` antiguo, la misma línea se escribe
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`.
  Hyprland toma las teclas antes que cualquier ventana, de modo que una pulsación abre o cierra el overlay una sola vez,
  sea cual sea el juego.
- **COSMIC:** **Ajustes → Dispositivos de entrada → Teclado → Atajos de teclado → Atajos personalizados → Añadir
  atajo**. Rellena **Nombre del atajo** y **Comando**, y escribe después las teclas. También funciona con un juego
  Wayland nativo. El ajuste **Atajos globales en aplicaciones X11** de COSMIC no ayuda: AW Next
  sigue sin ver las teclas ahí.

En Hyprland y COSMIC el overlay se muestra sobre un juego a pantalla completa, de Wine o Wayland nativo. Con
**Enfocar el overlay al abrirlo** activado (consulta la [guía del mando](controller.md)), ambos sacan el juego
de la pantalla completa para mostrarlo. En Hyprland, esta regla de ventana mantiene el juego a pantalla completa y el overlay
por encima:

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

Un mando también funciona. AW Next lee los gamepads directamente, así que los atajos de mando de la
[guía del mando](controller.md) abren y manejan el overlay sin quitarle nada al juego.
Mientras Steam Input se ejecuta, AW Next lee solo los mandos virtuales de Steam, de modo que una pulsación no se cuenta dos veces.

## Aviso del llavero {#keyring-prompt}

Los pocos secretos que guarda AW Next (tokens de inicio de sesión de Steam, Epic, Xbox y PlayStation, la clave de RetroAchievements,
una contraseña de Steam del emulador) se cifran con una clave que guarda el llavero de tu escritorio: GNOME Keyring
o KDE Wallet. Hyprland no tiene uno propio y usa el que esté instalado, que arranca cuando AW Next lo
pide por primera vez.

Con el **inicio de sesión automático**, el llavero no está desbloqueado cuando empieza tu sesión. La primera vez que AW Next
lo necesita, el escritorio te pide desbloquearlo, o crear uno si no hay ninguno; KDE abre el asistente de
KDE Wallet. Respóndele y AW Next continúa. Si cancelas, AW Next sigue funcionando, dice una vez que
tus conexiones no están protegidas y el escritorio vuelve a preguntar en el siguiente inicio. El aviso nunca bloquea la aplicación:
el seguimiento y las notificaciones funcionan mientras está abierto.

## Steam y Proton {#steam-and-proton}

AW Next encuentra el cliente de Steam, venga de tu distribución (`steam-installer`, `steam`),
de Flathub o como Snap, junto con sus carpetas de biblioteca en otros discos y el prefijo de Proton de cada juego.
Con dos clientes de Steam instalados, sigue al que se inició en último lugar.

Los desbloqueos de los juegos que ejecuta el propio Steam se leen de los archivos de Steam, como en Windows. AW Next solo los muestra
como popup cuando **Ajustes → Notificación → Juegos del cliente de Steam** está activado, ya que Steam muestra su propio popup para
ellos.

## Wine, Lutris, Heroic y Bottles {#wine-lutris-heroic-and-bottles}

Cada fuente se lee dentro del prefijo del juego, con su registro de Windows incluido: un juego con un emulador de
Steam (Goldberg, GBE Fork y los demás de [Fuentes compatibles](sources.md)), una partida de Ubisoft o GOG,
y así sucesivamente. La **Búsqueda inteligente** recorre tu carpeta personal, tus otros discos y todos los prefijos que conoce.

- **Lutris** y **Bottles**: los juegos y programas que instalaron se listan con su prefijo.
- **Heroic**: los juegos de Epic instalados mediante Heroic se reconocen como juegos de Epic.
- **Wine a secas**: el prefijo predeterminado `~/.wine` y cualquier carpeta de prefijo que añadas.
- Los **juegos nativos de Linux** con Goldberg o GBE Fork (`libsteam_api.so`) se leen de sus carpetas de partidas
  de Linux.

**Jugar** inicia un juego mediante el lanzador al que pertenece (Steam, Lutris, Heroic), y el tiempo de juego se
cuenta a partir del proceso del juego. Las reparaciones de emulador de [Game Health](game-health.md) funcionan desde el
AppImage y escriben dentro del prefijo del juego, con una copia de seguridad como siempre.

## Emuladores {#emulators}

RPCS3, shadPS4, RetroArch y Xenia se encuentran en sus carpetas de Linux; RPCS3 y shadPS4 también cuando
vienen de Flathub. Los desbloqueos de RetroAchievements se anuncian sea cual sea el emulador, una vez que la fuente
está conectada.

## Steam Deck {#steam-deck}

La compatibilidad con la Steam Deck es nueva y **no se ha comprobado en una Deck real**. Lo que se pretende que haga:

- En el **Modo Escritorio**, AW Next es el mismo AppImage que en cualquier escritorio de Linux. La primera ventana cabe en la
  pantalla de 1280x800 de la Deck, y los juegos de la tarjeta microSD se encuentran.
- Con **Iniciar con el sistema** activado, AW Next también se ejecuta en el **Modo Juego**: arranca como servicio
  en segundo plano cuando Steam está en marcha.
- El Modo Juego no muestra notificaciones de escritorio, así que AW Next dibuja cada desbloqueo como su propio popup sobre el
  juego, desde la esquina superior izquierda. La superposición de rendimiento de SteamOS puede ocultar ese popup.
- El **plugin de Decky** de la carpeta `decky/` del repositorio envía cada desbloqueo a las notificaciones propias de Steam,
  que el Modo Juego siempre dibuja. Mientras escucha, AW Next mantiene apagado su propio popup, de modo que
  ves una sola notificación. Sin el plugin, el popup es la alternativa. Por ahora lo instalas a
  mano: compílalo (`npm install` y después `npm run build`) y cópialo a
  `~/homebrew/plugins/achievement-watcher/`, como explica su
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md).
  Necesita AW Next en ejecución con su canal websocket activado, que es el valor predeterminado.

El popup se comprobó en una sesión de Modo Juego reproducida en un PC, y el plugin de Decky solo tiene pruebas
unitarias. Si pruebas cualquiera de los dos en una Deck real, una
[incidencia](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) contando lo que viste ayuda.

## Informar de un problema {#reporting-a-problem}

Incluye tu distribución, tu escritorio (GNOME o KDE, Wayland o X11), cómo se ejecuta el juego (Steam con Proton,
Lutris, Heroic, Bottles, Wine) y los archivos de `~/.config/Achievement Watcher Next/logs`.

---

**Siguiente:** [Solución de problemas](troubleshooting.md), para los problemas de detección, progreso, notificaciones y tiempo
de juego.

<div align="center">

[← Documentación](README.md) · [Primeros pasos](getting-started.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
