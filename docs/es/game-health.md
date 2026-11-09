---
title: "Game Health"
description: "El informe por juego que explica por qué un juego se rastrea o no, con las reparaciones guiadas que se aplican a su caso."
---

# Game Health

Cuando un juego falla, abre primero su panel **Game Health**. Dice si AW Next puede ver el
juego, leer sus logros y anunciar sus desbloqueos, y ofrece solo las reparaciones que se aplican.

Ábrelo con el botón de **herramientas** de la esquina superior derecha de un recuadro de juego, o desde el menú de clic derecho
del juego. El panel tiene tres pestañas: **Estado**, **Ejecutable**, que fija el programa que se vigila mientras
juegas, y **Notificación**, donde el juego puede tener su propio preset de popup, posición,
sonido y escala (consulta [Comportamiento por juego](notifications.md#per-game-behavior)).

<div align="center">
<picture><source srcset="../assets/shot/game-health-800.webp 800w, ../assets/shot/game-health.webp 903w" sizes="(max-width: 700px) 100vw, 620px"><img src="../screenshot/game-health.png" width="620" height="557" alt="El panel Game Health con un estado Requiere atención, sus comprobaciones y las reparaciones que se aplican"></picture><br>
<sub>Un estado, su motivo, las comprobaciones que lo respaldan y las reparaciones que se aplican</sub>
</div>

## Los tres estados {#the-three-states}

| Estado | Qué significa |
|---|---|
| **Listo** | El juego está detectado, sus datos de logros están disponibles y AW Next lo vigila para detectar desbloqueos. |
| **Requiere atención** | El juego funciona, pero parte de su configuración está incompleta. Las comprobaciones muestran cuál. |
| **Sin seguimiento** | Falta algo esencial, así que no se puede registrar ningún desbloqueo: el juego no se puede localizar, no tiene datos de logros o le falta el emulador que escribe sus desbloqueos. |

La frase bajo el estado da la causa, las comprobaciones muestran qué parte falla y un botón de reparación actúa
exactamente sobre eso.

- El modo **Simple** expresa los resultados con palabras sencillas (*Datos de logros encontrados*, *Se detecta al arrancar el juego*).
  **Avanzado** añade recuentos exactos, el proceso vigilado y el canal de notificación.
- Los **Detalles técnicos**, al final en ambos modos, contienen cada valor en bruto. Pulsa **Copiar** para un informe
  de error. Un valor largo se desplaza al pasar el ratón.

A los juegos de emuladores de consola no se les pide un ejecutable de Windows ni archivos del juego.

Algunos juegos no registran nada sin conexión, sea cual sea la configuración. En Halo: Campaign Evolved y The Crew
Motorfest los logros los concede el servidor del editor, así que un crack no guarda ninguno. Su
panel lo dice desde el primer inicio.

## Las comprobaciones {#the-checks}

| Comprobación | A qué responde | Arreglo habitual |
|---|---|---|
| **Archivos del juego** | ¿Sigue ahí la carpeta de instalación? | **Localizar el juego** |
| **Ejecutable** | ¿Qué programa hay que vigilar mientras juegas? | **Localizar el juego** |
| **Identidad del juego** | ¿Con qué AppID y plataforma se emparejó este juego? El modo Simple la omite. | **Corregir el archivo de identificación del juego** o **Definir el AppID manualmente** |
| **Datos de logros** | ¿Hay una lista de logros y está completa? | **Reescribir los datos de logros** |
| **Configuración del emulador** | ¿Tiene un juego que necesita un emulador de Steam alguno, y cuál lo atiende? En un juego de Ubisoft esto abarca también el cargador de Uplay y si alguna vez pidió un logro. | **Instalar el archivo del emulador**, **Cambiar al emulador compatible** o **Reparar los logros de Ubisoft** |
| **Progreso** | ¿Se ha encontrado ya algún desbloqueo o partida guardada? | Inicia el juego y desbloquea algo |
| **Contadores de progreso** | En los juegos al estilo CODEX/RUNE que rastrean una estadística en lugar de un desbloqueo simple, ¿ha obtenido AW Next la estadística que hay tras cada logro? Se muestra solo para los juegos que usan una. | **Obtener contadores de progreso** |
| **Detección del inicio del juego** | ¿Nota el rastreador en segundo plano cuándo arranca este juego? Por sí solo no registra ningún desbloqueo: eso es trabajo del emulador. | **Vigilar este juego** |
| **Notificaciones** | ¿Qué canal entregó la última notificación de este juego y por qué? | **Enviar una notificación de prueba** |

## Las reparaciones {#the-repairs}

El panel muestra solo las reparaciones que pueden arreglar este juego. Cada una dice qué va a cambiar y dónde se
guardan los archivos anteriores. No se reescribe nada sin copia de seguridad o confirmación.

| Reparación | Qué hace |
|---|---|
| **Localizar el juego** | Abre un selector para elegir el ejecutable que se vigilará. |
| **Abrir la carpeta del juego** | Abre la carpeta de instalación en el Explorador. |
| **Reescribir los datos de logros** | Escribe la lista de logros, los iconos y la configuración del emulador, copiando antes los archivos existentes en una copia de seguridad. |
| **Instalar el archivo del emulador** | Descarga la versión compatible del emulador en la carpeta del juego y conserva el archivo que sustituye como `.bak`. |
| **Cambiar al emulador compatible** | Para un juego atendido por otro crack que no registró nada: instala encima el emulador compatible y renombra a `.bak` la configuración de ese crack. |
| **Deshacer el cambio de emulador** | Aparece allí donde se ejecutó una de las dos anteriores. Devuelve los archivos propios del juego desde sus copias `.bak` y quita el emulador compatible. |
| **Corregir el archivo de identificación del juego** | Reescribe `steam_appid.txt` cuando el emulador anuncia un juego y AW Next emparejó otro. Pide el AppID correcto, sugiriendo la coincidencia de AW Next, y conserva el archivo anterior. |
| **Obtener contadores de progreso** | Pregunta a Steam qué estadística impulsa cada logro, para juegos al estilo CODEX/RUNE. No escribe nada en la carpeta del juego. |
| **Reparar los logros de Ubisoft** | En un juego de Ubisoft compatible, reescribe la configuración del cargador, el esquema y la redirección de partidas en una sola transacción, con copia de seguridad de cada archivo tocado. Consulta [Configuración de Uplay](uplay-r2.md). |
| **Activar los logros sin conexión** | Para un juego de Ubisoft cuyo registro del cargador demuestra que nunca pidió un logro porque cree que no ha iniciado sesión. Añade una clave de sesión de relleno al INI junto al juego; púlsalo de nuevo para quitarla. Consulta [Configuración de Uplay](uplay-r2.md#a-game-that-never-asks-for-an-achievement). |
| **Vigilar este juego** | Añade el juego al rastreador en segundo plano para que se registren el tiempo de juego y los desbloqueos en directo. |
| **Reactivar notificaciones de progreso** | Vuelve a activar las notificaciones de progreso de un juego que habías silenciado. |
| **Enviar una notificación de prueba** | Lanza una notificación con el nombre y el arte de este juego, por el canal que usaría de verdad. |

> [!IMPORTANT]
> Una discrepancia no siempre es culpa del emulador: si se configuró a propósito para el ID que hay en el disco,
> déjalo como está. **Definir el AppID manualmente** (clic derecho) arregla para siempre una discrepancia en el nombre de la carpeta en lugar
> de corregir el archivo cada vez. Consulta [Configuración de Goldberg / GBE](emulator-setup.md#set-appid-manually).

## Estados habituales y qué hacer {#common-states-and-what-to-do}

| El panel dice | Qué suele significar |
|---|---|
| *No se encontró ninguna lista de logros* | El juego no tiene logros, o su fuente está desactivada. Revisa **Ajustes → Fuentes**. |
| *Este juego necesita un emulador de Steam y no hay ninguno configurado* | Usa **Aplicar arreglo de emulador** en el menú de clic derecho. Consulta [Configuración de Goldberg / GBE](emulator-setup.md). |
| *Falta el archivo del emulador que la lee* | **Instalar el archivo del emulador** pone el entorno de ejecución correspondiente. |
| *ColdClient sirve este juego, pero…* | `ColdClientLoader.ini`, junto al loader, arranca un archivo que falta u otro programa, nombra otro juego o no tiene loader para los 32 o 64 bits del juego. Corrige ese archivo; AW Next solo lo lee. Cuando esté bien, **Iniciar mediante el loader ColdClient** hace que Jugar arranque el loader. |
| *El emulador de Epic aún tiene el AppID de ejemplo* | `NemirtingasEpicEmu.json` contiene el AppID formado por ceros, o el propio archivo EOSSDK de Epic sigue en su sitio, así que el emulador nunca se carga. Pon el id de Epic del juego en el archivo. |
| *La lista de logros no coincide con lo que buscará el juego* | **Reescribir los datos de logros**. Es el resultado habitual de una actualización de un repack. |
| *Aún no se ha encontrado progreso de logros* | Normal en un juego al que no has jugado desde que lo configuraste. Inícialo y desbloquea algo. |
| *AW Next no vigila este juego mientras se ejecuta* | **Vigilar este juego** lo añade al rastreador. |
| *No se pudo enviar la última notificación* | Envía una notificación de prueba y consulta después [Notificaciones](notifications.md#if-a-test-or-unlock-does-not-appear). |
| *Windows ocultó la última notificación durante el juego* | Fue directamente al Centro de notificaciones porque el juego estaba a pantalla completa o No molestar estaba activado. Activa las [Notificaciones prioritarias](notifications.md#priority-windows-notifications), o usa Automático u Overlay en el juego. |
| *Funcionando - respaldo de Windows activo* | No es un fallo. La entrega Automática eligió una notificación de Windows para este juego; consulta [cómo decide Automático](notifications.md#how-automatic-decides). |
| *El juego nunca ha pedido un logro* | Lee su sesión vacía de Ubisoft como sin iniciar sesión. **Activar los logros sin conexión** lo desbloquea; no se envía nada a ninguna parte. Inicia el juego una vez después. |
| *Logros sin conexión activados, abre el juego una vez* | El ajuste está escrito y todavía no se ha juzgado nada. El botón de al lado dice ahora **Desactivar los logros sin conexión**. |
| *Gestionado por ALI213, OnlineFix, GBE Fork…* | El emulador que realmente lee ese juego, nombrado a partir de sus propios archivos. A un juego de Ubisoft atendido así no se le ofrece una reparación de Uplay: su capa de Uplay está sin usar, no rota. Esto abarca las versiones que conservan el `steam_api64.dll` de Valve: una compilación de RUNE que se ejecuta desde `Steam\steamclient64.dll`, o una versión de VOICES38 que carga su propio GBE Fork renombrado (`steam_api64.v38`); no instales nunca el emulador sobre esta última. Se reconocen las compilaciones de Ubisoft de online-fix, y allí una corrección de logros avisa de que el juego en línea puede dejar de funcionar. |
| *Solo faltan algunos iconos* | **Reescribir los datos de logros** descarga los iconos que faltan. |
| *Más de una hora de juego y ni un solo logro registrado* | Lo más probable es que el crack que atiende el juego nunca informe de logros. Usa **Cambiar al emulador compatible** cuando se ofrezca; si no, comprueba que el juego arranca desde su propia carpeta. |
| *Archivo de identificación del juego*, con un acceso directo de Steam a este juego | Steam inicia un acceso directo que no es de Steam sin `steam_appid.txt` al lado, así que el emulador guarda con otro ID. **Reescribir los datos de logros** escribe allí el archivo. |

---

**Siguiente:** [Solución de problemas](troubleshooting.md) - para los problemas que Game Health no resuelve por sí solo.

<div align="center">

[← Documentación](README.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
