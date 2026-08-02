import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, asegurarSesion } from "../lib/supabase";

// Reemplaza una fila por clave (o la agrega si no existía). `claves` es la
// lista de columnas que identifican la fila de forma única — `id` para la
// mayoría de las tablas, pero hand_results no tiene `id` (su PK es
// room_id+hand_number), así que la clave es configurable por tabla.
function upsertPorClave(lista, fila, claves) {
  const coincide = (x) => claves.every((k) => x[k] === fila[k]);
  const idx = lista.findIndex(coincide);
  if (idx === -1) return [...lista, fila];
  const copia = [...lista];
  copia[idx] = fila;
  return copia;
}

function eliminarPorClave(lista, fila, claves) {
  return lista.filter((x) => !claves.every((k) => x[k] === fila[k]));
}

function aplicarCambio(lista, payload, claves) {
  if (payload.eventType === "DELETE") return eliminarPorClave(lista, payload.old, claves);
  return upsertPorClave(lista, payload.new, claves);
}

// ══════════════════════════════════════════════
// USE SALA — estado en vivo de una sala online
// ══════════════════════════════════════════════
// Se suscribe a rooms/players/game_state/played_cards/hand_results vía
// Realtime. `hands` (las cartas de cada jugador) queda deliberadamente
// fuera de la publicación (ver 20260706000000_online_multiplayer_schema.sql)
// — nunca se transmite, solo se puede pedir explícitamente con
// fetchMyHand() después de cada repartir/jugar propio.
export function useSala(roomId) {
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [playedCards, setPlayedCards] = useState([]);
  const [handResults, setHandResults] = useState([]);
  const [userId, setUserId] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const channelRef = useRef(null);

  // Piece RR (batch overnight post-EE, follow-up a piece KK): re-fetch
  // manual de las 5 tablas, para usar después de una operación que
  // resetea un montón de estado de golpe (REVANCHA) en vez de confiar en
  // que cada delta de Realtime individual (potencialmente decenas de
  // DELETEs de played_cards de la partida anterior, más el UPDATE de
  // game_state) llegue entero y en orden — piece KK ya diagnosticó que no
  // hay ninguna garantía de eso acá (ver useSala.js's propio comentario
  // sobre "postgres_changes nunca hace backfill": eso cubre el caso de
  // una sesión que se suscribe tarde, pero una sesión YA suscripta que
  // simplemente pierde/reordena un evento puntual bajo carga no tiene
  // ninguna red — exactamente el mismo síntoma, causa distinta). Mismas
  // 5 queries que la carga inicial, factorizadas para no duplicar el
  // cuerpo. No toca la suscripción de Realtime — sigue viva, esto solo
  // pisa el snapshot local con el estado real del servidor en un punto
  // conocido.
  const recargarEstado = useCallback(async () => {
    if (!roomId) return;
    const [rooms_, players_, gameStates_, playedCards_, handResults_] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
      supabase.from("players").select("*").eq("room_id", roomId),
      supabase.from("game_state").select("*").eq("room_id", roomId).maybeSingle(),
      supabase.from("played_cards").select("*").eq("room_id", roomId),
      supabase.from("hand_results").select("*").eq("room_id", roomId),
    ]);
    if (rooms_.error) throw rooms_.error;
    if (players_.error) throw players_.error;
    if (gameStates_.error) throw gameStates_.error;
    if (playedCards_.error) throw playedCards_.error;
    if (handResults_.error) throw handResults_.error;

    setRoom(rooms_.data ?? null);
    setPlayers(players_.data ?? []);
    setGameState(gameStates_.data ?? null);
    setPlayedCards(playedCards_.data ?? []);
    setHandResults(handResults_.data ?? []);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let cancelado = false;
    setReady(false);

    (async () => {
      try {
        const sesion = await asegurarSesion();
        if (cancelado) return;
        setUserId(sesion.user.id);

        // Carga inicial: postgres_changes solo entrega eventos futuros, no
        // hace backfill del estado ya existente al momento de suscribirse.
        const [rooms_, players_, gameStates_, playedCards_, handResults_] = await Promise.all([
          supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
          supabase.from("players").select("*").eq("room_id", roomId),
          supabase.from("game_state").select("*").eq("room_id", roomId).maybeSingle(),
          supabase.from("played_cards").select("*").eq("room_id", roomId),
          supabase.from("hand_results").select("*").eq("room_id", roomId),
        ]);
        if (cancelado) return;
        if (rooms_.error) throw rooms_.error;
        if (players_.error) throw players_.error;
        if (gameStates_.error) throw gameStates_.error;
        if (playedCards_.error) throw playedCards_.error;
        if (handResults_.error) throw handResults_.error;

        setRoom(rooms_.data ?? null);
        setPlayers(players_.data ?? []);
        setGameState(gameStates_.data ?? null);
        setPlayedCards(playedCards_.data ?? []);
        setHandResults(handResults_.data ?? []);

        const channel = supabase
          .channel(`sala:${roomId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
            (payload) => setRoom(payload.eventType === "DELETE" ? null : payload.new)
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
            (payload) => setPlayers((prev) => aplicarCambio(prev, payload, ["id"]))
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "game_state", filter: `room_id=eq.${roomId}` },
            (payload) => setGameState(payload.eventType === "DELETE" ? null : payload.new)
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "played_cards", filter: `room_id=eq.${roomId}` },
            (payload) => setPlayedCards((prev) => aplicarCambio(prev, payload, ["id"]))
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "hand_results", filter: `room_id=eq.${roomId}` },
            (payload) => setHandResults((prev) => aplicarCambio(prev, payload, ["room_id", "hand_number"]))
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") setReady(true);
          });

        channelRef.current = channel;
      } catch (err) {
        if (!cancelado) setError(err);
      }
    })();

    return () => {
      cancelado = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId]);

  const yo = players.find((p) => p.user_id === userId) ?? null;

  // Espejo online de "abrir la propia mano" — se llama después de cada
  // deal_hand/play_card propio, nunca en respuesta a un evento realtime
  // (no existe tal evento para `hands`, a propósito).
  const fetchMyHand = useCallback(
    async (handNumber) => {
      if (!roomId) return null;
      const { data, error: err } = await supabase
        .from("hands")
        .select("cards")
        .eq("room_id", roomId)
        .eq("hand_number", handNumber)
        .maybeSingle();
      if (err) throw err;
      return data?.cards ?? null;
    },
    [roomId]
  );

  return {
    room,
    players,
    gameState,
    playedCards,
    handResults,
    userId,
    mySeat: yo?.seat ?? null,
    myTeam: yo?.team ?? null,
    isCaptain: yo?.is_captain ?? false,
    ready,
    error,
    fetchMyHand,
    recargarEstado,
  };
}
