# Presencia: terror dosificado, utilería, audio, originalidad y control de calidad

Complementa al resto de la skill (que define el look). Esto define **qué se siente** en la mesa y
cómo saber si una escena está terminada. Principio: la escena gana cuando alguien ve a otro jugador
agarrar una carta y piensa "lo vi elegirla", no "el juego reprodujo una animación".

## 1. Dosis de terror: 90 / 9 / 1

- **90% normal:** mesa, lámpara, cartas, gente jugando. Nada grita "horror".
- **9% raro:** detalles que se descubren mirando: un dedo de guante apenas demasiado largo, una máscara que
  tarda un frame más en girar, una carta del mazo con el sol mirando para otro lado.
- **1% muy mal:** eventos raros y breves: la silla vacía que aparece corrida unos centímetros entre manos,
  la lámpara que parpadea justo cuando alguien declara kamikaze, una raya de más en el anotador que nadie hizo.

Reglas: sin jumpscares, sin gore como estética, sin que lo raro tape información de juego. El 1% nunca
coincide con un reveal, un pedido ni un momento (compite con la lectura). Programarlos con cooldown largo (≥ 3 manos).

## 2. Utilería con propósito

Sala chica: la cámara no sale de la mesa. Cada objeto responde al menos una:
1. ¿Qué mundo es este? 2. ¿Quién estuvo acá? 3. ¿Qué pasó acá? 4. ¿Por qué se siente un poco mal?

Vocabulario rioplatense (evitar el "bar español genérico"): cuaderno de anotador con birome, sifón de soda, vaso de vino con tapa de corona, cenicero de lata, almanaque viejo de
almacén, radio a válvulas con tango/estática, velador de bronce, fileteado porteño descascarado en una tabla.
Nada de utilería con brillo o texto legible compitiendo con las cartas; lejos del pozo de luz.

## 3. Audio

Físico antes que musical. Implementación: `examples/mesa/src/audio.ts`.

- **Grabaciones reales, no síntesis de ruido** (feedback: el foley sintetizado y la cama de ruido blanco "suenan MUY mal").
  Base: Kenney *Casino Audio* (CC0, `public/sfx/`): card-slide/shove/place/fan/shuffle, variante aleatoria +
  playbackRate 0.9–1.45 según el evento + ganancia ±15% para que nada suene repetido.
- Posicional **HRTF** (PannerNode) en el punto exacto de la acción + reverb corta de madera (IR generado, 0.45 s,
  oscura, 8 ms de pre-delay, ~22% wet) + compresor suave en el master.
- Sala **casi en silencio**: sólo zumbido de lámpara 100/200 Hz, pasabajos, ganancia ~0.012, y un chisporroteo
  breve cuando la lámpara parpadea. Golpe de momento = puño en la mesa (seno 95→38 Hz + card-place a media velocidad).
- Arrastre de la carta sobre el paño: un `slide` cada ~9 cm recorridos. Tecla M = mute.

| Grupo | Sonidos | Disparador |
|---|---|---|
| Carta | roce al salir del abanico, deslizamiento sobre paño, golpe seco, volteo | fases `extract`, `reach`, `set`, `reveal` de `play.ts` |
| Cuerpo | tela, crujido de silla al inclinarse, respiración, uñas en la mesa | `lean` > 0.5, idle |
| Sala | tono de sala, zumbido de la lámpara (sube con el parpadeo), radio lejana, heladera | loop continuo, muy bajo |
| Momentos | palabra estampada + golpe grave con el duotono | `momento` (kamikaze, As de Espadas, As de Copas…) |
| Reloj | tic del reloj del equipo que pide, más rápido en los últimos segundos | `reloj` |

- El silencio es un recurso: bajar el tono de sala 3–4 dB mientras un equipo decide su pedido.
- Nada de stingers de terror recurrentes. Audio apagable y con volumen propio.

## 4. Chequeo de originalidad

La skill toma principios de 6 juegos. Algunos elementos quedaron cerca de la fuente y conviene alejarlos:

| Elemento | Riesgo | Cómo diferenciarlo |
|---|---|---|
| Máscaras + manos flotantes | lectura "mod de Buckshot" | máscaras de raíz local: cabezudos de murga, careta de carnaval, porcelana de santería, papel maché |
| Paleta oliva/granate | muy cerca de la de Buckshot | mover el paño a verde-petróleo gastado o bordó; mantener la **estructura** (6 oscuros + acentos por palo) |
| Soles con cara | muy Sol Cesto | ornamento de **fileteado porteño** (volutas, cintas, hojas de acanto) en marcos y dorso |
| Snap de oscuros + dither | técnica, no identidad | se puede usar tal cual |

Test: mostrarle una captura a alguien que conozca las referencias. Si nombra un juego en vez de describir el
tuyo, rediseñar ese elemento. No usar logos, personajes, tipografías ni composiciones reconocibles de ninguno.

## 5. Máquina de estados de la jugada

Un solo dueño del estado (no repartirlo en componentes de UI):

`TURNO → SELECCION (hover) → INTENCION (soltar) → VALIDACION (servidor) → EXTRACT → TURN_DOWN → REACH → SET → REVEAL → RETRACT → BASE_RESUELTA → COLLECT (ganador junta) → SIGUIENTE`

("INTENCION" es soltar la carta; no confundir con el pedido de bases de La Base, que es otra fase de la mano.)

Capas separadas: estado de juego (servidor) → eventos de red → presentación (`play.ts`) → mundo 3D.
Un componente de React nunca es a la vez estado de servidor, controlador de animación y modelo de carta.

## 6. Control de calidad (antes de dar una escena por terminada)

**Geometría:** ¿mesa circular real? ¿asientos equiespaciados 360°/N con equipos alternados? ¿`reachOk` pasa
para la zona de juego y la pila propia? ¿cartas frente a su dueño y orientadas hacia él?
**Presencia:** ¿se ve a cada jugador? ¿las cabezas siguen la carta en vuelo? ¿se entiende quién juega sin leer UI?
¿las señas de 150 ms se pueden "pescar" (y no se pierden por el muestreo a 15 fps)? ¿se leen pedidos, bases ganadas,
turno, sentido y reloj sin abrir menús?
**Fisicidad:** ¿la mano toca la carta en todo el gesto? ¿hay anticipación y asentamiento? ¿suena cada contacto?
**Seguridad:** con devtools abiertas en un cliente rival, ¿aparece la identidad antes de `reveal`? (debe ser no)
**Legibilidad:** ¿palo y valor se leen en la mano, en la mesa propia y apuntando a la del frente? ¿todo lo
legible en `?raw=1` sigue legible con post?
**Atmósfera:** ¿la oscuridad trabaja (esconde lo irrelevante) o sólo tapa? ¿lo raro es raro de verdad (≤1%)?
**Originalidad:** ¿pasa el test de la sección 4?
**Performance:** ¿60 fps en desktop medio con 8 jugadores? Si no, sacar primero decorado, nunca manos, cartas,
siluetas ni animación de jugada.
