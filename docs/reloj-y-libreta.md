# La Base — Reloj y Libreta: referencia técnica

Documento autocontenido para alguien (humano o IA) que **no conoce este
repositorio** y necesita reimplementar el frontend del reloj de pedidos y de
la libreta de puntaje sin cambiar las reglas.

- Repo: `github.com/robertodecarre/la-base`
- Stack: React (Vite) + Supabase. Las reglas del juego se aplican
  **server-side** en funciones SQL (RPCs `plpgsql`, `security definer`)
  definidas en `supabase/migrations/`. El cliente solo llama RPCs y
  renderiza el estado que recibe por Supabase Realtime.
- Equipos: siempre `0` = **LOCAL** y `1` = **VISITANTE** (fijos, nunca
  relativos a quién mira). El equipo de un asiento es `seat % 2`.
- "Mano" (hand) = una ronda completa de reparto; "base" = una baza/trick.
  "Equipo mano" = el que pide primero (`mano_seat % 2`); "equipo pie" = el
  otro.

> **Aviso sobre migraciones:** varias funciones se redefinieron muchas veces
> con `CREATE OR REPLACE`. Para cada RPC se indica abajo cuál es la
> **versión vigente** (la última migración que la redefine). Leer una versión
> anterior da información desactualizada.

Cada sección separa:

- **Server-authoritative**: reglas que el frontend nuevo debe respetar tal
  cual (no se pueden cambiar desde el cliente).
- **Presentacional**: cómo el frontend actual lo muestra; se puede rediseñar
  libremente.

---

## 1. Reloj (reloj de pedidos)

### 1.1 Resumen

Es un **reloj de ajedrez por equipo**, que corre **solo durante la fase de
pedidos (`bidding`)**. Cada equipo tiene un presupuesto de segundos
**acumulativo para toda la partida** (no se resetea por mano). Nunca corre
durante el juego de cartas, menús de As de Copas/Oros ni el cierre de mano.

El servidor **no tiene ningún timer, cron ni job programado**. El vencimiento
funciona con el patrón "la bandera hay que reclamarla" del ajedrez: cuando un
cliente calcula localmente que el tiempo se agotó, llama un RPC de reclamo y
el servidor **vuelve a calcular el deadline real** antes de terminar la
partida.

### 1.2 Configuración de la sala

`rooms.config` (jsonb) → clave `clock`:

```json
{ "habilitado": true, "minutos": 5, "modo": "muerte" }
```

- `clock` ausente o `null` → la sala **no tiene reloj**. El servidor lo
  detecta con `coalesce(jsonb_typeof(config->'clock'), '') = 'object'`.
- `modo`: `'muerte'` (muerte súbita) o `'deportivo'` (con 10 s de gracia).
- Validación de la config al crear la sala:
  `supabase/functions/_shared/validateConfig.ts`.

### 1.3 Forma de los datos: `game_state.clock` (jsonb)

```json
{
  "teamTime":      [s0, s1],       // segundos restantes de cada equipo al último corte
  "running":       0 | 1 | null,   // equipo cuyo reloj corre ahora; null = nadie
  "running_since": "ISO timestamp" | null,  // cuándo arrancó la ventana actual
  "expired":       [bool, bool]    // el equipo llegó a 0 en algún pedido
}
```

- `game_state.clock` es `null` si la sala no tiene reloj (o justo después de
  una revancha, ver 1.6).
- **El tiempo restante nunca se persiste**; siempre se deriva:

  ```
  restante(team) =
    si running == team:  max(0, teamTime[team] − (now − running_since))
    si no:               teamTime[team]
  ```

- Esquema original: `supabase/migrations/20260706000000_online_multiplayer_schema.sql`
  (el comentario de la columna menciona un campo `slowMode` que **ya no
  existe**; fue reemplazado por la forma de arriba en
  `20260706130000_clock_expired.sql`).

### 1.4 Reglas server-authoritative

#### `deal_hand(p_room_id uuid)` — arranca el reloj de cada mano

Versión vigente: `supabase/migrations/20260805000000_senas_order_bubbles_mirenme.sql`
(historial del bloque del reloj: introducido en `20260706130000_clock_expired.sql`,
perdido por error en `20260706150000_sorteo_inicial_rpc.sql`, restaurado en
`20260706180000_deal_hand_clock_fix.sql`).

Si la sala tiene reloj:

- **Primera mano** (INSERT de `game_state`): presupuesto completo
  `teamTime = [minutos*60, minutos*60]`, `expired = [false, false]`.
- **Manos siguientes** (UPDATE): **conserva** `teamTime` y `expired` de la
  fila existente (si son null, usa el presupuesto completo).
- En ambos casos: `running = mano_seat % 2` (corre el equipo mano),
  `running_since = now()`.

Si no tiene reloj: `clock = null`.

#### `submit_bid(p_room_id uuid, p_value int, p_kamikaze boolean default false)` — corta y pasa el reloj

Versión vigente: `supabase/migrations/20260706190000_pie_forced_bid_auto_resolve.sql`.

El cliente **no** llama este RPC directo: llama la Edge Function
`supabase/functions/submit-bid/index.ts`, que valida el cuerpo
(`supabase/functions/_shared/validateBid.ts`) y luego invoca
`supabase.rpc("submit_bid", …)`.

Lógica del reloj (si la sala tiene reloj y `clock` no es null):

1. Si el equipo que acaba de pedir es el que tenía `running`:
   `elapsed = max(0, epoch(now − running_since)::int)`;
   `teamTime[equipo] = max(0, teamTime[equipo] − elapsed)`;
   `expired[equipo] = expired[equipo] OR teamTime[equipo] <= 0`.
2. Cálculo de opciones legales de pie (mismo cálculo que la validación de
   pedidos): con `T` = bases de la mano y `m` = pedido de mano,
   `a = T − 1 − m`, `b = T + 1 − m`; cuenta cuántos de `a`, `b` están en
   `[0, T]` (y son distintos).
3. Siguiente estado:
   - Pidió **mano** y pie tiene **> 1 opción** → `running = pie`,
     `running_since = now()`.
   - Pidió **mano** y pie tiene **exactamente 1 opción** → el servidor
     **resuelve ambos pedidos en la misma llamada** (graba el valor forzado de
     pie), pasa a `phase = 'playing'` y **el reloj de pie nunca corre**.
     `running = null`.
   - Pidió **pie** (último pedido) → `running = null`, `running_since = null`,
     `phase = 'playing'`.

**Importante:** `submit_bid` **no** rechaza pedidos fuera de tiempo. Si el
deadline pasó pero nadie reclamó todavía, el pedido se acepta (el equipo queda
con `teamTime = 0` y `expired = true`).

Códigos de error de `submit_bid`: `not_authenticated`, `room_not_found`,
`not_bidding_phase`, `not_room_member`, `already_bid`,
`not_your_teams_turn`, `not_captain`, `kamikaze_only_for_mano`,
`kamikaze_not_available`, `invalid_bid`, `no_kamikazes_left`.
(Solo el capitán del equipo al que le toca puede pedir.)

#### `claim_timeout(p_room_id uuid)` — vencimiento en modo `muerte`

Definida en `supabase/migrations/20260706130000_clock_expired.sql`.

- Cualquier miembro de la sala puede llamarla.
- Requisitos: fase `bidding`, reloj habilitado, `modo = 'muerte'`,
  `clock.running` no null.
- Recalcula `remaining = teamTime[running] − epoch(now − running_since)::int`.
  Si `remaining > 0` → error `not_expired_yet`.
- Si venció: `rooms.status = 'finished'`; `game_state.phase = 'finished'`,
  `end_cause = 'clock_expired'`, `pending_action = null`.
- **La columna `clock` NO se toca**: queda congelada con `running` apuntando
  al equipo que se quedó sin tiempo. **Ese es el único registro de quién
  perdió** (no hay columna "perdedor").

Errores: `not_authenticated`, `not_room_member`, `room_not_found`,
`not_bidding_phase`, `clock_not_enabled`, `clock_not_muerte_mode`,
`no_clock_running`, `not_expired_yet`.

#### `claim_deportivo_timeout(p_room_id uuid)` — vencimiento en modo `deportivo`

Definida en `supabase/migrations/20260804020000_deportivo_grace_timeout.sql`.

Idéntica a `claim_timeout` salvo:

- Requiere `modo = 'deportivo'` (error `clock_not_deportivo_mode`).
- El deadline incluye **10 s de gracia**:
  `remaining = (teamTime[running] + 10) − elapsed`.
- La gracia **no se guarda en ninguna columna**: se deriva de
  `running_since + teamTime[running] + 10 s`.
- Mismo resultado: `end_cause = 'clock_expired'`, `clock` congelado.

#### Consecuencias de juego que el frontend debe reflejar

- **Quedarse sin tiempo es derrota inmediata, sin importar el puntaje**
  (incluso si el equipo iba ganando o empatado). Perdedor =
  `game_state.clock.running` cuando `end_cause = 'clock_expired'`; ganador =
  el otro equipo. Nunca es empate. (Lógica en
  `src/screens/PantallaPartidaOnline.jsx`, `equipoPerdioPorTiempo`.)
- **Deportivo, después de usar la gracia:** si un equipo pide dentro de los
  10 s de gracia, el pedido se acepta pero queda con `teamTime = 0`. En las
  manos siguientes ese equipo solo tiene los 10 s de gracia para cada pedido.
- **Redondeo:** el servidor convierte los segundos transcurridos con
  `extract(epoch …)::int`, que en Postgres **redondea** (no trunca). El
  cliente actual usa `Math.floor`. La diferencia es de menos de 1 s, pero la
  regla real es la del servidor.
- `game_state.end_cause` admite `'normal' | 'kamikaze' | 'clock_expired'`.

### 1.5 Cómo funciona el cliente actual (presentacional / sincronización)

Archivos: `src/hooks/useSala.js`, `src/screens/PantallaPartidaOnline.jsx`,
`src/components/DisplayReloj.jsx`, `src/hooks/useClock.js` (solo exporta
`fmtTiempo`), `src/lib/game.js` (wrappers `reclamarTiempo` →
`claim_timeout`, `reclamarTiempoDeportivo` → `claim_deportivo_timeout`,
`enviarPedido` → Edge Function `submit-bid`).

- **Sincronización:** `useSala` hace una carga inicial de `rooms`, `players`,
  `game_state`, `played_cards`, `hand_results` y después se suscribe por
  Realtime (`postgres_changes`) a esas 5 tablas, filtrando por sala.
  **No hay polling.** Solo se recarga todo de nuevo al detectar una revancha
  (`game_state` pasa de `finished` a `dealing` con `hand_number = 0`).
- **Tick local:** un `setInterval` de 1 s, activo solo en `bidding`, actualiza
  un estado `ahora = Date.now()` para forzar el re-render. El tiempo mostrado
  se calcula con la fórmula `restante(team)` de 1.3 usando `ahora`.
- **Agotado (visual):** `expired[team]` **o** (`running == team` y
  `restante <= 0`).
- **Gracia (deportivo, visual):** si `running == team` y
  `transcurrido >= teamTime[team]`, muestra `10 − (transcurrido − teamTime[team])`
  segundos de gracia.
- **Reclamo automático:** cuando el equipo que corre llega a 0 (muerte) o a
  0 de gracia (deportivo), **todas las sesiones** llaman el RPC de reclamo.
  Si el servidor responde `not_expired_yet`, se reintenta en el siguiente tick
  de 1 s. No hace falta coordinar quién reclama: el servidor arbitra.
- **Componentes visuales:** `DisplayReloj` (dos píldoras LOCAL/VISITANTE con
  `● CORRIENDO`, rojo si agotado, color de alerta bajo 30 s, badge
  `⚠ GRACIA` pulsante, ícono ⚡ muerte / 🏃 deportivo), `RelojOverlay` en
  `PantallaPartidaOnline.jsx` y el ícono de reloj en
  `src/components/MesaCircular.jsx`. La prop `modoLento` ("10s/m") es una
  función vieja del modo offline; en el modo online siempre vale `false`.
- **Pantalla final por tiempo:** mensaje por perspectiva (perdedor en rojo,
  ganador en verde) en lugar de "GANÓ EQUIPO X".

### 1.6 Casos borde

| Caso | Comportamiento actual |
|---|---|
| Reconexión / recarga de página | Correcto: `running_since` es absoluto, así que la carga inicial ya da el tiempo exacto. Pero si se cae el canal Realtime, **no hay** re-suscripción ni recarga automática. |
| Pestaña en segundo plano | El navegador frena el `setInterval`, pero como el cálculo usa `Date.now()` se pone al día al volver. Si **todas** las pestañas están en segundo plano, el reclamo se demora, y mientras tanto `submit_bid` sigue aceptando pedidos. |
| Desfase (drift) cliente vs. servidor | **No se corrige.** Si el reloj del cliente va adelantado, muestra 0 antes de tiempo y el servidor rechaza el reclamo con `not_expired_yet` hasta que venza de verdad. Si va atrasado, el reclamo llega tarde. |
| Pie con una sola opción legal | El reloj de pie nunca arranca; el servidor resuelve ambos pedidos en la llamada de mano. |
| Revancha (`revancha_partida`) | Pone `clock = null`; el siguiente `deal_hand` carga de nuevo el presupuesto completo. Versión vigente de `revancha_partida`: `20260804000000_bid_mano_seat_split.sql`. |
| Sala sin reloj | `clock = null` siempre; los RPC de reclamo devuelven `clock_not_enabled`. |

---

## 2. Libreta (anotador de puntaje)

### 2.1 Resumen

La libreta muestra, para cada mano de la partida, lo que pidió cada equipo, lo
que hizo y el puntaje acumulado. La notación de marcas son **estrellas ★**:
una por base pedida, **rellena** si esa base se hizo y **vacía** si no.

El puntaje lo calcula y lo guarda **exclusivamente el servidor** al cerrar
cada mano; el cliente solo suma y dibuja.

### 2.2 Forma de los datos

**`hand_results`** (una fila por mano cerrada) — definida en
`supabase/migrations/20260706000000_online_multiplayer_schema.sql`:

| Columna | Tipo | Significado |
|---|---|---|
| `room_id` | uuid | Sala (PK compuesta) |
| `hand_number` | int | Índice de mano, 0-based (PK compuesta) |
| `cards_dealt` | int | Bases/cartas de esa mano |
| `bid_team0`, `bid_team1` | int | Pedido de cada equipo |
| `tricks_team0`, `tricks_team1` | int | Bases hechas por cada equipo |
| `delta_team0`, `delta_team1` | int | Puntos ganados/perdidos en la mano |

No tiene columna `id`: la clave es `(room_id, hand_number)`.

**Otras fuentes que usa la libreta:**

- `rooms.config.estructura`: array con la cantidad de cartas de cada mano
  (define cuántas filas tiene la libreta y cuántas manos tiene la partida).
- `game_state.bids`: `{ "team0": int|null, "team1": int|null }` — pedidos de
  la mano en curso.
- `players.tricks_won`: bases ganadas por cada jugador en la mano en curso
  (`deal_hand` las pone en 0 al repartir). Bases hechas del equipo = suma de
  sus jugadores.
- `game_state.kamikaze_declared` (bool) y `game_state.kamikazes_remaining`
  (int, presupuesto para toda la partida).
- `game_state.mano_seat` (dinámico: cambia con cada base ganada o
  transferencia por As de Oros) y `game_state.bid_mano_seat` (fijo: quién era
  mano al momento de pedir). Separados en
  `20260804000000_bid_mano_seat_split.sql`.

### 2.3 Reglas server-authoritative

#### `close_hand(p_room_id uuid)` — puntúa la mano

Versión vigente: `supabase/migrations/20260804000000_bid_mano_seat_split.sql`.
Diseño original y comentarios: `20260706120000_close_hand.sql`; doble
confirmación agregada en `20260706290000_close_hand_dual_captain_confirm.sql`.

1. **Doble confirmación:** solo capitanes pueden llamarla, en fase
   `closing`. Cada llamada marca `close_hand_confirmed_team0` o `…_team1`.
   Hasta que confirmen **ambos** capitanes, devuelve el estado sin puntuar.
2. **Conteo:** `pedido = game_state.bids.teamN`;
   `hecho = SUM(players.tricks_won)` del equipo.
3. **Fórmula de puntos** (`cumple = hecho == pedido`):

   | Situación | Delta del que cumple | Delta del que no cumple |
   |---|---|---|
   | Solo un equipo cumple | `10 + hecho` | `−|hecho − pedido|` |
   | Ambos cumplen | `−|0| = 0` (cada uno) | — |
   | Ninguno cumple | — | `−|hecho − pedido|` (cada uno) |

   Ojo: **si cumplen los dos, ninguno suma** (ambos reciben 0). Solo se
   cobran los 10 puntos de premio cuando cumple uno solo.
4. **Inserta la fila** en `hand_results`.
5. **Fin por kamikaze no declarado (se evalúa primero):** con
   `equipo_mano = bid_mano_seat % 2`, si `delta(equipo_mano) <= −2` y
   `kamikaze_declared = false` → la partida termina:
   `phase = 'finished'`, `end_cause = 'kamikaze'`, `rooms.status = 'finished'`;
   **pierde el equipo mano**. Se aplica **aunque esa mano no permitiera
   declarar kamikaze** (manos de 2 bases o menos).
6. **Fin normal:** si era la última mano (`hand_number + 1 >= len(estructura)`)
   → `phase = 'finished'`, `end_cause = 'normal'`.
7. **Si no:** `hand_number + 1`, `dealer_seat = (dealer_seat + 1) % nJug`,
   `phase = 'dealing'`.

Errores: `not_authenticated`, `not_room_member`, `close_hand_captain_only`,
`room_not_found`, `not_closing_phase`.

#### Reglas de pedido que afectan la libreta (en `submit_bid`, ver 1.4)

- Pedido normal: `0 ≤ valor ≤ T`. El pedido de pie está restringido a
  `T − 1 − pedido_mano` o `T + 1 − pedido_mano` (la suma de pedidos nunca
  puede ser igual a `T`).
- **Kamikaze:** solo lo puede declarar el equipo **mano**, solo si `T > 2`,
  el valor tiene que ser `0` o `T`, y gasta 1 de `kamikazes_remaining`.
  Pone `kamikaze_declared = true` para el resto de la mano.

#### Qué NO se guarda

- `hand_results` **no registra si hubo kamikaze** en una mano:
  `kamikaze_declared` vive solo en `game_state` y `deal_hand` lo pone en
  `false` en cada mano nueva.
- Las jugadas de **As de Copas** (cambio de sentido, RPC
  `resolve_copas_menu`) y **As de Oros** (transferencia de mano, RPC
  `resolve_oros_menu`, vigente en `20260803010000_resolve_oros_menu_mano_seat.sql`)
  **no dejan ninguna marca en el puntaje**. Solo afectan el desarrollo de la
  mano.
- Para mostrar cualquiera de esas cosas en manos ya cerradas haría falta un
  cambio de esquema (columna nueva en `hand_results` + cambio en `close_hand`).

#### Valores derivados (no persistidos)

- **Total de un equipo:** `SUM(hand_results.delta_teamN)`.
- **Ganador:** si `end_cause = 'clock_expired'`, pierde `clock.running` (ver
  1.4). Si `end_cause = 'kamikaze'`, pierde `bid_mano_seat % 2` (el frontend
  actual igualmente muestra el ganador comparando totales, con un subtítulo
  explicando la causa kamikaze). Si no, gana el de mayor total; igualdad =
  empate.

### 2.4 Notación de marcas: estrellas ★

Componente: `src/components/EstrellasPedido.jsx`
(`EstrellasPedido({ pedidas, hechas, color })`).

- Dibuja **una ★ por cada base pedida** (`pedidas`).
- Las primeras `hechas` estrellas van **rellenas** (color del equipo, trazo
  0.8 px, opacidad 1); el resto **vacías** (relleno transparente, trazo
  0.5 px, opacidad 0.5).
- Lectura: `★★☆` = pidió 3, hizo 2 (no cumplió); `★★★` = pidió 3 e hizo
  al menos 3 (ver la limitación de abajo).
- Limitaciones de la notación actual (comportamiento real, no reglas):
  - **Pedido 0 → no se dibuja nada** (el componente devuelve `null`).
  - **Si hizo más bases de las que pidió, el exceso no se ve**: se ven todas
    las estrellas rellenas igual que si hubiera cumplido. El cumplimiento real
    se ve en el delta (`10 + hecho` vs. negativo).
- **Avión kamikaze** (`src/components/AvionKamikaze.jsx`): aparece debajo de
  las estrellas del equipo que declaró kamikaze, **solo en el marcador de la
  mano en curso** (`ResumenMarcador` en `PantallaPartidaOnline.jsx`), no en
  las filas históricas de la libreta (porque ese dato no se persiste).

### 2.5 Cómo funciona el cliente actual (presentacional)

- **Armado del historial** (`src/screens/PantallaPartidaOnline.jsx`, bloque
  `historialTablero`): una entrada por cada índice de `config.estructura`:
  - Mano ya cerrada → datos de `hand_results`
    (`deltaLocal/Visitante`, `pedLocal/Visitante`, `hechoLocal/Visitante`).
  - **Mano en curso**, en cuanto **ambos** equipos pidieron → pedidos de
    `game_state.bids` y hechas de `players.tricks_won`, con delta `null`
    (muestra estrellas en vivo, pero no suma al acumulado).
  - Mano futura → `undefined` (fila vacía).
- **Tabla** (`src/components/Tablero.jsx`): columnas MANO / CARTAS / LOCAL /
  VISITANTE; una fila por mano; en cada celda de equipo el **acumulado**
  (en rojo si es negativo, `·` si la fila no tiene delta todavía) y debajo
  las estrellas. La fila de la mano actual va resaltada.
- **Apertura:** la libreta es un overlay (`TableroOverlay` en
  `PantallaPartidaOnline.jsx`) que se abre con el ícono de libreta
  (`LibretaIcon` en `src/components/MesaCircular.jsx`), ubicado entre los
  asientos de los capitanes.
- **Marcador en vivo** (`ResumenMarcador`): total acumulado por equipo +
  estrellas de la mano en curso + avión kamikaze + "MANO n/total · N CARTAS".
- **Pantalla final:** "FIN DE LA PARTIDA", resultado ("GANÓ EQUIPO LOCAL",
  "GANÓ EQUIPO VISITANTE", "¡EMPATE!" o el mensaje de derrota por tiempo),
  nombres de los ganadores y totales. No repite la tabla de la libreta.
- Realtime: `hand_results` se sincroniza por `postgres_changes` igual que las
  demás tablas (ver 1.5); su clave en el cliente es
  `(room_id, hand_number)`.

---

## 3. Índice de archivos

| Tema | Archivo |
|---|---|
| Esquema base (`game_state`, `hand_results`, `played_cards`, `hands`) | `supabase/migrations/20260706000000_online_multiplayer_schema.sql` |
| Diseño del reloj, `claim_timeout`, `end_cause = 'clock_expired'` | `supabase/migrations/20260706130000_clock_expired.sql` |
| Restauración del reloj en `deal_hand` (historia del bug) | `supabase/migrations/20260706180000_deal_hand_clock_fix.sql` |
| `submit_bid` vigente (reloj + pie forzado) | `supabase/migrations/20260706190000_pie_forced_bid_auto_resolve.sql` |
| `claim_deportivo_timeout` (gracia 10 s) | `supabase/migrations/20260804020000_deportivo_grace_timeout.sql` |
| `deal_hand` vigente | `supabase/migrations/20260805000000_senas_order_bubbles_mirenme.sql` |
| `close_hand` y `revancha_partida` vigentes, `bid_mano_seat` | `supabase/migrations/20260804000000_bid_mano_seat_split.sql` |
| Diseño original de `close_hand` | `supabase/migrations/20260706120000_close_hand.sql` |
| Doble confirmación de capitanes | `supabase/migrations/20260706290000_close_hand_dual_captain_confirm.sql` |
| Edge Function de pedidos | `supabase/functions/submit-bid/index.ts`, `supabase/functions/_shared/validateBid.ts` |
| Validación de config de sala | `supabase/functions/_shared/validateConfig.ts` |
| Sincronización Realtime | `src/hooks/useSala.js` |
| Wrappers de RPC | `src/lib/game.js` |
| Pantalla de partida (tick, reclamos, historial, pantalla final) | `src/screens/PantallaPartidaOnline.jsx` |
| Reloj visual | `src/components/DisplayReloj.jsx`, `src/hooks/useClock.js` |
| Libreta visual | `src/components/Tablero.jsx`, `src/components/EstrellasPedido.jsx`, `src/components/AvionKamikaze.jsx` |
| Íconos de libreta/reloj en la mesa | `src/components/MesaCircular.jsx` |
| Motor offline original (borrado; referencia de las fórmulas) | `src/engine/scoring.js`, `src/engine/hand.js` en el commit padre de `d065ece` |
