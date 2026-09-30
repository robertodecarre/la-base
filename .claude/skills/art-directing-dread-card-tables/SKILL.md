---
name: art-directing-dread-card-tables
description: Use when building or art-directing La Base (team card game with Spanish deck, 4/6/8 players, bids and bases) or any dark, eerie tabletop card game in 3D/WebGL/three.js — first-person seat at a table, other players visible live, Spanish deck (baraja española), or a look "like Buckshot Roulette / Inscryption / Sol Cesto / Slay the Spire / Loop Hero / Horripilant"; also when such a table looks generic (casino green felt), cards are illegible under retro post-processing, avatars vanish in the dark, or card-play animations look fake or teleport over the network.
---

# Mesa de terror: dirección de arte para juegos de cartas

## Overview

El look es una **mesa redonda bajo una sola lámpara, rodeada de negro**, donde sólo se leen tres cosas:
**cartas, máscaras y manos**. Cada juego de referencia aporta UNA capa; la suma es el estilo.
Complementa a `building-immersive-3d-websites` (stack three/Vite, shaders, perf) — acá no es un sitio de
scroll sino una app de juego.

**Juego: La Base.** Las reglas que la escena tiene que respetar están en `references/la-base.md` y **mandan sobre
cualquier supuesto de la demo** (que se armó para otro juego: 3 cartas fijas, bazas acumuladas, cantos).
El contrato entre escena y backend está en `references/mesa-contract.ts`: la escena es sólo vista, el servidor decide todo.

**Principio:** la oscuridad es el presupuesto. Todo lo que no es carta/máscara/mano se hunde en la
paleta oscura; lo que importa se ilumina y queda **por encima** del umbral de snap del post.

## La fusión (qué capa aporta cada juego)

| Capa | Fuente | Regla concreta |
|---|---|---|
| Escena y jugadores | Buckshot Roulette | máscaras + manos flotantes; cuerpo negro; HUD diegético (LED, tiza) |
| Luz y post | Inscryption | 1 lámpara; **snap sólo de oscuros** a paleta; 3D a resolución reducida (720p) + bloom en alta |
| Arte de la baraja | Sol Cesto (+ tarot Sola Busca) | tinta gruesa, stipple, soles con cara, figuras enmascaradas grotescas |
| Legibilidad / juice | Slay the Spire | índice ≥16% del alto, abanico, hover que levanta, feedback exagerado |
| Paleta y marcos | Loop Hero | nada fuera de `look.ts`; rojo `#602217` para dorsos; marcos de piedra en UI |
| Momentos | Horripilant | duotono con dither 1–2 s en momentos de La Base (kamikaze, As de Espadas mata al Ancho, As de Copas…), nunca permanente |

## Workflow

0. Leer `references/la-base.md` (reglas, fases, decisiones abiertas) y `references/mesa-contract.ts`.
1. Leer `references/moodboard.md` (y mirar `references/moodboard/*.jpg`; `0-demo-result.jpg` = resultado esperado).
2. Copiar la demo verificada: `cp -r ~/.claude/skills/art-directing-dread-card-tables/examples/mesa <proyecto> && npm i && npm run dev`
   (three r186, Vite 8, TS). Es la muestra jugable completa (mezclar, repartir, jugar con el brazo, juntar,
   zoom/pararse, audio real). **Ojo:** su lógica de juego (bots, 3 cartas, bazas que quedan en la mesa) es de otro
   juego y es local; para La Base se saca y la escena se maneja por el contrato. Params: `?n=4|6|8 ?auto=1 ?yaw ?pitch ?raw=1 ?low=<alto RT> ?debug=1`.
   Publicada como referencia: https://truco-mesa-muestra.vercel.app
3. Paleta: sólo tokens de `src/look.ts`. Agregar un color = justificarlo con una referencia.
4. Geometría: `references/table-avatars-camera.md` (mesa Ø1.8 m, alcance validado a la zona de juego y a la pila de bases).
5. Baraja: `references/spanish-deck.md` (pintas, dorso único, cara emisiva).
6. Gesto y red: `references/choreography-netcode.md` (identidad sólo en el reveal, temporizado por servidor).
7. Post y calibración: `references/post-look.md`. Verificar con `node shot.mjs '<url>?auto=1' <out> 6 20 30:t`
   (segundos de la partida; `seg:tecla` aprieta una tecla), comparar contra `?raw=1`, y correr
   `node test-drag.mjs` / `node test-view.mjs '<url>' <out>` (brazo, click corto, zoom al cursor, pararse)
   y mirar las capturas: todo lo legible en raw debe seguir legible con post.
8. Presencia, audio y cierre: `references/presence-audio-quality.md` (terror 90/9/1, utilería rioplatense,
   audio por fase, chequeo de originalidad, máquina de estados, checklist final antes de dar algo por terminado).

## Quick reference

| Tema | Valor |
|---|---|
| Mesa / zona de juego | r 0.90 · una sola base en juego en r 0.66 · pila de bases ganadas frente a cada uno · alcance ≤0.75 m |
| Cámara | ojo y 1.27, FOV 58; giro máx = ángulo al vecino − 0.2 rad (N=8 ±56°), pitch −0.8…0.25; sensibilidad 0.0012 rad/px; el click que toma la vista la suelta |
| Leer cartas | clic der = zoom **al cursor** (no sólo al centro); si el punto cae en la mitad lejana de la mesa, la cámara local **se para** (+0.48 m, +0.32 m sobre la mesa, FOV 20). Sólo local, no se transmite |
| Luz | SpotLight ámbar única con sombra + PointLight rebote del paño (uplight) |
| Post | **720p** · ACES 1.4 · snap oscuros 0.12 · Bayer 0.3 · 24 niveles · CA 0.003 · grano 0.035@12fps (360p resultó demasiado pixelado para el usuario) |
| Avatares remotos | 15 fps "stop-motion"; cabeza sigue la carta en vuelo; señas en máscara articulada |
| Carta | 61×95 mm ×1.5, textura 320×500, cara emisiva 0.18–0.25, dorso único simétrico; ojo a y 1.27 |
| Brazo propio | lo controla el jugador: mantener click + arrastrar (adelante/atrás = estirar/contraer, permite amagar); juega SÓLO si suelta sobre el recuadro; abanico en mano izquierda, baja al arrastrar |
| Audio | grabaciones reales CC0 (Kenney Casino Audio) + HRTF + reverb corta de madera; **nunca** camas de ruido blanco |
| Señas | ~20 gestos como datos · señas 150 ms · reacciones 2 s · **fuera** del muestreo a 15 fps |
| Terror | 90% normal · 9% raro · 1% muy mal; nunca durante reveal ni momento |

## Common mistakes (todos vistos al construir y testear la skill)

- **Mesa gigante** (Ø2.5 m) → IK estirado, brazos rotos. Diseñar desde el alcance sentado y validarlo en código.
- **Paño verde casino / colores de equipo saturados** → se ve genérico. Paño oliva Buckshot, equipos en tiza + puño.
- **Posterizar todo parejo** → cartas sucias e ilegibles. Snap sólo de oscuros; brillos con posterizado suave.
- **Umbral de snap alto (0.2)** → máscaras y manos desaparecen. Uplight del paño + umbral 0.12, verificar contra `?raw=1`.
- **Bloom con umbral LDR sobre RT HDR** → pantalla lavada. Umbrales ≥1.0 lineal.
- **Lámpara fuerte** → paño crema, cartas sin contraste. La cara de la carta es lo más brillante.
- **Caras/máscaras lisas** → las señas no se pueden hacer. La cara tiene que poder hacer los ~20 gestos de La Base, legibles en 150 ms.
- **Gestos muestreados a 15 fps** → una seña de 150 ms dura 2 cuadros y se pierde. Los gestos van a fps completos.
- **Lógica de juego en la escena** (turnos, validación, reparto con azar local) → trampa y duplicación. Todo eso es del servidor.
- **Revelar al final de la base** → contradice el gesto pedido; se revela al apoyar, hacia el centro.
- **Mandar la identidad con `playStart`** o manos ajenas "para animar" → trampa trivial. Reveal temporizado por servidor.
- **Brillo/foil/desgaste en dorsos de cartas con efecto** (Ancho de Bastos, ases especiales) o diferencias entre las dos copias del mazo doble → cartas marcadas. Dorso único, sin info.
- **Cabeza que sólo gira en ciertos estados** (queja real de Buckshot multi) → sincronizar mirada siempre.
- **Avatares remotos a 60 fps suaves** → se ven como maniquíes de motor. 15 fps stepped; cámara propia fluida.
- **Dejar las bases resueltas sobre el paño** → en La Base el ganador se lleva las cartas a su pila. Sobre la mesa hay una sola base a la vez.
- **Abanico fijo de 3** → la mano va de 1 a 10 cartas según la estructura de la partida.
- **Copiar la referencia en vez de su principio** (máscaras de Buckshot, soles de Sol Cesto tal cual) → parece un mod. Test de originalidad en presence-audio-quality.md.
- **Sólo click o sólo arrastre** → ambos: click corto (<0.18 s, <6 px) juega con el gesto automático; mantener = el brazo lo mueve el jugador (amagues) y juega al soltar sobre la zona.
- **Pie de mesa con tapa coplanar al paño** → z-fighting: mancha oscura en el centro. Terminar el pedestal 2 cm por debajo.
- **Abanico propio al centro** → tapa tu propia zona de juego. Mano izquierda, a un costado.
- **Foley sintetizado con ruido** → suena mal y el fondo cansa. Samples reales, variación de pitch, silencio.
- Humanos de cajas en producción → skill `modeling-3d-human-characters` para brazos/manos reales.

Fuera de alcance (resolver aparte): controles táctiles (decisión abierta, ver la-base.md), bots, lobby/espectadores (ya existen en La Base, en React). Para reglas de seguridad del servidor: skill `security-review`.
