export function opcionesValidas(pedidoMano, totalBases) {
  // La suma debe ser exactamente total-1 o total+1
  const opts = [];
  const a = totalBases - 1 - pedidoMano; // suma = total-1
  const b = totalBases + 1 - pedidoMano; // suma = total+1
  if (a >= 0 && a <= totalBases) opts.push(a);
  if (b >= 0 && b <= totalBases && b !== a) opts.push(b);
  return opts.sort((x,y)=>x-y);
}
