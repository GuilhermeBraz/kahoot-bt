import { SCORING, type PlayerRankingItem, type Question, type RoomStatus } from "../../../packages/shared-types/src/index";

type PlayerState = {
  playerId: string;
  username: string;
  socketId: string;
  isHost: boolean;
  totalScore: number;
  totalResponseMs: number;
  firstCorrectAt?: number;
};

type AnswerState = {
  playerId: string;
  optionId: string;
  receivedAtMs: number;
  isCorrect: boolean;
  responseMs: number;
  awardedScore: number;
};

type RoundState = {
  roundId: string;
  question: Question;
  status: "active" | "ended";
  startedAtMs: number;
  endsAtMs: number;
  answersByPlayerId: Map<string, AnswerState>;
};

export type RoomState = {
  roomId: string;
  status: RoomStatus;
  hostSocketId?: string;
  playersBySocketId: Map<string, PlayerState>;
  playersById: Map<string, PlayerState>;
  rounds: RoundState[];
  currentRound?: RoundState;
  currentQuestionIndex: number;
};

/**
 * Dependency note:
 * - `server.ts` depends on this class to keep all game rules in one place.
 * - Future DB module should depend on snapshots from here, not the opposite.
 */
export class GameStore {
  private readonly rooms = new Map<string, RoomState>();

  // MVP question bank. In later steps, this will come from host CRUD + DB.
  private readonly questions: Question[] = [
    {
      questionId: "q1",
      title: "Qual linguagem executa no navegador por padrão?",
      options: [
        { optionId: "a", text: "Java", index: 0 },
        { optionId: "b", text: "JavaScript", index: 1 },
        { optionId: "c", text: "Python", index: 2 },
        { optionId: "d", text: "Rust", index: 3 }
      ],
      durationMs: 120000
    }
  ];

  getOrCreateRoom(roomId: string): RoomState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        status: "waiting",
        playersBySocketId: new Map(),
        playersById: new Map(),
        rounds: [],
        currentQuestionIndex: -1
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  joinRoom(input: { roomId: string; username: string; socketId: string }): { room: RoomState; player: PlayerState; becameHost: boolean } {
    const room = this.getOrCreateRoom(input.roomId);

    const duplicated = Array.from(room.playersById.values()).some(
      (p) => p.username.toLowerCase() === input.username.toLowerCase()
    );
    if (duplicated) {
      throw new Error("USERNAME_ALREADY_IN_USE");
    }

    const playerId = `p_${Math.random().toString(36).slice(2, 10)}`;
    const player: PlayerState = {
      playerId,
      username: input.username,
      socketId: input.socketId,
      isHost: false,
      totalScore: 0,
      totalResponseMs: 0
    };

    room.playersBySocketId.set(input.socketId, player);
    room.playersById.set(playerId, player);

    const becameHost = !room.hostSocketId;
    if (becameHost) {
      room.hostSocketId = input.socketId;
      player.isHost = true;
    }

    return { room, player, becameHost };
  }

  removeSocket(socketId: string): RoomState | undefined {
    for (const room of this.rooms.values()) {
      const player = room.playersBySocketId.get(socketId);
      if (!player) continue;

      room.playersBySocketId.delete(socketId);
      room.playersById.delete(player.playerId);

      if (room.hostSocketId === socketId) {
        room.hostSocketId = Array.from(room.playersBySocketId.keys())[0];
      }

      return room;
    }
    return undefined;
  }

  startGame(room: RoomState, callerSocketId: string): void {
    this.assertHost(room, callerSocketId);
    if (room.status !== "waiting") throw new Error("ROOM_NOT_WAITING");
    room.status = "in_progress";
  }

  nextQuestion(room: RoomState, callerSocketId: string): RoundState {
    this.assertHost(room, callerSocketId);
    if (room.status !== "in_progress") throw new Error("ROOM_NOT_IN_PROGRESS");
    if (room.currentRound && room.currentRound.status === "active") throw new Error("ROUND_ALREADY_ACTIVE");

    room.currentQuestionIndex += 1;
    const question = this.questions[room.currentQuestionIndex];
    if (!question) throw new Error("NO_MORE_QUESTIONS");

    const startedAtMs = Date.now();
    const round: RoundState = {
      roundId: `r_${room.currentQuestionIndex + 1}`,
      question,
      status: "active",
      startedAtMs,
      endsAtMs: startedAtMs + question.durationMs,
      answersByPlayerId: new Map()
    };

    room.currentRound = round;
    room.rounds.push(round);
    return round;
  }

  submitAnswer(input: { room: RoomState; callerSocketId: string; roundId: string; optionId: string; nowMs: number }): AnswerState {
    const player = input.room.playersBySocketId.get(input.callerSocketId);
    if (!player) throw new Error("PLAYER_NOT_IN_ROOM");
    if (player.isHost) throw new Error("HOST_CANNOT_ANSWER");

    const round = input.room.currentRound;
    if (!round || round.roundId !== input.roundId) throw new Error("ROUND_NOT_FOUND");
    if (round.status !== "active") throw new Error("ROUND_NOT_ACTIVE");
    if (round.answersByPlayerId.has(player.playerId)) throw new Error("ALREADY_ANSWERED");
    if (input.nowMs > round.endsAtMs) throw new Error("ANSWER_OUT_OF_TIME");

    const correctOptionId = round.question.options[1].optionId; // question fake: "JavaScript"
    const isCorrect = input.optionId === correctOptionId;
    const responseMs = input.nowMs - round.startedAtMs;

    let awardedScore = 0;
    if (isCorrect) {
      const remainingMs = Math.max(0, round.endsAtMs - input.nowMs);
      const raw = Math.round(SCORING.MAX_POINTS * (remainingMs / SCORING.TIME_LIMIT_MS));
      awardedScore = Math.max(1, raw);
      player.totalScore += awardedScore;
      player.totalResponseMs += responseMs;
      if (player.firstCorrectAt === undefined) player.firstCorrectAt = input.nowMs;
    }

    const answer: AnswerState = {
      playerId: player.playerId,
      optionId: input.optionId,
      receivedAtMs: input.nowMs,
      isCorrect,
      responseMs,
      awardedScore
    };

    round.answersByPlayerId.set(player.playerId, answer);
    return answer;
  }

  shouldEndRound(room: RoomState): boolean {
    const round = room.currentRound;
    if (!round || round.status !== "active") return false;

    const totalAnsweringPlayers = Array.from(room.playersById.values()).filter((p) => !p.isHost).length;
    if (totalAnsweringPlayers === 0) return true;

    return round.answersByPlayerId.size >= totalAnsweringPlayers || Date.now() >= round.endsAtMs;
  }

  endRound(room: RoomState): { round: RoundState; correctOptionId: string; ranking: PlayerRankingItem[]; gameEnded: boolean } {
    const round = room.currentRound;
    if (!round) throw new Error("ROUND_NOT_FOUND");

    round.status = "ended";
    const correctOptionId = round.question.options[1].optionId;
    const ranking = this.getRanking(room);

    const gameEnded = room.currentQuestionIndex >= this.questions.length - 1;
    if (gameEnded) room.status = "finished";

    return { round, correctOptionId, ranking, gameEnded };
  }

  getRoomStatePayload(room: RoomState): {
    roomId: string;
    status: RoomStatus;
    players: Array<{ playerId: string; username: string }>;
    currentRoundId?: string;
  } {
    return {
      roomId: room.roomId,
      status: room.status,
      players: Array.from(room.playersById.values()).map((p) => ({ playerId: p.playerId, username: p.username })),
      currentRoundId: room.currentRound?.roundId
    };
  }

  getRanking(room: RoomState): PlayerRankingItem[] {
    const sorted = Array.from(room.playersById.values()).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (a.totalResponseMs !== b.totalResponseMs) return a.totalResponseMs - b.totalResponseMs;
      if ((a.firstCorrectAt ?? Number.MAX_SAFE_INTEGER) !== (b.firstCorrectAt ?? Number.MAX_SAFE_INTEGER)) {
        return (a.firstCorrectAt ?? Number.MAX_SAFE_INTEGER) - (b.firstCorrectAt ?? Number.MAX_SAFE_INTEGER);
      }
      return a.username.localeCompare(b.username);
    });

    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      username: p.username,
      totalScore: p.totalScore,
      totalResponseMs: p.totalResponseMs,
      position: idx + 1
    }));
  }

  private assertHost(room: RoomState, callerSocketId: string): void {
    if (!room.hostSocketId || room.hostSocketId !== callerSocketId) throw new Error("NOT_ROOM_HOST");
  }
}
