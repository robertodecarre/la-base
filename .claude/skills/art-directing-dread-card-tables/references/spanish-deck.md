# La baraja: cartas españolas en clave "sótano"

Implementación de referencia: `examples/mesa/src/cardFace.ts` (canvas procedural, 40 cartas + dorso).

## Estructura (La Base, ver `la-base.md`)

- 40 cartas: palos **oros, copas, espadas, bastos**; valores 1–7 + **sota (10), caballo (11), rey (12)**. Sin 8 ni 9.
- **Con 8 jugadores, dos mazos (80 cartas)**: identidad = palo + valor + copia. Las dos copias son **idénticas**
  (cara y dorso); cualquier diferencia entre copias las marca.
- Proporción real Fournier ≈ **61 × 95 mm** (1 : 1.557). En 3D escalar ×1.35 ("hero prop", como los objetos
  sobredimensionados de Buckshot) para que se lean del otro lado de la mesa.
- **Pintas**: cortes en el marco que indican el palo aun viendo sólo el borde —
  oros 0 cortes, copas 1, espadas 2, bastos 3. Son tradición Y son legibilidad a baja resolución. Mantenerlas.
- **Cartas con efecto**: Ancho de Bastos (la más alta), As de Espadas (mata al Ancho si cae después), As de Copas
  (cambia el sentido), As de Oros (elige quién abre). Arte especial (ej. un sol que mira extra, dientes).
  Sólo en la CARA. Nada en el dorso ni en el canto que las distinga.
- Jerarquía de La Base (para ordenar la intensidad del arte, no para lógica): Ancho de Bastos → Rey → Caballo →
  Sota → 7 … 2 → As de los otros palos.

## Capas de la cara (orden de dibujo)

1. **Stock** hueso `#d8c7a0` + manchas de óxido (foxing) + stipple de tinta (grano Sol Cesto/Horripilant).
2. **Marco doble**: exterior tinta `#140e0c` 3 px, interior en color del palo 1.5 px, con las pintas.
3. **Arte**: pips en disposición tipo Fournier (1–7) o figura (10–12). Contorno de tinta grueso, relleno plano
   en el color del palo, sombreado sólo con stipple. Máx. **4 colores por carta**: hueso, tinta, color del palo, 1 acento.
4. **Índices** arriba-izq y abajo-der (rotado 180°), **≥16% del alto de la carta**, serif de imprenta vieja
   (`IM Fell English SC`). Deben leerse a ~60 px de alto en pantalla después del post.

## Iconografía de palos (rediseño, no Fournier)

| Palo | Tinta | Símbolo |
|---|---|---|
| Oros | `#c9a043` oro viejo | Sol con cara (Sol Cesto): rayos alternos, ojos cuadrados, boca de dientes |
| Copas | `#8e2a22` sangre seca | Cáliz de copa ancha, fuste corto, pie plano |
| Espadas | `#4f7f8a` acero verdoso | Espada recta, guarda ancha, pomo redondo |
| Bastos | `#6b6a2e` musgo | Garrote nudoso con muescas de tinta, brote |

Figuras: **grotescas y enmascaradas** (Sola Busca / Sol Cesto): túnica negra, máscara hueso con dientes,
corona (rey), cráneo de caballo (caballo). Nunca el rey Fournier clásico: es lo que vuelve "genérico" el juego.

## Dorso

- **Uno solo para las 40**, simétrico a 180° (no revela orientación), sin desgaste por carta
  (manchas por carta = **cartas marcadas**: un jugador aprende a reconocerlas).
- Rojo Loop Hero `#602217`, celosía de tinta, marco hueso, **sol con cara al centro** (mismo sol que los oros).
- Si querés desgaste: aleatorio por reparto y no ligado a la identidad.

## Material 3D

- Plano con cara y dorso separados (o caja de 0.3 mm si se ve el canto). `MeshStandardMaterial` roughness 0.8.
- Textura con `NearestFilter` en magnificación + mipmaps en minificación (sin shimmer del otro lado de la mesa).
- **Cara levemente emisiva (0.18–0.25)**: la carta tiene que ser lo más brillante bajo la lámpara y quedar
  **por encima del umbral de snap de oscuros** del post. Si no, el post la ensucia.
- Cartas remotas se crean **sin identidad** (dorso en ambos lados) y reciben la cara sólo con el evento de reveal.

## Mano propia (viewmodel)

Donde un shooter tiene el arma: abajo-centro/derecha, abanico con pivote en la base, caras hacia
vos, sway de respiración, baja al "apuntar". **De 1 a 10 cartas** según la mano: el ángulo del abanico y la
superposición se ajustan a la cantidad, y los índices siguen legibles con 10. Hover (Slay the Spire): la carta sube 1.5 cm y se endereza.
