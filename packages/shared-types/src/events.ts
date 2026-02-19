/**
 * Shared event contract for Kahoot-BT realtime.
 *
 * Dependency map (important):
 * - `api` (backend) depends on all payload types to validate incoming/outgoing events.
 * - `web-host` depends on host commands + server broadcasts.
 * - `web-player` depends on player commands + server broadcasts.
 * - `game-engine` depends on scoring constants and ranking types.
 *
 * Rule:
 * - This file must NOT import frontend/backend code.
 * - Frontend/backend import from this file, never the inverse.
 */

// Versioning this envelope lets us evolve contracts with backward compatibility.
export type WsEnvelope<TType extends string, TPayload> = {
  v: 1;
  type: TType;
  emittedAt: string; // ISO-8601
  requestId?: string;
  payload: TPayload;
};

export type RoomStatus = "waiting" | "in_progress" | "finished";
export type RoundStatus = "pending" | "active" | "scored" | "closed";

// Fixed 4-option model for MVP.
export type OptionIndex = 0 | 1 | 2 | 3;

export type Option = {
  optionId: string;
  text: string;
  index: OptionIndex;
};

export type Question = {
  questionId: string;
  title: string;
  options: [Option, Option, Option, Option];
  durationMs: 120000;
};

export type PlayerSummary = {
  playerId: string;
  username: string;
};

export type PlayerRankingItem = {
  playerId: string;
  username: string;
  totalScore: number;
  totalResponseMs: number;
  position: number;
};

// -----------------------------
// Client -> Server payloads
// -----------------------------

// Used by web-host and web-player when entering a room.
export type RoomJoinPayload = {
  roomId: string;
  username: string;
};

// Used only by web-host.
export type HostStartGamePayload = {
  roomId: string;
};

// Used only by web-host.
export type HostNextQuestionPayload = {
  roomId: string;
};

// Used only by web-player.
export type PlayerSubmitAnswerPayload = {
  roomId: string;
  roundId: string;
  optionId: string;
};

// -----------------------------
// Server -> Client payloads
// -----------------------------

export type RoomStateUpdatedPayload = {
  roomId: string;
  status: RoomStatus;
  players: PlayerSummary[];
  currentRoundId?: string;
};

export type QuestionStartedPayload = {
  roomId: string;
  roundId: string;
  question: Question;
  startedAt: string; // ISO-8601
  endsAt: string; // ISO-8601
};

export type QuestionTimerTickPayload = {
  roomId: string;
  roundId: string;
  remainingMs: number;
};

export type QuestionEndedPayload = {
  roomId: string;
  roundId: string;
  endedAt: string; // ISO-8601
  correctOptionId: string;
};

export type AnswerRevealPayload = {
  roomId: string;
  roundId: string;
  correctOptionId: string;
};

export type LeaderboardUpdatedPayload = {
  roomId: string;
  roundId: string;
  ranking: PlayerRankingItem[];
};

export type GameEndedPayload = {
  roomId: string;
  ranking: PlayerRankingItem[];
};

// -----------------------------
// Event names and typed maps
// -----------------------------

export const ClientToServerEvent = {
  ROOM_JOIN: "room.join",
  HOST_START_GAME: "host.start_game",
  HOST_NEXT_QUESTION: "host.next_question",
  PLAYER_SUBMIT_ANSWER: "player.submit_answer",
} as const;

export const ServerToClientEvent = {
  ROOM_STATE_UPDATED: "room.state_updated",
  QUESTION_STARTED: "question.started",
  QUESTION_TIMER_TICK: "question.timer_tick",
  QUESTION_ENDED: "question.ended",
  ANSWER_REVEAL: "answer.reveal",
  LEADERBOARD_UPDATED: "leaderboard.updated",
  GAME_ENDED: "game.ended",
} as const;

export type ClientToServerEventName =
  (typeof ClientToServerEvent)[keyof typeof ClientToServerEvent];

export type ServerToClientEventName =
  (typeof ServerToClientEvent)[keyof typeof ServerToClientEvent];

export type ClientToServerPayloadMap = {
  [ClientToServerEvent.ROOM_JOIN]: RoomJoinPayload;
  [ClientToServerEvent.HOST_START_GAME]: HostStartGamePayload;
  [ClientToServerEvent.HOST_NEXT_QUESTION]: HostNextQuestionPayload;
  [ClientToServerEvent.PLAYER_SUBMIT_ANSWER]: PlayerSubmitAnswerPayload;
};

export type ServerToClientPayloadMap = {
  [ServerToClientEvent.ROOM_STATE_UPDATED]: RoomStateUpdatedPayload;
  [ServerToClientEvent.QUESTION_STARTED]: QuestionStartedPayload;
  [ServerToClientEvent.QUESTION_TIMER_TICK]: QuestionTimerTickPayload;
  [ServerToClientEvent.QUESTION_ENDED]: QuestionEndedPayload;
  [ServerToClientEvent.ANSWER_REVEAL]: AnswerRevealPayload;
  [ServerToClientEvent.LEADERBOARD_UPDATED]: LeaderboardUpdatedPayload;
  [ServerToClientEvent.GAME_ENDED]: GameEndedPayload;
};

// -----------------------------
// Scoring constants for engine
// -----------------------------

// Backend game-engine depends on these to guarantee deterministic scoring.
export const SCORING = {
  TIME_LIMIT_MS: 120000,
  MAX_POINTS: 120,
} as const;
