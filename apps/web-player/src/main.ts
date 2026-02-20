import { io, type Socket } from "socket.io-client";
import {
  ClientToServerEvent,
  ServerToClientEvent,
  type LeaderboardUpdatedPayload,
  type QuestionEndedPayload,
  type QuestionStartedPayload,
  type QuestionTimerTickPayload,
  type RoomJoinPayload,
  type RoomStateUpdatedPayload,
  type WsEnvelope
} from "../../../packages/shared-types/src/index";

/**
 * Dependency note:
 * - Depends on `shared-types` only for event names/payload contracts.
 * - Server remains source of truth for game state and scoring.
 */

type UiMode = "organizer" | "participant" | "debug";

let socket: Socket | null = null;
let mode: UiMode | null = null;
let currentRoomId = "";
let currentRoundId = "";
let connectedUsername = "";
let isHost = false;

const el = {
  modeOrganizerBtn: document.getElementById("modeOrganizerBtn") as HTMLButtonElement,
  modeParticipantBtn: document.getElementById("modeParticipantBtn") as HTMLButtonElement,
  modeDebugBtn: document.getElementById("modeDebugBtn") as HTMLButtonElement,
  modeHint: document.getElementById("modeHint") as HTMLParagraphElement,
  joinCard: document.getElementById("join-card") as HTMLDivElement,
  apiUrl: document.getElementById("apiUrl") as HTMLInputElement,
  createRoomWrap: document.getElementById("create-room-wrap") as HTMLDivElement,
  generatedRoomId: document.getElementById("generatedRoomId") as HTMLInputElement,
  generateRoomBtn: document.getElementById("generateRoomBtn") as HTMLButtonElement,
  roomId: document.getElementById("roomId") as HTMLInputElement,
  username: document.getElementById("username") as HTMLInputElement,
  joinBtn: document.getElementById("joinBtn") as HTMLButtonElement,
  joinHint: document.getElementById("joinHint") as HTMLParagraphElement,
  sessionCard: document.getElementById("session-card") as HTMLDivElement,
  sessionInfo: document.getElementById("sessionInfo") as HTMLParagraphElement,
  modeTag: document.getElementById("modeTag") as HTMLSpanElement,
  roomStatus: document.getElementById("roomStatus") as HTMLSpanElement,
  hostCard: document.getElementById("host-card") as HTMLDivElement,
  startBtn: document.getElementById("startBtn") as HTMLButtonElement,
  nextBtn: document.getElementById("nextBtn") as HTMLButtonElement,
  questionCard: document.getElementById("question-card") as HTMLDivElement,
  questionTitle: document.getElementById("questionTitle") as HTMLHeadingElement,
  timer: document.getElementById("timer") as HTMLParagraphElement,
  answers: document.getElementById("answers") as HTMLDivElement,
  answerAck: document.getElementById("answerAck") as HTMLParagraphElement,
  roundCard: document.getElementById("round-card") as HTMLDivElement,
  correctAnswer: document.getElementById("correctAnswer") as HTMLParagraphElement,
  rankCard: document.getElementById("rank-card") as HTMLDivElement,
  ranking: document.getElementById("ranking") as HTMLOListElement,
  logsCard: document.getElementById("logs-card") as HTMLDivElement,
  logs: document.getElementById("logs") as HTMLPreElement
};

function log(message: string, payload?: unknown): void {
  if (mode !== "debug") return;
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message;
  el.logs.textContent = `${new Date().toISOString()} ${line}\n${el.logs.textContent}`;
}

function env<TType extends string, TPayload>(type: TType, payload: TPayload): WsEnvelope<TType, TPayload> {
  return {
    v: 1,
    type,
    emittedAt: new Date().toISOString(),
    payload
  };
}

function show(node: HTMLElement): void {
  node.classList.remove("hidden");
}

function hide(node: HTMLElement): void {
  node.classList.add("hidden");
}

function randomRoomId(): string {
  return `room_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function setMode(nextMode: UiMode): void {
  mode = nextMode;

  el.modeOrganizerBtn.classList.remove("active-mode");
  el.modeParticipantBtn.classList.remove("active-mode");
  el.modeDebugBtn.classList.remove("active-mode");

  show(el.joinCard);

  if (nextMode === "organizer") {
    el.modeOrganizerBtn.classList.add("active-mode");
    el.modeHint.textContent = "Modo organizador: gere a sala e controle o jogo.";
    el.joinHint.textContent = "Você deve entrar primeiro para assumir o host no MVP atual.";
    show(el.createRoomWrap);
    el.roomId.value = randomRoomId();
    el.generatedRoomId.value = el.roomId.value;
  }

  if (nextMode === "participant") {
    el.modeParticipantBtn.classList.add("active-mode");
    el.modeHint.textContent = "Modo participante: apenas entre em uma sala existente e responda.";
    el.joinHint.textContent = "Informe o Room ID fornecido pelo organizador.";
    hide(el.createRoomWrap);
  }

  if (nextMode === "debug") {
    el.modeDebugBtn.classList.add("active-mode");
    el.modeHint.textContent = "Modo debug: mostra logs e controles completos para testes.";
    el.joinHint.textContent = "Use este modo para investigar eventos e estados.";
    show(el.createRoomWrap);
    if (!el.roomId.value.trim()) {
      el.roomId.value = randomRoomId();
    }
    el.generatedRoomId.value = el.roomId.value;
    show(el.logsCard);
  }
}

function sendJoin(): void {
  if (!socket) return;

  const payload: RoomJoinPayload = {
    roomId: currentRoomId,
    username: connectedUsername
  };

  socket.emit(ClientToServerEvent.ROOM_JOIN, env(ClientToServerEvent.ROOM_JOIN, payload));
  log("emit room.join", payload);
}

function connect(): void {
  if (!mode) {
    alert("Escolha um modo primeiro.");
    return;
  }

  const apiUrl = el.apiUrl.value.trim() || "http://localhost:3333";
  const roomId = el.roomId.value.trim();
  const username = el.username.value.trim();

  if (!roomId || !username) {
    alert("Informe roomId e username");
    return;
  }

  currentRoomId = roomId;
  connectedUsername = username;

  const url = new URL(window.location.href);
  url.searchParams.set("mode", mode);
  url.searchParams.set("roomId", roomId);
  url.searchParams.set("username", username);
  window.history.replaceState({}, "", url);

  socket = io(apiUrl);

  socket.on("connect", () => {
    show(el.sessionCard);
    el.modeTag.textContent = `modo: ${mode}`;
    el.sessionInfo.textContent = `Conectado como ${connectedUsername} em ${currentRoomId}`;
    sendJoin();
    log("socket connected", { socketId: socket?.id });
  });

  socket.on("disconnect", () => {
    log("socket disconnected");
  });

  socket.on("debug.error", (msg) => {
    log("debug.error", msg);
    if (mode !== "debug") {
      el.joinHint.textContent = `Erro: ${String(msg?.code ?? "unknown")}`;
      el.joinHint.classList.add("warn");
    }
  });

  socket.on("debug.join_ack", (msg) => {
    isHost = Boolean(msg?.becameHost);
    log("debug.join_ack", msg);

    if (isHost) {
      show(el.hostCard);
    }

    if (mode === "organizer" && !isHost) {
      el.joinHint.textContent = "Você entrou como organizador, mas esta sala já tinha host.";
      el.joinHint.classList.add("warn");
    }
  });

  socket.on("debug.answer_ack", (msg) => {
    el.answerAck.textContent = `Resposta enviada • correta=${String(msg.isCorrect)} • pontos=${msg.awardedScore} • tempo=${msg.responseMs}ms`;
    log("debug.answer_ack", msg);
  });

  socket.on(ServerToClientEvent.ROOM_STATE_UPDATED, (msg: WsEnvelope<typeof ServerToClientEvent.ROOM_STATE_UPDATED, RoomStateUpdatedPayload>) => {
    el.roomStatus.textContent = `room status: ${msg.payload.status}`;
    show(el.sessionCard);
    log("room.state_updated", msg.payload);
  });

  socket.on(ServerToClientEvent.QUESTION_STARTED, (msg: WsEnvelope<typeof ServerToClientEvent.QUESTION_STARTED, QuestionStartedPayload>) => {
    currentRoundId = msg.payload.roundId;
    show(el.questionCard);
    show(el.roundCard);
    el.questionTitle.textContent = msg.payload.question.title;
    el.answerAck.textContent = "";
    el.correctAnswer.textContent = "Correta: aguardando fim da rodada";

    el.answers.innerHTML = "";
    for (const option of msg.payload.question.options) {
      const btn = document.createElement("button");
      btn.className = "answer-btn";
      btn.textContent = `${option.index + 1}. ${option.text}`;
      btn.onclick = () => submitAnswer(option.optionId);
      el.answers.appendChild(btn);
    }

    log("question.started", { roundId: currentRoundId, title: msg.payload.question.title });
  });

  socket.on(ServerToClientEvent.QUESTION_TIMER_TICK, (msg: WsEnvelope<typeof ServerToClientEvent.QUESTION_TIMER_TICK, QuestionTimerTickPayload>) => {
    if (msg.payload.roundId !== currentRoundId) return;
    el.timer.textContent = `Tempo restante: ${(msg.payload.remainingMs / 1000).toFixed(1)}s`;
  });

  socket.on(ServerToClientEvent.QUESTION_ENDED, (msg: WsEnvelope<typeof ServerToClientEvent.QUESTION_ENDED, QuestionEndedPayload>) => {
    el.correctAnswer.textContent = `Correta: ${msg.payload.correctOptionId}`;
    log("question.ended", msg.payload);
  });

  socket.on(ServerToClientEvent.LEADERBOARD_UPDATED, (msg: WsEnvelope<typeof ServerToClientEvent.LEADERBOARD_UPDATED, LeaderboardUpdatedPayload>) => {
    show(el.rankCard);
    el.ranking.innerHTML = "";
    for (const item of msg.payload.ranking) {
      const li = document.createElement("li");
      li.textContent = `${item.username} • ${item.totalScore} pts • ${item.totalResponseMs}ms`;
      el.ranking.appendChild(li);
    }
    log("leaderboard.updated", msg.payload);
  });

  socket.on(ServerToClientEvent.GAME_ENDED, (msg) => {
    log("game.ended", msg.payload);
  });
}

function submitAnswer(optionId: string): void {
  if (!socket || !currentRoundId || !currentRoomId) return;

  const payload = {
    roomId: currentRoomId,
    roundId: currentRoundId,
    optionId
  };

  socket.emit(
    ClientToServerEvent.PLAYER_SUBMIT_ANSWER,
    env(ClientToServerEvent.PLAYER_SUBMIT_ANSWER, payload)
  );

  log("emit player.submit_answer", payload);
}

el.modeOrganizerBtn.addEventListener("click", () => setMode("organizer"));
el.modeParticipantBtn.addEventListener("click", () => setMode("participant"));
el.modeDebugBtn.addEventListener("click", () => setMode("debug"));

el.generateRoomBtn.addEventListener("click", () => {
  const next = randomRoomId();
  el.roomId.value = next;
  el.generatedRoomId.value = next;
});

el.joinBtn.addEventListener("click", connect);

el.startBtn.addEventListener("click", () => {
  if (!socket || !isHost) return;
  const payload = { roomId: currentRoomId };
  socket.emit(ClientToServerEvent.HOST_START_GAME, env(ClientToServerEvent.HOST_START_GAME, payload));
  log("emit host.start_game", payload);
});

el.nextBtn.addEventListener("click", () => {
  if (!socket || !isHost) return;
  const payload = { roomId: currentRoomId };
  socket.emit(ClientToServerEvent.HOST_NEXT_QUESTION, env(ClientToServerEvent.HOST_NEXT_QUESTION, payload));
  log("emit host.next_question", payload);
});

// Quick defaults from URL.
const query = new URLSearchParams(window.location.search);
el.apiUrl.value = query.get("apiUrl") ?? "http://localhost:3333";
el.roomId.value = query.get("roomId") ?? "";
el.username.value = query.get("username") ?? "";

const preMode = query.get("mode");
if (preMode === "organizer" || preMode === "participant" || preMode === "debug") {
  setMode(preMode);
} else {
  setMode("participant");
}
