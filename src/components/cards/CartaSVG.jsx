import { AsBastos } from "./AsBastos";
import { AsOros } from "./AsOros";
import { AsCopas } from "./AsCopas";
import { AsEspadas } from "./AsEspadas";
import { CaballoSVG } from "./CaballoSVG";
import { FiguraCarta } from "./FiguraCarta";
import { PaloDecorativo } from "./PaloDecorativo";

// `bocaAbajo` es para la mesa online (pieza 5e): la mano de un rival nunca
// llega al cliente (RLS de la tabla `hands` — ver useSala.js), así que ahí
// solo se conoce CUÁNTAS cartas le quedan, nunca cuáles. `carta` no hace
// falta en ese caso — ni se lee.
export function CartaSVG({ carta, w=36, h=52, bocaAbajo=false }) {
  if (bocaAbajo) {
    return (
      <g>
        <rect width={w} height={h} rx={3} fill="#0f2519" stroke="#c9a84c" strokeWidth={1.5}/>
        <rect x={3} y={3} width={w-6} height={h-6} rx={2} fill="none" stroke="rgba(201,168,76,0.3)" strokeWidth={1}/>
        <text x={w/2} y={h/2+Math.min(w,h)*0.14} textAnchor="middle" fontSize={Math.min(w,h)*0.4} fill="rgba(201,168,76,0.35)" fontFamily="Cinzel, Georgia, serif">✦</text>
      </g>
    );
  }
  const c = carta.palo.col;
  const v = carta.valor;
  const isAncho = v===1 && carta.palo.n==="Bastos";

  // Ases especiales
  if (v === 1) {
    if (carta.palo.n === "Bastos") return <AsBastos w={w} h={h}/>;
    if (carta.palo.n === "Oros")   return <AsOros w={w} h={h}/>;
    if (carta.palo.n === "Copas")  return <AsCopas w={w} h={h}/>;
    if (carta.palo.n === "Espadas") return <AsEspadas w={w} h={h}/>;
  }

  // Figuras
  if (v === 10 || v === 11 || v === 12) {
    return (
      <g>
        <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
        <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.4} opacity={0.4}/>
        {v === 11
          ? <CaballoSVG palo={carta.palo} w={w} h={h}/>
          : <FiguraCarta valor={v} palo={carta.palo} w={w} h={h}/>
        }
      </g>
    );
  }

  // Números 2-7: minimalista con palo grande
  const label = String(v);
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.3} opacity={0.35}/>
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.22)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">{label}</text>
      <PaloDecorativo palo={carta.palo} cx={w/2} cy={h/2} size={Math.min(w,h)*0.45}/>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.22)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>{label}</text>
    </g>
  );
}
