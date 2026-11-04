---
title: "Guía del mando"
description: "Maneja Achievement Watcher Next y su overlay en el juego con un mando de Xbox, PlayStation o Switch, y siente un desbloqueo mediante la vibración."
---

# Guía del mando (gamepad)

Un gamepad puede manejar dos lugares distintos: la ventana principal y el overlay en el juego. Ambos se configuran en
**Ajustes → Mando**.

<div align="center">
<picture><source srcset="../assets/shot/controller-panel-800.webp 800w, ../assets/shot/controller-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/controller-panel.png" width="720" height="529" alt="Ajustes - Mando"></picture><br>
<sub>Navegación por el overlay y la aplicación, diseño y asignación de botones por atajo</sub>
</div>

## Los dos interruptores {#the-two-switches}

| Ajuste | Predeterminado | Qué cubre |
|---|---|---|
| **Controlar la app con el mando** | Activado | La ventana principal de AW Next: biblioteca, detalles de los juegos, ajustes y búsquedas. |
| **Controlar el overlay en el juego con un mando** | Desactivado | El overlay en el juego, manejado por el rastreador en segundo plano mientras juegas. |

La navegación por la aplicación es una simple entrada de ventana y no cuesta nada, así que está activada por defecto. El control del overlay carga
la pila nativa del mando en el rastreador en segundo plano, por lo que es opcional.

## Atajos de un vistazo {#shortcuts-at-a-glance}

Los nombres de los botones usan el vocabulario de Xbox; la aplicación los muestra en el diseño que selecciones.

<div align="center">
<img src="../assets/img/controller-map.svg" width="700" height="422" alt="Un gamepad con los atajos predeterminados: LT abre Game Health, RT lanza el juego, LB y RB cambian de pestaña de ajustes, la cruceta mueve el foco, A confirma, B cancela, X busca, Y y Start abren los Ajustes, además de las tres combinaciones del overlay" loading="lazy">
</div>

| Atajo | Predeterminado | Dónde |
|---|---|---|
| Abrir / cerrar el overlay | **Back + Start + LB** | En el juego |
| Activar la navegación del overlay | **LB + X** | Overlay abierto |
| Mover y desplazar el overlay | **LB + RB** (mantenidos) | Overlay abierto |
| Confirmar | **A** | Aplicación + overlay |
| Atrás / cancelar | **B** | Aplicación + overlay |
| Poner el foco en el cuadro de búsqueda | **X** | Aplicación + overlay |
| Abrir los Ajustes / las opciones del overlay | **Y** | Aplicación + overlay |
| Abrir los Ajustes | **Start** | Aplicación |
| Lanzar el juego seleccionado | **RT** | Aplicación, biblioteca |
| Abrir Game Health del juego seleccionado | **LT** | Aplicación, biblioteca |
| Pestaña anterior / siguiente de los ajustes | **LB** / **RB** | Aplicación, Ajustes abiertos |
| Desplazar la página | **LB** / **RB** | Aplicación, Ajustes cerrados |

El atajo del overlay usa tres botones para que no se dispare por accidente en plena partida. Todos los atajos del overlay
son configurables y admiten de uno a tres botones.

En la biblioteca, el stick se mueve entre los recuadros y **A** abre el juego, como un clic. Los dos
controles pintados en un recuadro corresponden a los gatillos: **RT** lanza el juego seleccionado y **LT** abre
su panel Game Health. Ambos no hacen nada si no hay un recuadro de la biblioteca seleccionado.

## Opciones {#options}

- **Diseño de mando**: el vocabulario de las indicaciones y de los nombres de los botones. **Auto** sigue al mando conectado
  cuando se puede identificar; los demás son **Xbox**, **PlayStation** y **Switch**.
- **Backend del mando**: **Auto** elige el mejor backend de entrada disponible, **XInput** es el más
  compatible y **GameInput** encaja con las versiones más recientes de Windows.
- **Asignaciones**: de uno a tres botones por atajo. Los atajos pueden compartir un botón (los predeterminados lo hacen:
  **LB + X** y **LB + RB** usan ambos LB), y la capa de entrada se asegura de que mantener una combinación no
  dispare la otra. Un botón repetido dentro de una asignación cuenta una vez. El atajo del overlay también admite
  el botón **Guide**; los dos modos del overlay no, porque la API de gamepad del navegador que los lee
  no lo notifica de forma fiable.
- **Enfocar el overlay al abrirlo**: da al overlay el foco del teclado, lo que pausa muchos juegos que
  pierden el foco. Desactivado por defecto.
- **Enviar Escape al juego al abrir con el mando**: envía una pulsación de la tecla Escape al juego que tiene el foco
  justo antes de que se abra el overlay, de modo que muchos juegos se pausan o abren su menú. Solo se ejecuta en las aperturas
  provocadas con el mando mientras un juego está en ejecución, nunca con el atajo de teclado. Desactivado por defecto.

## Ventana de la aplicación {#app-window}

Con la navegación por la aplicación activada, pulsar cualquier botón del gamepad en la ventana principal muestra un anillo de foco. La
cruceta o el stick izquierdo se mueve entre los controles, y se aplican los atajos de arriba. Dos detalles:

- **B** primero sale de un campo de texto con foco y después retrocede o cancela, así que puedes salir del cuadro de búsqueda
  sin el ratón.
- **LB** / **RB** cambian de pestaña de ajustes mientras los Ajustes están abiertos y desplazan la página cuando están cerrados.

Mover el ratón o pulsar una tecla del teclado devuelve el control al ratón y al teclado.

## Overlay en el juego {#in-game-overlay}

**Back + Start + LB** abre o cierra el overlay sobre el juego en ejecución. **LB + X** activa entonces
el modo de navegación: la cruceta o el stick izquierdo mueve el anillo de foco, **A** confirma, **B** cancela, **X**
pone el foco en la búsqueda e **Y** abre el panel de opciones. Mantener **LB + RB** mueve el overlay con el
stick izquierdo y desplaza la lista con el stick derecho.

Una pequeña insignia **UI** aparece en la cabecera mientras la navegación está activa, y la barra de ayuda muestra tus propias
asignaciones y tu diseño. El resto del overlay está en la [guía del overlay](overlay.md).

> [!IMPORTANT]
> Windows no permite que una aplicación de terceros capture un mando de forma exclusiva, así que el juego puede seguir
> recibiendo las pulsaciones de botones mientras el overlay está abierto. Para que el juego se pause, activa **Enfocar el overlay
> al abrirlo** (la mayoría de los juegos se pausan al perder el foco) o **Enviar Escape al juego al abrir
> con el mando**.

## Mandos compatibles {#supported-pads}

Se admiten los mandos de Xbox, los DualShock 4 / DualSense de PlayStation y los mandos Switch Pro. Los mandos de Xbox
pasan por XInput; los de PlayStation y Switch se leen por HID sin procesar, así que no necesitan ningún controlador
del fabricante.

## Cuando no se detecta un mando {#when-a-controller-is-not-detected}

1. Confirma que está activado el interruptor correcto: la navegación por la aplicación y el control del overlay son independientes.
2. Prueba el backend **XInput** de forma explícita; **Auto** puede elegir GameInput en una compilación donde un mando concreto
   no se enumera.
3. Comprueba el mando en el panel de dispositivos de juego de Windows (`joy.cpl`). Si Windows no lo ve, AW Next
   tampoco puede verlo.
4. Para un informe de error, añade `debugLogging = true` a la sección `[controller]` de
   `%APPDATA%\Achievement Watcher Next\cfg\options.ini` y reinicia. El rastreador en segundo plano registrará entonces
   diagnósticos a nivel de botón. No hay interruptor en la interfaz porque la salida es muy detallada; desactívalo
   después.

---

**Siguiente:** [Game Health](game-health.md) - el panel por juego que dice por qué un juego se rastrea o
no.

<div align="center">

[← Documentación](README.md) · [Guía del overlay](overlay.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## En Linux {#on-linux}

En Linux, AW Next lee los gamepads de los dispositivos de entrada del kernel, y los atajos de arriba funcionan igual.
Mientras Steam Input se ejecuta, solo lee los mandos virtuales de Steam, de modo que una pulsación no se cuenta dos veces. El
Steam Deck y el plugin de Decky se tratan en [Linux y Steam Deck](linux.md#steam-deck).
