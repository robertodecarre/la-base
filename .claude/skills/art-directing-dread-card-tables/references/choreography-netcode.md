# Coreografía de jugar una carta + cómo se ve "en vivo" por red

Implementación: `examples/mesa/src/play.ts` (función pura de t) y `main.ts` (identidad sólo en el reveal).

## El gesto (2.1 s), basado en jugadores reales de naipes

| Fase | t (s) | Qué pasa | Detalle que lo vende |
|---|---|---|---|
| extract | 0.00–0.30 | la carta sube 7 cm saliendo del abanico en el pecho | la mano izquierda aprieta el resto |
| turnDown | 0.30–0.55 | la muñeca la pone **boca abajo** y baja al borde de la mesa | desde acá nadie ve la cara |
| reach | 0.55–1.10 | deslizamiento **rasante** (2–3 cm sobre el paño), curva Bézier baja | leve roll de muñeca, torso se inclina, cabeza mira el destino |
| set | 1.10–1.25 | apoya y arrastra 1 cm (fricción) | golpe seco + polvo de tiza |
| reveal | 1.25–1.65 | la voltea **hacia el centro** (rx π/2 → 3π/2, sube 5 cm en el medio) | los rivales ven la cara ANTES que el dueño; pico de CA/luz |
| retract | 1.65–2.10 | la mano vuelve al abanico | |

Reglas:
- Todo es **función pura de t** → se puede adelantar, rebobinar y reproducir idéntico en cada cliente.
- Cada carta termina en la zona de juego de su dueño (en la demo `playSlot(seat, n, baza)`): frente a él, borde
  inferior hacia él. En La Base hay una sola base a la vez; al resolverse, el ganador junta las cartas y las lleva
  a su pila de bases ganadas (gesto nuevo: `collect`, ~1.2 s, a 15 fps si es remoto).
- Los demás avatares giran la cabeza hacia la carta en vuelo. Sin esto parece un video, no una mesa.

## Tu propia jugada: click corto o brazo manual

- **Click corto** sobre una carta (< 0.18 s y < 6 px de movimiento) → se juega sola con el timeline completo de arriba.
- **Mantener el click** → el brazo es tuyo: mouse adelante/atrás = `fwd` (estira/contrae, el torso se inclina),
  lateral = `lat`. La carta va boca abajo, 2.5 cm sobre el paño; el alcance se limita a 0.78 m desde el hombro y se
  realimenta a `fwd/lat` (el input no se "escapa"). La mirada sigue a la carta cuando está sobre la mesa.
- **Sólo juega si soltás con la carta dentro del recuadro punteado y es tu turno** (el recuadro brilla, más al estar
  encima). Entonces continúa el timeline desde `set` (apoya → revela → retrae). Si no, la carta vuelve a la mano.
- **Amagues**: salir hacia la zona y volver es parte del juego; los rivales remotos también amagan
  (`feint`: el mismo `playPose` con `t = depth·sin(πu)`, sin reveal).
- En red: el brazo manual se transmite como `arm {seat, fwd, lat}` (no confiable, 15–20 Hz, sin identidad) para que
  los demás vean el amague en vivo; el `playStart` lo emite el servidor al validar la suelta sobre la zona.

## Qué viaja por red (servidor autoritativo)

En La Base el servidor es Supabase: estado por RPCs SQL + `postgres_changes`, y eventos efímeros (gestos, mirada,
hover, brazo) por broadcast de Realtime. La escena no ve nada de eso: el adaptador lo traduce a las órdenes de
`references/mesa-contract.ts`. La tabla usa nombres genéricos de mensaje.

| Mensaje | Canal | Contenido | Nunca incluye |
|---|---|---|---|
| `look {seat, yaw, pitch}` | no confiable, 15 Hz, cuantizado 8 bit, sólo si cambia >0.5° | mirada de cada humano | — |
| `hover {seat, slot}` | no confiable, al cambiar | qué carta de su mano está "tocando" (el avatar la levanta 1.5 cm) | identidad |
| `gesto {seat, kind}` | confiable | la seña o reacción; se broadcastea a **todos** (pescarla es parte del juego) | — |
| `mirenme / teMiro / dejarDeVer` | confiable | contacto visual entre compañeros; **sólo** a los involucrados | nada para los rivales |
| `playStart {seat, serverTime}` | confiable, ordenado | arranca el gesto en todos los clientes | **identidad de la carta** |
| `reveal {seat, card}` | confiable, idealmente emitido a t=1.25 s | identidad | — |
| `baseGanada {seat}` | confiable | gesto `collect` hacia la pila del ganador | — |
| `pedido {team, n, kamikaze}` / `reloj {team, ms}` | confiable | pedido y reloj por equipo | — |
| `sentido {dir}` / `manoSeat {seat}` | confiable | As de Copas / As de Oros | — |
| `momento {kind}` | confiable | kamikaze, As de Espadas mata al Ancho… → estampa + duotono | — |

- El cliente del que juega **no decide** la identidad visible: el servidor valida la jugada y temporiza el reveal.
  Un cliente modificado no puede leer la carta durante el viaje porque todavía no la recibió.
- **Jugada propia**: el cliente local predice y arranca el gesto al instante (ya conoce su carta), pero la cara se
  muestra a los demás sólo con `reveal`. El dato es público para todos a la vez; que los rivales vean la cara
  ~0.2 s antes que el dueño durante el giro es puramente visual.
- Cada jugador recibe sólo **su** mano por mensaje privado. Nunca manos ajenas, ni "para animar".
- Reloj: offset estilo NTP (mediana de 8 pings); reproducir en `serverTime + 150 ms` (buffer de jitter).
  Si un evento llega tarde, entrar al timeline en la fase correcta y **acelerar** (hasta 2.5×); si llega >1.2 s tarde,
  saltar al estado final. Nunca saltearse el reveal visible.
- Mirada remota: interpolar con resorte críticamente amortiguado, 100 ms de retraso.
- Reconexión: snapshot completo (base en curso, bases ganadas por asiento, turno, sentido, pedidos, relojes,
  puntos, tu mano) → sin animaciones (`cargarEstado`).
- Aplicar las reglas de `security-review`: validación de turno/jugada en servidor, rate limit a `look/hover/sena`.

## Señales de "vida" baratas (prioridad)

1. mirada sincronizada · 2. todos miran la carta en vuelo · 3. hover de la mano ajena · 4. señas ·
5. respiración + glances idle a 15 fps · 6. inclinación del torso al alcanzar.
