---
title: "Lista de logros en el juego (overlay)"
description: "La lista de logros en el juego que se abre con Ctrl+Mayús+K: búsqueda, filtros, rareza, descripciones ocultas y personalización."
---

# Lista de logros en el juego (overlay)

El overlay en el juego (`Ctrl+Mayús+K` por defecto mientras se ejecuta un juego compatible) muestra la lista de logros
del juego en ejecución sin salir de él: nombres, descripciones, estado de bloqueo, fechas de desbloqueo y
progreso. Arrástralo por su cabecera; permanece sobre el juego. En Linux, un juego que se ejecuta de forma nativa
en Wayland no transmite el atajo: asigna en su lugar `~/.local/bin/achievement-watcher --toggle-overlay`
a una tecla, como muestra [Atajo del overlay](linux.md#overlay-shortcut).

<div align="center">
<picture><source srcset="../assets/shot/overlay.webp 569w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/overlay.png" width="360" height="633" alt="Lista de logros del overlay en el juego"></picture><br>
<sub>Columnas de estado, rareza y fecha, con búsqueda y filtros</sub>
</div>

## ¿Cómo abro la lista de logros dentro de un juego? {#how-do-i-open-the-achievement-list-in-a-game}

Pulsa `Ctrl+Mayús+K` mientras se ejecuta un juego compatible. Es el atajo predeterminado. El overlay lista todos los
logros de ese juego con su estado, fecha de desbloqueo, rareza y progreso, y puedes buscar en él.
Vuelve a pulsar el atajo para cerrarlo. Con un mando, el predeterminado es **Back + Start + LB**.

En Linux con Wayland, un juego que se ejecuta como ventana nativa de Wayland nunca pasa la tecla a AW Next.
Asigna en su lugar `~/.local/bin/achievement-watcher --toggle-overlay` a una tecla en los ajustes de teclado
de tu escritorio. Consulta [Atajo del overlay](linux.md#overlay-shortcut).

## ¿Es el overlay lo mismo que el popup de desbloqueo? {#is-the-overlay-the-same-as-the-unlock-popup}

No. El popup es una notificación puntual que aparece cuando se desbloquea algo, con el estilo de un preset (consulta
[Notificaciones](notifications.md)). El overlay es la lista completa de un juego, que abres tú, y
permanece hasta que lo cierras.

## Qué muestra {#what-it-shows}

- Una barra de estadísticas con `desbloqueados / total` y el porcentaje de completado.
- Una fila por logro con una pastilla de estado de color (`Desbloqueado` / `Bloqueado`), la fecha de desbloqueo de los
  logros conseguidos y una barra de progreso con una etiqueta `actual / máx` para los logros de progreso.
- Una insignia de rareza (`★ 12.3%`) para cada logro con tasa de desbloqueo conocida. Los logros comunes usan
  una insignia gris oscuro; los raros usan oro, plata y bronce con un halo suave, al 5 %, 10 % y 15 %
  por defecto. **Ajustes → General → Visualización de la rareza** cambia los niveles o pasa a los grados de trofeo.

## Logros ocultos {#hidden-achievements}

El overlay no destripa un logro oculto que no has desbloqueado: como en la ventana principal, su
descripción dice *Oculto - haz clic para revelar*. Haz clic en ella, o pulsa **A** en un mando, para revelar
esa descripción. La búsqueda ignora las descripciones que siguen enmascaradas.

<div align="center">
<picture><source srcset="../assets/shot/overlay-hidden-800.webp 800w, ../assets/shot/overlay-hidden.webp 1162w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/overlay-hidden.png" width="560" height="482" alt="La lista del overlay dos veces: descripciones ocultas enmascaradas y después una revelada" loading="lazy" decoding="async"></picture><br>
<sub>Antes y después de hacer clic en «We've all been there before...»: solo se revela esa descripción</sub>
</div>

## Búsqueda y filtros {#search-and-filters}

- El cuadro de búsqueda filtra las filas por nombre y descripción del logro mientras escribes.
- Las pastillas sobre la lista alternan entre **Todos**, **Desbloqueados**, **Bloqueados** y **En curso**.
- Hacer clic en la cabecera de columna **Rareza**, **Fecha** o **Estado** ordena de forma ascendente, luego descendente
  y después vuelve al orden natural. Solo se ordena por una columna a la vez.
- `/` pone el foco en el cuadro de búsqueda. `Esc` lo vacía, o cierra el panel de opciones si está abierto.

## Mando (gamepad) {#controller-gamepad}

Activa **Controlar el overlay en el juego con un mando** en **Ajustes → Mando** para manejar el
overlay con un gamepad. Con las asignaciones predeterminadas:

- **Back + Start + LB** abre o cierra el overlay.
- **LB + X** activa o desactiva el modo de navegación: un anillo de foco muestra dónde estás y una pequeña insignia **UI**
  aparece en la cabecera del overlay.
- En el modo de navegación, la cruceta o el stick izquierdo mueve el foco, **A** confirma, **B** cancela, **X**
  pone el foco en la búsqueda e **Y** abre el panel de opciones.
- Mantener **LB + RB** mueve el overlay con el stick izquierdo y desplaza la lista con el stick
  derecho.

Cada atajo es configurable, los nombres de los botones siguen el diseño que elijas y la barra de ayuda del overlay
muestra tus propias asignaciones. La [guía del mando](controller.md) cubre los ajustes, los mandos compatibles
y la salvedad de Windows sobre que el juego sigue viendo tus pulsaciones de botones.

## Personalización {#customization}

El botón **⚙** de la cabecera del overlay abre las opciones:

- **Acento**: cinco colores predefinidos, un selector de color libre, o **Usar el tema de la app** para seguir el tema de la
  ventana principal (se usa para el progreso, los filtros activos, los anillos de foco y el brillo de las filas desbloqueadas).
- **Densidad**: espaciado de filas Compacto, Cómodo o Espacioso.
- **Tamaño de iconos**: Pequeño, Mediano o Grande.
- **Zoom**: del 80 % al 125 % del tamaño del panel.
- **Opacidad**: del 40 % al 100 % del fondo del panel.
- **Interruptores de mostrar/ocultar** para la barra de estadísticas, las barras de progreso, las insignias de rareza y las descripciones.

Los cambios se aplican al instante y se guardan en local. **Restablecer** devuelve el aspecto original. Las
opciones funcionan con el teclado: los menús de zoom y opacidad muestran un anillo de foco, los interruptores se activan con
Tab y Espacio, y las animaciones siguen el ajuste de movimiento reducido del sistema.

## Atajos de teclado (overlay abierto) {#keyboard-shortcuts-overlay-open}

- `Ctrl+Alt+Mayús+Flechas` - mueve un poco la ventana del overlay.
- `Ctrl+Alt+Mayús+1` … `5` - la ajusta a una posición predefinida.
- `Ctrl+Alt+Mayús+C` - activa o desactiva el clic a través.

## Notas {#notes}

- El overlay sigue el idioma de interfaz elegido en la aplicación.
- Tras la primera apertura, la ventana del overlay se mantiene oculta y se reutiliza durante 5 minutos, así que volver a abrirlo
  es casi instantáneo. Mientras está oculta, pausa la lectura del mando, y tras 5 minutos de
  inactividad se libera la ventana para recuperar memoria.
- El contenido de las filas se escapa antes de renderizarse; los datos de los logros solo se muestran, nunca se ejecutan.
- La lista del overlay es independiente de los presets de *notificación* puntual del overlay (Ajustes →
  Notificación), donde se configura el aspecto del popup.

---

**Siguiente:** [Guía del mando](controller.md) - maneja el overlay y la aplicación con un gamepad.

<div align="center">

[← Documentación](README.md) · [Guía de notificaciones](notifications.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
