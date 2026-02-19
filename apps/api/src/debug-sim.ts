import { io } from "socket.io-client";
import { ClientToServerEvent, ServerToClientEvent } from "../../../packages/shared-types/src/index";

const URL = process.env.API_URL ?? "http://localhost:3333";
const ROOM_ID = "room_debug";

function env<T extends string, P>(type: T, payload: P) {
  return {
    v: 1 as const,
    type,
    emittedAt: new Date().toISOString(),
    payload
  };
}

function connect(username: string) {
  const socket = io(URL);

  socket.on("connect", () => {
    socket.emit(
      ClientToServerEvent.ROOM_JOIN,
      env(ClientToServerEvent.ROOM_JOIN, {
        roomId: ROOM_ID,
        username
      })
    );
  });

  socket.on("debug.join_ack", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] join_ack`, msg);
  });

  socket.on("debug.answer_ack", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] answer_ack`, msg);
  });

  socket.on("debug.error", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] error`, msg);
  });

  socket.on(ServerToClientEvent.ROOM_STATE_UPDATED, (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] room.state_updated`, msg.payload.status, msg.payload.players.length);
  });

  socket.on(ServerToClientEvent.QUESTION_STARTED, (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] question.started`, msg.payload.roundId, msg.payload.question.title);
  });

  socket.on(ServerToClientEvent.QUESTION_ENDED, (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] question.ended`, msg.payload.correctOptionId);
  });

  socket.on(ServerToClientEvent.LEADERBOARD_UPDATED, (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] leaderboard.updated`, msg.payload.ranking);
  });

  socket.on(ServerToClientEvent.GAME_ENDED, (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${username}] game.ended`, msg.payload.ranking);
  });

  return socket;
}

async function main() {
  const host = connect("host");
  const p1 = connect("ana");
  const p2 = connect("joao");

  setTimeout(() => {
    host.emit(
      ClientToServerEvent.HOST_START_GAME,
      env(ClientToServerEvent.HOST_START_GAME, { roomId: ROOM_ID })
    );
  }, 800);

  setTimeout(() => {
    host.emit(
      ClientToServerEvent.HOST_NEXT_QUESTION,
      env(ClientToServerEvent.HOST_NEXT_QUESTION, { roomId: ROOM_ID })
    );
  }, 1400);

  // Question fake: correta = optionId "b"
  setTimeout(() => {
    p1.emit(
      ClientToServerEvent.PLAYER_SUBMIT_ANSWER,
      env(ClientToServerEvent.PLAYER_SUBMIT_ANSWER, {
        roomId: ROOM_ID,
        roundId: "r_1",
        optionId: "b"
      })
    );
  }, 2500);

  setTimeout(() => {
    p2.emit(
      ClientToServerEvent.PLAYER_SUBMIT_ANSWER,
      env(ClientToServerEvent.PLAYER_SUBMIT_ANSWER, {
        roomId: ROOM_ID,
        roundId: "r_1",
        optionId: "a"
      })
    );
  }, 4500);

  setTimeout(() => {
    host.close();
    p1.close();
    p2.close();
    process.exit(0);
  }, 9000);
}

main();
