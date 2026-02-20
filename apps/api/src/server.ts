import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  ClientToServerEvent,
  ServerToClientEvent,
  type HostNextQuestionPayload,
  type HostSetQuestionBankPayload,
  type HostStartGamePayload,
  type PlayerSubmitAnswerPayload,
  type RoomJoinPayload,
  type WsEnvelope
} from "../../../packages/shared-types/src/index";
import { GameStore } from "./game";

/**
 * Dependency note:
 * - This file orchestrates network I/O only.
 * - Business rules live in `game.ts` and are reused by future transports (HTTP/tests).
 */

const PORT = Number(process.env.PORT ?? 3333);
const TICK_INTERVAL_MS = 1000;

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

const game = new GameStore();

function emitTyped<TType extends string, TPayload>(roomId: string, type: TType, payload: TPayload): void {
  const msg: WsEnvelope<TType, TPayload> = {
    v: 1,
    type,
    emittedAt: new Date().toISOString(),
    payload
  };
  io.to(roomId).emit(type, msg);
}

io.on("connection", (socket) => {
  socket.on(ClientToServerEvent.ROOM_JOIN, (envelope: WsEnvelope<typeof ClientToServerEvent.ROOM_JOIN, RoomJoinPayload>) => {
    try {
      const { roomId, username } = envelope.payload;
      const { room, player, becameHost } = game.joinRoom({ roomId, username, socketId: socket.id });

      socket.join(roomId);

      emitTyped(roomId, ServerToClientEvent.ROOM_STATE_UPDATED, game.getRoomStatePayload(room));

      socket.emit("debug.join_ack", {
        playerId: player.playerId,
        roomId,
        becameHost
      });
    } catch (error) {
      socket.emit("debug.error", { code: (error as Error).message });
    }
  });

  socket.on(ClientToServerEvent.HOST_START_GAME, (envelope: WsEnvelope<typeof ClientToServerEvent.HOST_START_GAME, HostStartGamePayload>) => {
    try {
      const room = game.getOrCreateRoom(envelope.payload.roomId);
      game.startGame(room, socket.id);
      emitTyped(room.roomId, ServerToClientEvent.ROOM_STATE_UPDATED, game.getRoomStatePayload(room));
    } catch (error) {
      socket.emit("debug.error", { code: (error as Error).message });
    }
  });

  socket.on(
    ClientToServerEvent.HOST_SET_QUESTION_BANK,
    (envelope: WsEnvelope<typeof ClientToServerEvent.HOST_SET_QUESTION_BANK, HostSetQuestionBankPayload>) => {
      try {
        const { roomId, source, questions } = envelope.payload;
        const room = game.getOrCreateRoom(roomId);

        const result = game.setQuestionBank({
          room,
          callerSocketId: socket.id,
          source,
          questions
        });

        emitTyped(room.roomId, ServerToClientEvent.ROOM_STATE_UPDATED, game.getRoomStatePayload(room));
        socket.emit("debug.question_bank_ack", result);
      } catch (error) {
        socket.emit("debug.error", { code: (error as Error).message });
      }
    }
  );

  socket.on(ClientToServerEvent.HOST_NEXT_QUESTION, (envelope: WsEnvelope<typeof ClientToServerEvent.HOST_NEXT_QUESTION, HostNextQuestionPayload>) => {
    try {
      const room = game.getOrCreateRoom(envelope.payload.roomId);
      const round = game.nextQuestion(room, socket.id);

      emitTyped(room.roomId, ServerToClientEvent.QUESTION_STARTED, {
        roomId: room.roomId,
        roundId: round.roundId,
        question: round.question,
        startedAt: new Date(round.startedAtMs).toISOString(),
        endsAt: new Date(round.endsAtMs).toISOString()
      });

      const timer = setInterval(() => {
        const remainingMs = Math.max(0, round.endsAtMs - Date.now());

        emitTyped(room.roomId, ServerToClientEvent.QUESTION_TIMER_TICK, {
          roomId: room.roomId,
          roundId: round.roundId,
          remainingMs
        });

        if (game.shouldEndRound(room)) {
          clearInterval(timer);
          const ended = game.endRound(room);

          emitTyped(room.roomId, ServerToClientEvent.QUESTION_ENDED, {
            roomId: room.roomId,
            roundId: ended.round.roundId,
            endedAt: new Date().toISOString(),
            correctOptionId: ended.correctOptionId
          });

          emitTyped(room.roomId, ServerToClientEvent.ANSWER_REVEAL, {
            roomId: room.roomId,
            roundId: ended.round.roundId,
            correctOptionId: ended.correctOptionId
          });

          emitTyped(room.roomId, ServerToClientEvent.LEADERBOARD_UPDATED, {
            roomId: room.roomId,
            roundId: ended.round.roundId,
            ranking: ended.ranking
          });

          emitTyped(room.roomId, ServerToClientEvent.ROOM_STATE_UPDATED, game.getRoomStatePayload(room));

          if (ended.gameEnded) {
            emitTyped(room.roomId, ServerToClientEvent.GAME_ENDED, {
              roomId: room.roomId,
              ranking: ended.ranking
            });
          }
        }
      }, TICK_INTERVAL_MS);
    } catch (error) {
      socket.emit("debug.error", { code: (error as Error).message });
    }
  });

  socket.on(
    ClientToServerEvent.PLAYER_SUBMIT_ANSWER,
    (envelope: WsEnvelope<typeof ClientToServerEvent.PLAYER_SUBMIT_ANSWER, PlayerSubmitAnswerPayload>) => {
      try {
        const { roomId, roundId, optionId } = envelope.payload;
        const room = game.getOrCreateRoom(roomId);

        const answer = game.submitAnswer({
          room,
          callerSocketId: socket.id,
          roundId,
          optionId,
          nowMs: Date.now()
        });

        socket.emit("debug.answer_ack", {
          roomId,
          roundId,
          isCorrect: answer.isCorrect,
          awardedScore: answer.awardedScore,
          responseMs: answer.responseMs
        });
      } catch (error) {
        socket.emit("debug.error", { code: (error as Error).message });
      }
    }
  );

  socket.on("disconnect", () => {
    const room = game.removeSocket(socket.id);
    if (room) {
      emitTyped(room.roomId, ServerToClientEvent.ROOM_STATE_UPDATED, game.getRoomStatePayload(room));
    }
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API realtime ouvindo em http://localhost:${PORT}`);
});
