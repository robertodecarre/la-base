export function jerarquia(carta) {
  if (carta.valor === 1 && carta.palo.n === "Bastos") return 100;
  return carta.valor;
}
