# Mesa, asientos, avatares y cámara

Implementación: `examples/mesa/src/seats.ts`, `table.ts`, `avatar.ts`, `main.ts`.

## Geometría (metros) — derivada del alcance del brazo, no al revés

| Constante | Valor | Por qué |
|---|---|---|
| Radio de mesa | **0.90** (Ø 1.8 m) | Mesa redonda real de 8. Más grande = nadie llega a la zona de juego |
| Altura tapa | 0.76 | estándar |
| Radio silla | 1.35 | 0.45 m del borde |
| Ojo (cámara) | r 1.26, y 1.20 | sentado, inclinado hacia la mesa |
| Hombro | r 1.24, y 1.05 | |
| Zona de juego (una sola base a la vez) | r 0.66 | alcance hombro→carta 0.65 m (≤ 0.75 con inclinación) |
| Pila de bases ganadas | frente a cada dueño, a un costado de su zona | el ganador junta la base y la deja acá boca abajo; conteo legible desde toda la mesa |
| Centro libre | r < 0.3 | mazo, anotador, reloj por equipo, indicador de sentido |
| Carta | 61×95 mm ×1.35 | legible a 1.3–1.9 m |

Validar en código (`reachOk`) y **fallar en el arranque** si la zona de juego o la pila propia quedan fuera de
alcance: un IK estirado se ve como brazo roto y rompe la ilusión "en vivo".

**Una sola base sobre el paño.** Al resolverse, el ganador estira el brazo, junta las N cartas y las lleva a su
pila (el alcance a la carta más lejana se valida también: con 8 jugadores es la del lado opuesto, así que el
gesto puede ser "arrastrar hacia sí" desde el centro, no tocar cada carta). La demo acumula bazas en anillos
solapados: eso no aplica a La Base.

Con 8 jugadores las cartas de una base quedan a 0.52 m entre sí sobre un anillo de r 0.66: se lee un
**círculo limpio** de cartas frente a cada dueño.

## Asientos y equipos

- La Base = **2 equipos** (LOCAL / VISITANTE) de 2, 3 o 4 → N ∈ {4, 6, 8}. Asientos **equiespaciados 360°/N**, equipos **alternados**
  (cada jugador entre dos rivales). Asiento 0 = jugador local.
- Siempre hay **8 sillas**: las vacías quedan empujadas atrás en la oscuridad (suman inquietud, Buckshot).
- Marca de equipo en tiza en el paño (I / II) + puño del guante (rosa `#b76d6e` / teal `#5ea2b0`). Nada de colores saturados de equipo. Accesibilidad: el equipo se lee también por la marca I/II, no sólo por el color del puño.

## Luz (una sola que importa)

1. **Lámpara colgante** sobre el centro: `SpotLight` ámbar `#ffc58a` (intensidad en candelas, three ≥r155; 11 cd a 0.9 m del paño en la demo), ángulo 0.8 rad, penumbra 0.6, decay 2,
   **única que proyecta sombra** (1024²). Péndulo leve (±0.7°) + parpadeo raro (−25% por un instante).
2. **Rebote del paño**: `PointLight` oliva a la altura de la mesa, sin sombra → ilumina máscaras y manos **desde abajo**
   (uplight de terror) y las mantiene sobre el umbral de snap.
3. Ambiente ≈ 0.015. `FogExp2` color `#0b0908`, densidad 0.22: la sala desaparece a ~4 m.
4. Emisivos (bombita, LEDs, velas) son los únicos que hacen bloom.
Opcional: rim frío muy tenue detrás de cada silla si las siluetas de los cuerpos tienen que leerse.

## Avatares: máscara articulada + manos flotantes

- **Cuerpo** (abrigo/capucha) casi negro: se pierde en la oscuridad a propósito. Lo que se lee: **máscara + guantes + cartas**.
- **Máscara de títere articulada** (resuelve Buckshot vs. señas): párpados con bisagra, cejas móviles, boca desplazable,
  mandíbula. Cada seña es una pose de esas piezas (ver `avatar.ts → sena()`). En La Base: **~20 gestos definidos
  como datos, señas de 150 ms y reacciones de 2 s** (ver `la-base.md`); el flash de ~0.8 s de la demo no aplica.
  **Decisión abierta:** máscara articulada de la demo o cara de La Base (emoji plano con pelo y anteojos).
- **Manos**: dos brazos con IK analítico de 2 huesos (hombro→codo→muñeca), polo del codo abajo-afuera.
  Nunca una mano suelta sin brazo que llegue al borde del cuadro. Para anatomía real de brazos/manos usar la
  skill **`modeling-3d-human-characters`**; los guantes-caja de la demo sólo sirven detrás del post pesado.
- **Mano de cartas** apretada contra el pecho con ambas manos, cara hacia el dueño, dorso hacia la mesa.
- **Mirada**: todos miran a quien está jugando (cabeza yaw/pitch hacia la carta en vuelo) y hacen glances idle.
  La mirada de los humanos remotos llega por red (ver choreography-netcode.md).
- **Animación "stop-motion"**: avatares remotos muestreados a 15 fps (`floor(t*15)/15`) → títere / Leshy.
  **Excepción: los gestos de la cara** van a fps completos (una seña de 150 ms no sobrevive al muestreo).
  Cámara, mano propia y UI a fps completos (el control no debe sentirse trabado).

## Cámara primera persona (shooter sin arma)

- FOV vertical 58°, ojo en y 1.27. Mouse/stick = cabeza, suavizado exponencial 0.15/frame. Pointer lock al click en la mesa.
- **Giro limitado a lo necesario** (feedback: ±1.9 y luego ±1.48 rad seguían sacando la imagen de escena):
  `YAW_MAX = (π − 2π/N)/2 − 0.2` — el vecino ya entra en cuadro antes de mirarlo de frente (medio FOV horizontal
  ≈ 45° a 16:9) → N=8 ±0.98, N=6 ±0.85, N=4 ±0.59. Pitch −0.8…+0.25.
- **Sensibilidad baja** (feedback): cabeza 0.0012 rad/px, brazo 0.0009 m/px (≈500 px de la mano al recuadro),
  paneo parado 0.0005·distancia. La cabeza y el brazo deben sentirse pesados, deliberados.
- **El mismo click que toma la vista la suelta** (click en la mesa con pointer lock activo → `exitPointerLock`),
  no depender de Esc. Con la vista tomada, un click sobre una carta propia sigue jugándola/agarrándola.
  Clampear también los valores iniciales (`?yaw`).
- **Leer = apuntar al cursor**: clic derecho hace zoom (FOV 58→24) hacia el punto bajo el cursor, sin necesidad de
  pointer lock (con lock, hacia la mira). El punto se calcula con un rayo desde la vista sentada sin zoom (`baseCam`)
  contra el plano de la mesa; si no pega en la mesa, 2.5 m sobre el rayo (para mirar una cara).
- **Pararse para mirar**: si ese punto cae en la **mitad lejana** de la mesa (`dot(p, haciaElCentro) > 0.02`, sale con
  < −0.05: histéresis), la cámara sube +0.48 m y avanza 0.32 m sobre la mesa, FOV 20, mirando al punto. Mientras se
  mantiene el botón, el mouse **pasea el punto** por la mesa. Al soltar vuelve a sentarse (con lock, la mirada queda
  donde apuntabas: sin salto). **Sólo local**: no se transmite, los demás no te ven pararte.
- Viewmodel: las cartas propias (1 a 10) en la **mano izquierda, a un costado** (al centro tapaban tu propia zona),
  sway de respiración; bajan mientras movés una carta o estás parado. Antebrazo derecho apoyado en el borde de la mesa.

## UI diegética (Buckshot) + terminal (Horripilant)

- **Anotador** sobre la mesa (cuaderno con birome) con puntos por equipo; **pedido** de cada equipo visible toda la mano.
- **Reloj por equipo** como objeto sobre la mesa (reloj de ajedrez / display LED verde `#7fd36b`): corre mientras ese equipo pide.
- **Indicador de sentido** (antihorario/horario) y **etiqueta MANO** siempre visibles.
- Momentos (kamikaze declarado, As de Espadas mata al Ancho, As de Copas invierte…) = palabra estampada grande en
  mayúsculas (Inscryption) + duotono 1–2 s.
- Panel de pedido y menús de As de Copas / As de Oros: pueden empezar como HTML sobre el canvas (el panel de React
  existente) y volverse diegéticos después.
- Texto de sistema en `VT323` verde/blanco; nada de paneles modernos translúcidos.
