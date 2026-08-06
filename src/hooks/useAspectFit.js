import { useState, useRef, useLayoutEffect } from "react";

// Mide en vivo el contenedor (ResizeObserver) y devuelve el tamaño en
// PÍXELES REALES que un contenido de proporción vbW:vbH debería tener
// para caber adentro sin deformarse — "el más chico de ambos límites
// gana" (equivalente a object-fit:contain, a mano en JS).
//
// Se agregó después de que dos intentos puramente CSS resolvieron mal el
// tamaño real en casos reales de la mesa ovalada (medido con Playwright,
// no en teoría — online-panel-pedir-mesa.spec.js atrapó el bug):
//   1. `aspect-ratio` en el <div> que envuelve el <svg> (con width:100%
//      como dimensión "definida"): cuando el ALTO era el límite real
//      (nJug con proporción vbW:vbH alta, panel angosto), el <div> se
//      quedaba con el ancho COMPLETO del contenedor en vez de achicarse
//      — el propio <svg> letterboxeaba puertas adentro (su
//      preserveAspectRatio default) para no deformarse, así que el <div>
//      de afuera quedaba más ANCHO que el contenido real visible. Un
//      overlay HTML posicionado en % de ESE <div> (el panel de pedir)
//      quedaba desalineado del paño real.
//   2. `width`/`height` como ATRIBUTOS del <svg> (aspect-ratio intrínseco
//      real, patrón "imagen responsiva") + un <div> envolvente
//      display:"inline-block" (para que se achique al tamaño ya
//      renderizado del <svg>, dándole al overlay un marco de referencia
//      correcto): rompía por una dependencia circular real — inline-block
//      quiere su tamaño A PARTIR de su contenido, pero el <svg> con
//      max-height:100% necesita el alto de SU PADRE ya resuelto para
//      calcular ese 100% — ninguno de los dos puede resolverse primero,
//      así que max-height terminaba sin efecto (el <svg> se renderizaba a
//      su tamaño intrínseco completo, sin importar cuánto espacio hubiera
//      de verdad).
//
// Ninguna combinación de CSS puro encontrada resolvió los dos casos (la
// mesa sola Y el overlay alineado con ella) a la vez — de ahí medir en JS.
export function useAspectFit(vbW, vbH) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: vbW, height: vbH });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      const scale = Math.min(cw / vbW, ch / vbH);
      setSize({ width: vbW * scale, height: vbH * scale });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vbW, vbH]);

  return { containerRef, size };
}
