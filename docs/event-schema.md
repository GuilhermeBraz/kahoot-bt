# Event Schema (WebSocket)

Contrato de eventos realtime do Kahoot-BT para MVP.

Objetivo: manter backend e frontends (host/player) com payloads consistentes, tipados e versionáveis.

## 1) Envelope Padrão

Todos os eventos usam o envelope abaixo:

```ts
export type WsEnvelope<TType extends string, TPayload> = {
  v: 1;
  type: TType;
  emittedAt: string; // ISO-8601
  requestId?: string; // correlação opcional
  payload: TPayload;
};
```

## 2) Tipos Compartilhados

```ts
export type RoomStatus = "waiting" | "in_progress" | "finished";
export type RoundStatus = "pending" | "active" | "scored" | "closed";

export type Option = {
  optionId: string;
  text: string;
  index: 0 | 1 | 2 | 3;
};

export type Question = {
  questionId: string;
  title: string;
  options: [Option, Option, Option, Option];
  durationMs: 120000;
};

export type PlayerRankingItem = {
  playerId: string;
  username: string;
  totalScore: number;
  totalResponseMs: number;
  position: number;
};
```

## 3) Client -> Server

### `room.join`

```ts
export type RoomJoinPayload = {
  roomId: string;
  username: string;
};
```

Validações:

- `roomId` obrigatório e existente.
- `username` obrigatório, não vazio, único na sala (case-insensitive).

### `host.start_game`

```ts
export type HostStartGamePayload = {
  roomId: string;
};
```

Validações:

- socket deve estar autenticado como host da sala.
- sala deve estar em `waiting`.

### `host.next_question`

```ts
export type HostNextQuestionPayload = {
  roomId: string;
};
```

Validações:

- host da sala.
- sala em `in_progress`.
- não pode existir round `active`.

### `host.set_question_bank`

```ts
export type HostSetQuestionBankPayload = {
  roomId: string;
  source: "manual" | "csv";
  questions: Array<{
    title: string;
    options: [string, string, string, string];
    correctOptionIndex: 0 | 1 | 2 | 3;
  }>;
};
```

Validações:

- socket deve ser host da sala.
- sala deve estar em `waiting` (antes de iniciar o jogo).
- lista deve conter ao menos 1 pergunta.
- cada pergunta deve ter 4 alternativas preenchidas.

### `player.submit_answer`

```ts
export type PlayerSubmitAnswerPayload = {
  roomId: string;
  roundId: string;
  optionId: string;
};
```

Validações:

- sala em `in_progress`.
- round em `active`.
- jogador responde no máximo 1 vez por round.
- respostas após `endsAt` são ignoradas.

## 4) Server -> Client

### `room.state_updated`

```ts
export type RoomStateUpdatedPayload = {
  roomId: string;
  status: RoomStatus;
  players: Array<{ playerId: string; username: string }>;
  currentRoundId?: string;
  questionCount: number;
  questionSource: "default" | "manual" | "csv";
};
```

### `question.started`

```ts
export type QuestionStartedPayload = {
  roomId: string;
  roundId: string;
  question: Question;
  startedAt: string; // ISO-8601
  endsAt: string; // ISO-8601
};
```

### `question.timer_tick`

```ts
export type QuestionTimerTickPayload = {
  roomId: string;
  roundId: string;
  remainingMs: number;
};
```

Notas:

- Evento opcional de UX (ex.: 1Hz).
- Fonte de verdade continua sendo `startedAt` + `endsAt` no servidor.

### `question.ended`

```ts
export type QuestionEndedPayload = {
  roomId: string;
  roundId: string;
  endedAt: string; // ISO-8601
  correctOptionId: string;
};
```

### `answer.reveal`

```ts
export type AnswerRevealPayload = {
  roomId: string;
  roundId: string;
  correctOptionId: string;
};
```

Nota de coesão:

- `question.ended` encerra a rodada.
- `answer.reveal` explicita visualmente a alternativa correta.
- No MVP, ambos podem ser emitidos na sequência para manter compatibilidade com README e arquitetura.

### `leaderboard.updated`

```ts
export type LeaderboardUpdatedPayload = {
  roomId: string;
  roundId: string;
  ranking: PlayerRankingItem[]; // todos os usuários
};
```

### `game.ended`

```ts
export type GameEndedPayload = {
  roomId: string;
  ranking: PlayerRankingItem[];
};
```

## 5) Regras de Scoring

```ts
const TIME_LIMIT_MS = 120000;
const MAX_POINTS = 120;

export function scoreAnswer(input: {
  isCorrect: boolean;
  answerReceivedAtServerMs: number;
  endsAtServerMs: number;
}): number {
  if (!input.isCorrect) return 0;

  const remainingMs = Math.max(0, input.endsAtServerMs - input.answerReceivedAtServerMs);
  const raw = Math.round(MAX_POINTS * (remainingMs / TIME_LIMIT_MS));
  return Math.max(1, raw);
}
```

Desempate do ranking:

1. Maior `totalScore`
2. Menor `totalResponseMs`
3. Menor `firstCorrectAt`
4. `username` em ordem alfabética

## 6) Invariantes do Servidor

- Máximo de 1 round `active` por sala.
- Pontuação aplicada apenas na transição `active -> scored`.
- `player.submit_answer` é idempotente por `(roomId, roundId, playerId)`.
- Ranking sempre cumulativo e contendo todos os usuários da sala.

## 7) Exemplos JSON

### Exemplo `question.started`

```json
{
  "v": 1,
  "type": "question.started",
  "emittedAt": "2026-02-19T21:00:00.000Z",
  "payload": {
    "roomId": "room_8Y4KQ",
    "roundId": "round_01",
    "question": {
      "questionId": "q_1",
      "title": "Qual alternativa está correta?",
      "options": [
        { "optionId": "a", "text": "A", "index": 0 },
        { "optionId": "b", "text": "B", "index": 1 },
        { "optionId": "c", "text": "C", "index": 2 },
        { "optionId": "d", "text": "D", "index": 3 }
      ],
      "durationMs": 120000
    },
    "startedAt": "2026-02-19T21:00:00.000Z",
    "endsAt": "2026-02-19T21:02:00.000Z"
  }
}
```

### Exemplo `leaderboard.updated`

```json
{
  "v": 1,
  "type": "leaderboard.updated",
  "emittedAt": "2026-02-19T21:02:01.000Z",
  "payload": {
    "roomId": "room_8Y4KQ",
    "roundId": "round_01",
    "ranking": [
      {
        "playerId": "p1",
        "username": "ana",
        "totalScore": 120,
        "totalResponseMs": 1530,
        "position": 1
      },
      {
        "playerId": "p2",
        "username": "joao",
        "totalScore": 116,
        "totalResponseMs": 4120,
        "position": 2
      }
    ]
  }
}
```

## 8) Checklist de Coesão

- Coerente com `README.md`: `room.join`, `host.start_game`, `host.next_question`, `player.submit_answer`, `question.timer_tick`, `answer.reveal`, ranking cumulativo e score por ms.
- Coerente com `docs/architecture.md`: estados `waiting/in_progress/finished`, round `pending/active/scored/closed`, `question.started`, `question.ended`, `leaderboard.updated`, `game.ended`.
- Extensão MVP: `host.set_question_bank` habilita perguntas customizadas (manual/CSV) por sala.
