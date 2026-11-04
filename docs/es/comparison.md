---
title: "Cómo se compara AW Next"
description: "En qué se diferencia Achievement Watcher Next de Achievement Watcher 2.x y de la aplicación Achievements, función por función."
---

# Cómo se compara AW Next

Achievement Watcher Next es una alternativa al Achievement Watcher de Xan105 y su sucesor. Funciona
en Windows y Linux, lee partidas de Steam, GOG, Epic, Ubisoft, Xbox PC y emuladores de Steam, repara una
configuración de Goldberg o GBE Fork desde la aplicación y elige por sí mismo su canal de notificación. Achievements de
PSerban93 es el otro rastreador de Windows con desarrollo activo, y Sentinel es solo para Linux.

AW Next continúa [el Achievement Watcher original de Xan105](https://github.com/xan105/Achievement-Watcher)
y [la rama 2.x de darktakayanagi](https://github.com/darktakayanagi/Achievement-Watcher). Esta página lo
pone junto a esa línea, junto a [Achievements](https://github.com/PSerban93/Achievements), el otro
rastreador de Windows con desarrollo activo, y junto a [Sentinel](https://github.com/RemakeCode/sentinel), un
observador solo para Linux de partidas de emuladores de Steam.

Los cuatro leen bien los logros, así que la pregunta útil es qué extras encajan con tu forma de jugar. Las tablas
marcan lo que hace cada proyecto y lo que no.

Partes de AW Next derivan de Achievements bajo su licencia MIT, así que cuando una fila marca ambos
proyectos, a veces la implementación empezó siendo de JokerVerse. Consulta
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE).

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| Plataforma | Windows y Linux | Solo Windows | Solo Windows | Solo Linux |
| Licencia | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| Entorno de escritorio | Electron 44 | Electron 44 | Electron 12 | Go con GTK 4 y WebKitGTK 6 |
| Desarrollo | Activo | Activo (último push el 22 de octubre de 2026) | Archivado el 13 de octubre de 2026, solo lectura | Activo (v2.1.1, 11 de octubre de 2026) |

## De dónde salen los logros {#where-the-achievements-come-from}

| Fuente | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Bibliotecas locales oficiales | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · en Linux: Steam, Heroic, Lutris y Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (antiguo) | ❌ |
| Conexión de cuenta opcional | ✅ Steam (juegos en propiedad, juegos compartidos en familia, desbloqueos de tus otros PC) · Epic · Xbox (Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Partidas de emuladores de Steam | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · estructuras de CODEX/RUNE/EMPRESS/Online-Fix/Tenoke, también en Linux (prefijos de Wine, y nativo para Goldberg y GBE) | ✅ Cobertura comparable | ✅ Emuladores de Steam | ⚠️ Goldberg/GSE · CODEX · RUNE, en prefijos de Wine/Proton |
| Versiones portables sin configuración | ✅ El árbol de partidas se lee solo | ⚠️ Introducción manual | ❌ | ⚠️ Prefijos añadidos a mano |
| Goldberg Uplay R2 (Ubisoft) | ✅ Según la versión del cargador | ❌ | ❌ | ✅ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| Emuladores de consola | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ Solo RPCS3 | ❌ |
| Juegos de Xbox 360 recompilados para PC (ReXGlue y similares) | ✅ Lista, iconos, DLC y desbloqueos en directo, más de 60 adaptaciones conocidas, compilaciones para Linux | ✅ | ❌ | ❌ |
| Juegos de PS4 adaptados a PC | ✅ run.py, adaptaciones nativas y de un solo ejecutable, PROTOTYPE, PORTHEON (UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess, esquema, DLC e iconos leídos del juego | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ Juegos jugados importados, juegos encontrados en el disco mediante el historial o las listas de RetroArch, desbloqueos en directo con cualquier emulador | ✅ | ❌ | ❌ |
| Parches de nicho | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| Detección de carpetas | ✅ Configuración automática y Búsqueda inteligente | ✅ Configuración automática | ✅ Búsqueda inteligente | ⚠️ Vuelve a escanear los prefijos que añades |
| Carpetas personalizadas y juegos manuales | ✅ Por juego o biblioteca entera | ✅ Por juego | ⚠️ Configuración manual | ⚠️ Rutas de prefijo y de emulador |

AW Next y Achievements leen ahora prácticamente las mismas fuentes. AW Next llega más lejos en estructuras de PC
emulado y es el único de los cuatro que puede arreglar partidas de Uplay R2 y SocialClub.

## Cuando un juego no informa {#when-a-game-does-not-report}

Todos los rastreadores pueden decirte que un juego está atascado en 0 %. AW Next además intenta arreglarlo.

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Informe de estado por juego con reparaciones guiadas | ✅ | ❌ | ❌ | ❌ |
| Instalar y reparar el entorno de ejecución del emulador | ✅ Goldberg / GBE, esquemas incluidos | ⚠️ Generación de esquemas | ❌ Manual | ⚠️ Configuración en la medida de lo posible con el fork de Goldberg |
| Copia de seguridad y restauración antes de cualquier cambio | ✅ Además de Steamless y omisión opcional de la comprobación de API | ❌ | ❌ | ❌ |
| Restablecer o restaurar los logros de un juego | ✅ | ❌ | ❌ | ❌ |
| Desbloqueo manual | ✅ | ❌ | ❌ | ❌ |
| Fijar a mano el AppID de un juego | ✅ | ❌ | ❌ | ❌ |
| Fuente forzada por juego | ✅ Auto / Steam / Ubisoft | ❌ | ❌ | ⚠️ Una sola fuente de datos para toda la biblioteca |
| Lista negra y relleno de nombres sin conexión | ✅ | ⚠️ Lista negra | ❌ | ❌ |

## Notificaciones {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Canales | ✅ Toast nativo + overlay en el juego + fuente de navegador de OBS + toast de Steam en Modo Juego (plugin de Decky) | ✅ Toast nativo + overlay animado | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ Notificación de escritorio + plugin de Decky en Modo Juego |
| Elige su propio canal | ✅ Modo Automático, según el estado de cada juego | ❌ Elección fija | ❌ Elección fija | ❌ |
| Diseñador de presets, sin código | ✅ 14 plantillas de partida, vista previa en directo, 10 presets incluidos con Steam Original | ⚠️ Presets y temas integrados, los propios escritos en HTML/CSS | ❌ | ❌ |
| Presets compartibles | ✅ `.awpreset` + galería de la comunidad | ❌ | ❌ | ❌ |
| Estilo de rareza, platino y completado | ✅ Rareza de 3 niveles, barra de completado | ✅ Rareza | ❌ | ❌ |
| Presets por emulador | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| Sonidos | ✅ Elección aleatoria, FLAC/M4A/AAC | ✅ | ⚠️ Archivo personalizado | ✅ Sonidos personalizados |
| Capturas de pantalla | ✅ Captura con soporte HDR en Windows (mapeo de tonos BT.2408), también en Linux con X11 y Wayland | ✅ Captura HDR | ✅ | ❌ |
| Videoclips de un desbloqueo | ✅ 10-30 s, 30/60 FPS, H.264 · HEVC · AV1, mapeo de tonos HDR; en Linux, gpu-screen-recorder o el grabador WebM integrado | ✅ 10-30 s, 30/60 FPS | ⚠️ Mediante OBS | ❌ |
| Notificaciones de tiempo de juego y de progreso | ✅ Silenciar el progreso por juego | ✅ Silenciar el progreso por juego | ✅ Tiempo de juego | ✅ Progreso, en varios pasos |
| Aspecto de notificación propio por juego | ✅ Cada juego puede sustituir el preset, la posición, el sonido y la escala | ❌ | ❌ | ❌ |

## La aplicación en sí {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Búsqueda en la biblioteca, los juegos y los logros | ✅ | ✅ | ✅ | ⚠️ Ordenación de la biblioteca |
| Filtro de solo instalados y acciones sobre juegos | ✅ Filtro · desinstalar · restaurar | ⚠️ Filtro de plataforma | ❌ | ❌ |
| Navegación completa con mando | ✅ Aplicación + overlay, en Windows y Linux | ✅ Aplicación + overlay | ❌ Previsto | ⚠️ Mediante el plugin de Decky |
| Steam Deck | ⚠️ Plugin de Decky, aún sin confirmar en una Deck real | ❌ | ❌ | ✅ Plugin de Decky en Gamescope |
| Temas | ✅ Integrados + editor Personalizado + `.awtheme` compartible + galería | ✅ Integrados + archivos de tema de usuario | ❌ | ❌ |
| Idiomas de la interfaz | ✅ 28 incluidos | ✅ Unos 30 incluidos | ✅ 18 | ❌ |
| Proceso en segundo plano | ✅ Un único demonio en la bandeja | ✅ Aplicación en la bandeja | ⚠️ Watchdog aparte | ✅ Aplicación en la bandeja |
| Descargas adicionales de entorno de ejecución | ✅ Sin entorno de navegador; el fork de GBE se descarga solo cuando lo instalas o lo reparas | ⚠️ Chromium de Playwright | ✅ Ninguna | ⚠️ GTK 4 y WebKitGTK 6 del sistema |
| Acceso con teclado y lector de pantalla | ✅ Ajustes, diálogos y overlay accesibles con Tab, foco devuelto al cerrar un diálogo | ⚠️ Atajos de teclado y mapa del mando | ❌ | ❌ |
| Instalador, desinstalador y ventana de actualización | ✅ Instalador y desinstalador propios, ventana de actualización con notas de versión y progreso | ❌ | ❌ | ⚠️ Paquetes de distribución y Flatpak |
| Documentación | ✅ Guías, especificaciones de formatos y galerías | ⚠️ README | ⚠️ README | ⚠️ README y una guía de Goldberg |

## Linux y la Steam Deck {#linux-and-the-steam-deck}

AW Next también se distribuye como aplicación nativa de Linux (AppImage x64, nunca a través de Wine). Sigue los juegos ejecutados
con Steam y Proton, Wine, Lutris, Heroic y Bottles, y los juegos nativos de Linux, con los mismos
popups, overlay y tiempo de juego que en Windows. La compatibilidad con la Steam Deck es nueva: las notificaciones del Modo Juego pasan
por el plugin de Decky del repositorio, y ni el plugin ni el popup del Modo Juego se han
confirmado en una Deck real.

<sub>✅ = compatible y documentado · ⚠️ = parcial, manual o un flujo de trabajo distinto · ❌ = no disponible o
no documentado en la rama pública actual. Las columnas de la competencia se compararon con sus README
públicos, metadatos de GitHub y manifiestos de paquetes el 22 de octubre de 2026. La columna de AW Next refleja la versión
3.12.2 y los cambios sin publicar de octubre de 2026. Un ❌ en otra columna suele significar no documentado
en lugar de imposible, y todos estos proyectos avanzan rápido.</sub>

## Hydra y Steam Achievement Manager {#hydra-and-steam-achievement-manager}

Otras dos herramientas aparecen en las mismas búsquedas, y hacen un trabajo distinto.

- [Hydra](https://hydralauncher.gg/) se describe como un lanzador de juegos que permite descargar juegos
  y rastrear logros. AW Next no descarga juegos.
- [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) se describe como una
  aplicación ligera y portable para gestionar logros y estadísticas en Steam. Necesita el
  cliente de Steam, una cuenta de Steam y acceso a la red. AW Next muestra y rastrea logros y no necesita
  ninguna cuenta de Steam.

Ninguna de las dos está en las tablas de arriba, que comparan los rastreadores que leen partidas locales y de emuladores.

## En resumen {#in-short}

**AW Next** encaja con una biblioteca que tiene que seguir funcionando en Windows y Linux: lanzadores oficiales y
partidas emuladas a la vez, un informe de estado que repara una configuración de Goldberg o GBE en lugar de
limitarse a informar, notificaciones que eligen su propio canal, y presets y temas que puedes diseñar y
compartir.

**Achievements** tiene una amplia lista de fuentes en Windows, incluidos RetroAchievements, adaptaciones recompiladas y
parches de nicho, con una buena configuración automática, un overlay animado y videoclips de un desbloqueo.

**Achievement Watcher 2.x** es la base histórica, con amplia compatibilidad de emuladores y canales de
notificación heredados sobre Electron 12. Su repositorio se archivó el 13 de octubre de 2026 y ya no se
mantiene.

**Sentinel** es una opción ligera para Linux con partidas de Goldberg, CODEX y RUNE, con un plugin para Steam Deck
bien integrado.

---

<div align="center">

[← Documentación](README.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
