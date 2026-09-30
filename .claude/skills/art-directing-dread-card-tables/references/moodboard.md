# Moodboard: qué robar de cada juego (en orden de peso)

Imágenes en `moodboard/` (screenshots de Steam + un frame cada 4 s de los trailers oficiales).
Regla: de cada juego se roba **una capa**, no el juego entero. La suma de capas es el look.

| # | Juego | Capa que aporta | Lo que NO se copia |
|---|---|---|---|
| 1 | Buckshot Roulette | Escena, luz, jugadores enmascarados con manos flotantes, HUD diegético | La escopeta, el tono rave, el verde LED por todos lados |
| 2 | Inscryption | Oscuridad total + shader que sólo cuantiza oscuros; cartas como objeto físico; anfitrión que es sólo ojos/manos | El texto amarillo-naranja en pantalla sobre todo |
| 3 | Sol Cesto | Lenguaje gráfico de la baraja: tinta gruesa, stipple, grotesco medieval-mesoamericano, soles con cara, dientes | Los paneles laterales de UI, el tablero de grilla |
| 4 | Slay the Spire | Legibilidad y "juice" de la carta: jerarquía, abanico, hover, números grandes | El estilo pintado 2D limpio y saturado |
| 5 | Loop Hero | Disciplina de paleta (16 colores, EGA), marcos de piedra/lápida, rojo sangre de fondo, tipografía pixel | La vista cenital de tiles |
| 6 | Horripilant | Duotono con ruido/dither para *momentos* (kamikaze, As de Espadas, derrota), UI blanco/negro tipo terminal | El duotono permanente (cansa y mata la legibilidad) |

---

## 1. Buckshot Roulette (Mike Klubnika, Godot, 2023; multijugador oct-2024)

Ver `1-buckshot-multiplayer-table.jpg` — la referencia más directa de todo el proyecto.

- **Multijugador:** mesa con hub central giratorio; los rivales son **máscaras** (de gas, de soldador,
  quirúrgica) + **manos pálidas flotantes** muy expresivas; el cuerpo se pierde en la oscuridad.
  Esto es lo que hace barato y aterrador tener 8 avatares: sólo máscaras y manos están iluminadas.
- **Cámara:** con RMB mirás alrededor; apuntando a una cabeza la mirás. Queja real de la comunidad
  (Steam): la cabeza del avatar sólo rota para los demás cuando sostiene la escopeta → **sincronizar
  siempre la mirada (yaw/pitch) de cada jugador**. Es lo que hace que la mesa "esté viva".
- **Render:** low-poly, texturas sin filtrar y estiradas a propósito ("nadie nota el UV estirado,
  encaja con la mugre" — Klubnika en 80.lv), texturas fotografiadas por él, cables colgando a mano,
  parlantes, focos de estudio, electrónica vieja (inspiración: *Pi* 1998, Silent Hill, fábrica Volta de Tallinn).
- **Post (recreaciones de la comunidad):** pixelado ×2, posterizado a 8 niveles con Bayer 4×4 (0.35),
  aberración cromática 0.35 hacia los bordes, viñeta 1.0, grano 0.2, tinte (0.95,1.03,0.9) al 15%,
  contraste 1.05, saturación 0.9. Dithering muy visible en las sombras.
- **Paleta (Lospec "buckshot-roulette"):** `#010000 #252423 #484948 #4a4927 #6f6e4b #92936f #240001 #492520
  #6a4945 #936c6c #b59392 #b76d6e #91486d #472246 #b7936a #d8b78e` — granates, oliva, rosa polvoriento, hueso.
- **Mesa:** paño oliva con líneas de tiza/cinta, bordes de mesa con LEDs verdes (vida = rayos ⚡ en un display).
  UI diegética: contrato impreso ("GENERAL RELEASE OF LIABILITY"), displays, terminal verde.

## 2. Inscryption (Daniel Mullins, Unity, 2021)

- **El truco técnico central** (Mullins en GameRant + hilo en X): *"los colores oscuros se posterizan —
  se trancan al color más cercano de la paleta — pero los claros no"* (shader de @tomaszek75, paleta de
  @grapplebug). Resultado: sombras duras que se funden, y las **cartas iluminadas siguen legibles**.
- 3D "down-rezzed" a resolución de pixel art con efectos (bloom) en alta resolución encima (inspirado en Celeste).
- **Iluminación:** negro casi total; un único pool de luz (vela/lámpara colgante) sobre la mesa; cada
  zona con su grading monocromo (naranja cabaña, verde pantano, azul/rojo en combates).
- **El anfitrión (Leshy):** sólo se ven **ojos brillantes y manos** saliendo de la oscuridad; máscaras
  talladas. Las cartas son objetos físicos: pergamino, grabado a tinta, se agarran, se clavan, se sacrifican.
- Subtítulos en mayúsculas condensadas de color, palabra clave en otro color ("PLEASE, CONSIDER ME PELTS!").
- Found footage VHS entre actos: degradación = narrativa, no sólo filtro.

## 3. Sol Cesto (Géraud Zucchini + Chariospirale, 2025–26)

Ver `3-solcesto-host-and-hand.jpg`.
- Dibujo a mano con **contorno de tinta grueso**, sombreado en **stipple/dither**, paleta de pasteles sucios
  (rosa, verde agua, mostaza, hueso) sobre negro. "Si el Manuscrito Voynich fuera clipart" (rogue.site).
- Grotesco medieval + mesoamericano: **soles con cara**, dientes (la UI de vida son muelas), ojos, sapos
  que sostienen contadores, marcos ornamentales con rayos solares y bordes de estrellas/puntos.
- Composición clave para nuestro juego: el **anfitrión asomado sobre el borde de la mesa** (sólo ojos,
  garras) y la **mano del jugador en primera persona** abajo, pálida, con brazaletes.
- Vínculo directo con la baraja española: comparado con el **tarot Sola Busca** (Italia, ~1491, grabado en
  metal e iluminado a mano) — mismos **palos latinos: oros, copas, espadas, bastos**. Es el puente estético
  legítimo entre "Sol Cesto" y "cartas españolas".

## 4. Slay the Spire (Mega Crit, 2019)

- **Anatomía de carta legible:** costo en orbe arriba-izq, banner con nombre, ventana de arte, etiqueta de
  tipo, texto; **color de marco por clase**, borde por rareza.
- **Mano en abanico** en arco abajo; hover = la carta sube, crece y se endereza; al jugarla vuela hacia el
  objetivo; números de daño enormes; partículas al agotar.
- Robar: jerarquía de lectura y el "juice" (feedback inmediato y exagerado). No robar: el look pintado limpio.

## 5. Loop Hero (Four Quarters, 2021)

Ver `5-loophero-card-frames.jpg`.
- Paleta limitada tipo EGA/VGA (Lospec "loop-hero"): `#000000 #232323 #602217 #3a3f3f #815938 #626439 #686f6f
  #497aa7 #cd6627 #879b42 #af9156 #5ea2b0 #9fa089 #a4bec1 #dbce2d #ffffff`.
- Fondo **rojo sangre `#602217`** moteado, marcos de **piedra gris biselada** con calavera y ornamentos,
  cartas-lápida (ventana de arte + placa con nombre), tipografía pixel en mayúsculas.
- Robar: la disciplina (nada fuera de paleta), el rojo de fondo para dorsos/cortinas, los marcos de piedra para UI.

## 6. Horripilant (Alexandre Declos / Pas Game, 2025–26)

- Imágenes casi fotográficas convertidas a **duotono con ruido de dither** (mostaza/negro, verde/negro,
  rojo/negro, azul-cian, magenta). Cada zona = un par de colores; el retrato del caballero se recolorea según estado.
- UI blanco/negro tipo terminal, íconos lineales, árbol de mejoras verde fósforo.
- Robar: el duotono como **evento** (kamikaze declarado → rojo; As de Copas invierte → teal; derrota automática → hueso),
  1–2 s y vuelve. Permanente mata la lectura de las cartas.

## 7. Referencia de gesto real: jugadores de naipes (video de truco, sólo como referencia corporal)

Ver `7-truco-real-gestures.jpg` (storyboard del video).
- Cartas **tapadas y apretadas contra el pecho/mentón con las dos manos**, codos apoyados en la mesa.
- Al jugar: el antebrazo se desliza **bajo y rasante** sobre la mesa, la carta cae delante del jugador,
  la mano vuelve. Mientras tanto la cabeza y los ojos buscan al compañero (señas) y a los rivales.
- **Señas**: La Base tiene su propio set (ver `la-base.md`; ej. guiño derecho = Ancho de Bastos, cerrar los ojos =
  no hago ninguna). Del video sólo se toma que son visibles para todos: "pescar la seña" del rival es parte del juego → requiere caras/máscaras articuladas
  y mirada sincronizada.

## Fuentes

- Buckshot: Steam app 2835570 · Wikipedia · 80.lv (entrevista Klubnika) · godotshaders.com (buckshot-roulette-style-shader) ·
  lospec.com/palette-list/buckshot-roulette · Steam discussions (cámara en multijugador)
- Inscryption: Steam 1092790 · gamerant.com/inscryption-interview-developer-daniel-mullins-3d-retro-horror-games · x.com/DMullinsGames/status/1451601471003234314
- Sol Cesto: Steam 2738490 · rogue.site editorial · Wikipedia "Sola Busca tarot"
- Slay the Spire: Steam 646570 · GDC Vault "Metrics Driven Design and Balance"
- Loop Hero: Steam 1282730 · lospec.com/palette-list/loop-hero
- Horripilant: Steam 3525970 · pasgame.ca/horripilant
- Truco: youtube.com/watch?v=HTn9oh_WMWc · señas: eldestapeweb.com, trucoreal.com
