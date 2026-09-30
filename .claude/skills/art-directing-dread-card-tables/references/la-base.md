# La Base: reglas que la escena tiene que respetar

**Este archivo manda sobre todo lo demás.** La demo (`examples/mesa`) y algunas referencias se escribieron para
otro juego de naipes (3 cartas fijas, bazas que quedan en la mesa, cantos). De la demo se reusa el render, el
look, el audio y la coreografía de la carta; los supuestos de reglas se reemplazan por los de acá.

- Reglamento completo: lo tiene el proyecto (`la-base-reglamento.md`). Acá está sólo lo que afecta a la escena.
- Contrato escena ↔ backend: `references/mesa-contract.ts`. **La escena es sólo vista**: no valida jugadas, no
  baraja, no decide turnos ni puntos. Todo eso lo hace el servidor (Supabase, RPCs SQL). La escena obedece
  órdenes (`MesaScene`) y avisa intenciones del jugador local (`MesaEvents`).

## Jugadores y mazo

- **4, 6 u 8 jugadores**, dos equipos **LOCAL** y **VISITANTE**, asientos alternados (nunca dos compañeros al lado).
- Mazo español de 40 (sin 8 ni 9). **Con 8 jugadores se usan dos mazos (80 cartas)** → hay cartas repetidas.
  La identidad de una carta es `palo + valor + copia`. Las dos copias tienen **el mismo dorso** (si no, se marcan).

## Jerarquía y cartas con efecto

Ancho de Bastos (As de Bastos) → Rey → Caballo → Sota → 7 → 6 → 5 → 4 → 3 → 2 → As de los otros palos.
Empate de valor: gana la que se tiró primero.

Cuatro cartas tienen efecto propio y llevan **arte especial sólo en la cara** (nada en dorso ni canto):

| Carta | Efecto | Qué necesita la escena |
|---|---|---|
| Ancho de Bastos | mata a todas | nada extra; se lee por el arte |
| As de Espadas | si cae en la misma base **después** del Ancho, lo mata | momento fuerte al resolverse la base (ver Momentos) |
| As de Copas | quien lo tira elige si el sentido **sigue** o **se invierte** hasta el fin de la mano | menú privado para quien lo tiró + indicador de sentido **siempre visible** en la mesa |
| As de Oros | si **su equipo** gana esa base, quien lo tiró elige qué compañero abre la siguiente | elegir señalando a un compañero; la etiqueta MANO se mueve |

## Estructura de la partida

- Se juegan varias **manos**; cada una con una cantidad de cartas por jugador definida antes de empezar
  (ej. partida clásica de 6: 1-2-3-4-5-5-5-4-3-2-1). **Bases en juego = cartas por jugador.**
- El abanico propio tiene que funcionar **de 1 a 10 cartas** (con 4 jugadores o con dos mazos entran 10) sin tapar
  la zona de juego propia y con índices legibles. Los abanicos ajenos también cambian de tamaño en cada mano.

## Flujo de una mano

| Fase | Qué pasa | Qué muestra la escena |
|---|---|---|
| Sorteo (sólo al inicio) | una carta **boca arriba** a cada uno; la más alta da. Empate → se sortea de nuevo toda la mesa | carta frente a cada jugador, ganador destacado. Es el primer momento en que el jugador se ubica: **su asiento tiene que ser inequívoco** |
| Barajar | el dador baraja cuantas veces quiera (cada vez es un random nuevo del servidor) | todos lo ven barajar en vivo; el control existe sólo para el dador |
| Repartir | rotación asiento por asiento, nunca alterada por lo que pase en la mano | reparto visible; cada cliente recibe sólo su mano |
| Pedido | pide primero el equipo **Mano** (0…total). Después el **Pie**, con la suma de pedidos ≠ total. La Mano puede declarar **kamikaze** (sólo todas o ninguna). Cada equipo tiene un **reloj** que corre mientras decide; si llega a cero, pierde la partida | panel de pedido (puede ser HTML sobre el canvas al principio), valor prohibido deshabilitado (lo calcula el servidor), reloj por equipo como **objeto sobre la mesa** |
| Bases | abre el jugador mano; una carta por jugador, **antihorario** salvo As de Copas; gana la más alta; **quien gana abre la siguiente** | ver "La mesa durante las bases" |
| Cierre | cumplió exacto: +10 + bases hechas. No cumplió: −diferencia. Pueden fallar los dos | anotador sobre la mesa; bases por equipo vs pedido |

Etiquetas: **Pie** = el que dio (su equipo es pie). **Mano** = el otro equipo, pide y abre primero. La etiqueta
MANO visible es dinámica (se mueve con cada base ganada y con el As de Oros).

## La mesa durante las bases

- **Sobre el paño hay una sola base a la vez.** Cuando se resuelve, **el ganador se lleva las cartas**: gesto de
  juntarlas y dejarlas boca abajo en **su pila de bases ganadas**, frente a él.
- Las pilas de bases ganadas por asiento son **información de juego central** (todos cuentan cuánto le falta a cada
  equipo para su pedido): el conteo tiene que leerse desde cualquier asiento.
- Pedido de cada equipo visible durante toda la mano, junto al anotador.
- Turno actual y sentido de juego siempre legibles sin abrir ningún menú.

## Momentos (duotono 1–2 s)

Reemplazan a los "cantos" de la demo. Nunca durante un reveal, nunca permanentes:
kamikaze declarado · As de Espadas mata al Ancho · As de Copas invierte el sentido · reloj de un equipo en los
últimos segundos · derrota automática (reloj en cero o kamikaze no declarado fallado por 2 o más).

## Fin de la partida

Última mano jugada · diferencia imposible de remontar · derrota automática. **Revancha**: mismos equipos y
asientos, mano y pie invertidos.

## Señas y presencia

- Cada jugador tiene una **cara** que hace gestos. Hay un set fijo de ~20 gestos, definidos **como datos**
  (una fila de configuración por gesto: boca, ojos, cejas, lengua, mejilla…), no como código por gesto.
- **Señas: 150 ms**, iguales para compañeros y rivales. **Reacciones** (Wow, JAJA, Miedo, PUTO!, Dale!): **2 s**.
- **Los gestos quedan fuera del muestreo a 15 fps** de los avatares remotos: 150 ms serían ~2 cuadros y se perderían.
  El resto del avatar puede seguir "stop-motion".
- La mirada sincronizada es crítica: pescar una seña de 150 ms exige ver hacia dónde mira cada uno.
- Significados por equipo, definidos antes de la partida. La lista es **privada** y mirarla cuesta: mientras está
  abierta no se ve la mesa.
- **Mírenme / Te miro / Dejar de ver**: círculo rojo alrededor de quien pidió, visible **sólo** para él y para los
  compañeros que están mirando; un ojo junto a la cara de cada uno que mira. El filtro de quién ve qué lo hace el
  backend; la escena dibuja lo que recibe.
- Cada jugador personaliza su apariencia (pelo, anteojos) antes de la partida; llega como `apariencia` en el contrato.

## Decisiones abiertas (no asumir; preguntar)

1. **Forma de la mesa**: redonda (demo) u ovalada (la versión 2D actual de La Base). Mientras no se decida, usar la
   redonda de la demo con la geometría parametrizada, y validar el alcance a la zona de juego y a la pila propia.
2. **Caras o máscaras**: las caras de La Base (emoji plano con pelo y anteojos) o las máscaras articuladas de la demo.
   Sea cual sea, tiene que poder hacer los ~20 gestos de forma legible en 150 ms desde el otro lado de la mesa.
3. **Celular/táctil**: ahora o más adelante. La demo sólo tiene mouse.
