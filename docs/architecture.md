# Architecture

Este documento consolida a arquitetura MVP do Kahoot-BT com foco em simplicidade, modularidade e tempo real.

## 1) Arquitetura de Componentes

```mermaid
flowchart LR
  subgraph Clients[Clients]
    H[Host Web App\nReact + TS]
    P[Player Web App\nReact + TS]
  end

  subgraph Backend[API Realtime\nNode + Socket.IO]
    REST[REST API\ncreate room / join / health]
    WS[Realtime Gateway\nrooms por roomId]
    GE[Game Engine]
    RM[Room Manager]
    ROM[Round Manager]
    AM[Answer Manager]
    SM[Scoring Manager]
    LBM[Leaderboard Manager]
  end

  subgraph Data[Data Layer]
    PG[(PostgreSQL)]
    R[(Redis - opcional\nphase 2)]
  end

  H -->|HTTP| REST
  P -->|HTTP| REST

  H <--> |WebSocket| WS
  P <--> |WebSocket| WS

  WS --> GE
  GE --> RM
  GE --> ROM
  GE --> AM
  GE --> SM
  GE --> LBM

  RM --> PG
  ROM --> PG
  AM --> PG
  SM --> PG
  LBM --> PG

  WS -. pub/sub fase 2 .-> R
```

## 2) Room State Machine

```mermaid
stateDiagram-v2
  [*] --> waiting
  waiting --> in_progress: host.start_game
  in_progress --> finished: last_round.closed
  finished --> [*]
```

Regras:

- Apenas salas `in_progress` aceitam eventos de resposta.
- Uma sala tem no máximo 1 rodada `active` por vez.

## 3) Round State Machine

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> active: host.next_question / game.start
  active --> scored: timer_ended OR all_answered
  scored --> closed: answer_reveal + leaderboard_updated
  closed --> [*]
```

Regras:

- Resposta é aceita apenas em `active`.
- Cada jogador responde no máximo 1 vez por rodada.
- Pontuação é aplicada somente na transição `active -> scored`.

## 4) Fluxo Realtime (Pergunta)

```mermaid
sequenceDiagram
  autonumber
  participant Host
  participant PlayerA as Player A
  participant PlayerB as Player B
  participant API as Realtime API

  Host->>API: host.next_question(roomId)
  API-->>Host: question.started(question, startAt, endAt)
  API-->>PlayerA: question.started(question, startAt, endAt)
  API-->>PlayerB: question.started(question, startAt, endAt)

  PlayerA->>API: player.submit_answer(optionId, answeredAt)
  PlayerB->>API: player.submit_answer(optionId, answeredAt)

  Note over API: Server valida janela active\ncalcula responseMs com relógio do servidor

  API-->>Host: question.ended(correctOption)
  API-->>PlayerA: question.ended(correctOption)
  API-->>PlayerB: question.ended(correctOption)

  API-->>Host: leaderboard.updated(fullRanking)
  API-->>PlayerA: leaderboard.updated(fullRanking)
  API-->>PlayerB: leaderboard.updated(fullRanking)
```

## 5) Contrato de Eventos (MVP)

### Client -> Server

- `room.join` `{ roomId, username }`
- `host.start_game` `{ roomId }`
- `host.next_question` `{ roomId }`
- `player.submit_answer` `{ roomId, roundId, optionId }`

### Server -> Client

- `room.state_updated` `{ roomId, status, players }`
- `question.started` `{ roomId, roundId, question, startedAt, endsAt }`
- `question.ended` `{ roomId, roundId, correctOptionId }`
- `leaderboard.updated` `{ roomId, ranking[] }`
- `game.ended` `{ roomId, ranking[] }`

## 6) Regras de Scoring (Determinístico)

```text
timeLimitMs = 120000
maxPoints = 120

if incorrect => 0
if correct:
  remainingMs = max(0, endsAtServer - answerReceivedAtServer)
  score = round(maxPoints * (remainingMs / timeLimitMs))
  score = max(1, score)
```

Desempate do ranking:

1. Maior `totalScore`
2. Menor `totalResponseMs` (somatório das respostas corretas)
3. Menor `firstCorrectAt` (quem acertou antes no tempo global da partida)
4. `username` (ordem alfabética) como desempate final estável

## 7) Escalonamento em Fases

1. Fase 1: 1 instância API + Postgres.
2. Fase 2: adicionar Redis adapter para Socket.IO (N instâncias).
3. Fase 3: métricas por sala (`latency`, `activeSockets`, `answers/sec`) e autoscaling.
