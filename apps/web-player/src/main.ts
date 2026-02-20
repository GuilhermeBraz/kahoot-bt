import { io, type Socket } from "socket.io-client";
import {
  ClientToServerEvent,
  ServerToClientEvent,
  type HostQuestionInput,
  type HostSetQuestionBankPayload,
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
let draftQuestions: HostQuestionInput[] = [];

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
  questionSourceTag: document.getElementById("questionSourceTag") as HTMLSpanElement,
  hostCard: document.getElementById("host-card") as HTMLDivElement,
  startBtn: document.getElementById("startBtn") as HTMLButtonElement,
  nextBtn: document.getElementById("nextBtn") as HTMLButtonElement,
  questionBankCard: document.getElementById("question-bank-card") as HTMLDivElement,
  qTitle: document.getElementById("qTitle") as HTMLInputElement,
  qA: document.getElementById("qA") as HTMLInputElement,
  qB: document.getElementById("qB") as HTMLInputElement,
  qC: document.getElementById("qC") as HTMLInputElement,
  qD: document.getElementById("qD") as HTMLInputElement,
  qCorrectIndex: document.getElementById("qCorrectIndex") as HTMLInputElement,
  addManualQuestionBtn: document.getElementById("addManualQuestionBtn") as HTMLButtonElement,
  csvInput: document.getElementById("csvInput") as HTMLTextAreaElement,
  csvFileInput: document.getElementById("csvFileInput") as HTMLInputElement,
  parseCsvBtn: document.getElementById("parseCsvBtn") as HTMLButtonElement,
  draftQuestions: document.getElementById("draftQuestions") as HTMLOListElement,
  publishManualBtn: document.getElementById("publishManualBtn") as HTMLButtonElement,
  publishCsvBtn: document.getElementById("publishCsvBtn") as HTMLButtonElement,
  clearDraftBtn: document.getElementById("clearDraftBtn") as HTMLButtonElement,
  questionBankAck: document.getElementById("questionBankAck") as HTMLParagraphElement,
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
  hide(el.questionBankCard);

  if (nextMode === "organizer") {
    el.modeOrganizerBtn.classList.add("active-mode");
    el.modeHint.textContent = "Modo organizador: gere a sala, monte perguntas e controle o jogo.";
    el.joinHint.textContent = "Entre primeiro para assumir host no MVP atual.";
    show(el.createRoomWrap);
    el.roomId.value = randomRoomId();
    el.generatedRoomId.value = el.roomId.value;
  }

  if (nextMode === "participant") {
    el.modeParticipantBtn.classList.add("active-mode");
    el.modeHint.textContent = "Modo participante: entre na sala e responda.";
    el.joinHint.textContent = "Use o Room ID do organizador.";
    hide(el.createRoomWrap);
  }

  if (nextMode === "debug") {
    el.modeDebugBtn.classList.add("active-mode");
    el.modeHint.textContent = "Modo debug: mostra logs e edição completa de perguntas.";
    el.joinHint.textContent = "Use para validar fluxo e origem das perguntas.";
    show(el.createRoomWrap);
    if (!el.roomId.value.trim()) {
      el.roomId.value = randomRoomId();
    }
    el.generatedRoomId.value = el.roomId.value;
    show(el.logsCard);
  }
}

function renderDraftQuestions(): void {
  el.draftQuestions.innerHTML = "";
  for (const [idx, q] of draftQuestions.entries()) {
    const li = document.createElement("li");
    li.textContent = `${idx + 1}) ${q.title} [correta: ${q.correctOptionIndex + 1}]`;
    el.draftQuestions.appendChild(li);
  }
  if (draftQuestions.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nenhuma pergunta no rascunho.";
    el.draftQuestions.appendChild(li);
  }
}

function pushManualDraft(): void {
  const title = el.qTitle.value.trim();
  const options = [el.qA.value.trim(), el.qB.value.trim(), el.qC.value.trim(), el.qD.value.trim()] as [string, string, string, string];
  const correctOptionHuman = Number(el.qCorrectIndex.value);

  if (!title || options.some((x) => !x) || correctOptionHuman < 1 || correctOptionHuman > 4) {
    alert("Preencha título, 4 alternativas e resposta correta (1-4).");
    return;
  }

  draftQuestions.push({
    title,
    options,
    correctOptionIndex: (correctOptionHuman - 1) as 0 | 1 | 2 | 3
  });

  el.qTitle.value = "";
  el.qA.value = "";
  el.qB.value = "";
  el.qC.value = "";
  el.qD.value = "";
  el.qCorrectIndex.value = "1";
  renderDraftQuestions();
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cols.push(current.trim());
  return cols;
}

function parseCsvTextToDraft(csvText: string): void {
  const lines = csvText
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  if (lines.length === 0) {
    alert("CSV vazio.");
    return;
  }

  const parsed: HostQuestionInput[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const cols = parseCsvLine(line);
    if (cols.length !== 6) {
      throw new Error(`Linha ${lineIndex + 1}: esperado 6 colunas`);
    }

    const [title, a, b, c, d, correctIndexRaw] = cols;
    const correctIndexHuman = Number(correctIndexRaw);
    if (!title || !a || !b || !c || !d || correctIndexHuman < 1 || correctIndexHuman > 4) {
      throw new Error(`Linha ${lineIndex + 1}: dados inválidos`);
    }

    parsed.push({
      title,
      options: [a, b, c, d],
      correctOptionIndex: (correctIndexHuman - 1) as 0 | 1 | 2 | 3
    });
  }

  draftQuestions = parsed;
  renderDraftQuestions();
}

function sendQuestionBank(source: "manual" | "csv"): void {
  if (!socket || !currentRoomId) return;
  if (!isHost) {
    alert("Apenas o host pode publicar perguntas.");
    return;
  }
  if (draftQuestions.length === 0) {
    alert("Rascunho vazio. Adicione perguntas primeiro.");
    return;
  }

  const payload: HostSetQuestionBankPayload = {
    roomId: currentRoomId,
    source,
    questions: draftQuestions
  };

  socket.emit(
    ClientToServerEvent.HOST_SET_QUESTION_BANK,
    env(ClientToServerEvent.HOST_SET_QUESTION_BANK, payload)
  );

  log("emit host.set_question_bank", { source, questionCount: draftQuestions.length });
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
      if (mode === "organizer" || mode === "debug") {
        show(el.questionBankCard);
      }
    }

    if (mode === "organizer" && !isHost) {
      el.joinHint.textContent = "Você entrou como organizador, mas esta sala já tinha host.";
      el.joinHint.classList.add("warn");
    }
  });

  socket.on("debug.question_bank_ack", (msg) => {
    el.questionBankAck.textContent = `Banco publicado com sucesso: ${msg.questionCount} perguntas (${msg.source}).`;
    log("debug.question_bank_ack", msg);
  });

  socket.on("debug.answer_ack", (msg) => {
    el.answerAck.textContent = `Resposta enviada • correta=${String(msg.isCorrect)} • pontos=${msg.awardedScore} • tempo=${msg.responseMs}ms`;
    log("debug.answer_ack", msg);
  });

  socket.on(ServerToClientEvent.ROOM_STATE_UPDATED, (msg: WsEnvelope<typeof ServerToClientEvent.ROOM_STATE_UPDATED, RoomStateUpdatedPayload>) => {
    el.roomStatus.textContent = `room status: ${msg.payload.status}`;
    el.questionSourceTag.textContent = `questions: ${msg.payload.questionSource} (${msg.payload.questionCount})`;
    show(el.sessionCard);
    log("room.state_updated", msg.payload);
  });

  socket.on(ServerToClientEvent.QUESTION_STARTED, (msg: WsEnvelope<typeof ServerToClientEvent.QUESTION_STARTED, QuestionStartedPayload>) => {
    currentRoundId = msg.payload.roundId;
    show(el.questionCard);
    show(el.roundCard);
    show(el.rankCard);
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

el.addManualQuestionBtn.addEventListener("click", pushManualDraft);
el.clearDraftBtn.addEventListener("click", () => {
  draftQuestions = [];
  renderDraftQuestions();
  el.questionBankAck.textContent = "";
});

el.parseCsvBtn.addEventListener("click", () => {
  try {
    parseCsvTextToDraft(el.csvInput.value);
    el.questionBankAck.textContent = `CSV carregado no rascunho: ${draftQuestions.length} perguntas.`;
  } catch (error) {
    alert((error as Error).message);
  }
});

el.csvFileInput.addEventListener("change", async () => {
  const file = el.csvFileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  el.csvInput.value = text;
});

el.publishManualBtn.addEventListener("click", () => sendQuestionBank("manual"));
el.publishCsvBtn.addEventListener("click", () => sendQuestionBank("csv"));

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

renderDraftQuestions();
