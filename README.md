# Kahoot-BT

Um quiz em tempo real, open source, com pegada de **battle royale**: perguntas rápidas, ranking dinâmico e vitória por precisão + velocidade.

## Visão do Produto

O sistema tem dois ambientes principais:

- **Host**: cria sala, adiciona perguntas e controla o fluxo do jogo.
- **Participantes**: entram por URL da sala, definem username e respondem em tempo real.

Cada pergunta:

- possui **4 alternativas**
- possui **1 alternativa correta**
- vale até **120 pontos**
- tem **120 segundos** de duração

A pontuação considera o tempo de resposta em **milissegundos**. Quem acerta mais rápido ganha mais pontos.

---

## Regras de Jogo

### 1) Entrada em sala

- O participante acessa via URL com ID: `/room/:roomId`
- Informa um `username` único dentro da sala
- Entra no lobby e aguarda início do host

### 2) Rodada de pergunta

- Host dispara a pergunta atual
- Timer global da rodada: **120000 ms**
- Participantes enviam resposta uma única vez
- Respostas recebidas após o tempo são ignoradas

### 3) Pontuação (cumulativa)

A pontuação total do jogador é a soma de todas as perguntas.

Sugestão de fórmula simples por pergunta:

```text
if resposta_errada: 0
if resposta_correta:
  score = round(120 * (tempo_restante_ms / 120000))
  score mínimo para acerto = 1
```

Observações:

- Resolve desempate por velocidade naturalmente
- Usa precisão de milissegundos
- Mantém o teto de 120 pontos por pergunta

### 4) Pós-pergunta

Ao final de cada questão, todos veem:

- alternativa correta
- ranking atualizado da sala (todos os usuários)
- pontuação cumulativa

---

## Arquitetura Proposta (Modular e Simples)

## 1. Frontend Web

### Módulos

- `host-app`
  - criar/editar quiz
  - iniciar sala
  - avançar perguntas
  - painel de status (online, respostas recebidas, ranking)
- `player-app`
  - entrar na sala por ID
  - informar username
  - responder pergunta
  - ver resultado + ranking

### Componentes base

- `RoomGate` (entrada por ID + username)
- `QuestionCard` (enunciado + alternativas + timer)
- `AnswerGrid` (4 opções)
- `RoundResult` (correta + pontos ganhos)
- `Leaderboard` (lista completa ordenada)
- `ConnectionStatus` (estado do realtime)

## 2. Backend Realtime API

### Módulos

- `RoomModule`
  - criar sala
  - lifecycle (lobby, em_jogo, resultado, finalizada)
- `QuizModule`
  - banco de perguntas
  - controle de pergunta atual
- `SessionModule`
  - conexão de jogador/host
  - validação de username por sala
- `AnswerModule`
  - receber resposta
  - registrar timestamp de envio
  - travar reenvio
- `ScoringModule`
  - cálculo por milissegundos
  - soma cumulativa
  - ordenação do ranking
- `RealtimeGateway` (WebSocket)
  - broadcast de eventos para host e participantes

## 3. Banco de dados

Entidades principais:

- `Room`
- `Player`
- `Question`
- `Option`
- `Round` (instância da pergunta dentro da sala)
- `Answer`
- `ScoreEvent` (auditoria de pontuação)

---

## Fluxo em Tempo Real (Eventos)

### Cliente -> Servidor

- `room.join`
- `host.start_game`
- `host.next_question`
- `player.submit_answer`

### Servidor -> Clientes

- `room.state_updated`
- `question.started`
- `question.timer_tick`
- `question.ended`
- `answer.reveal`
- `leaderboard.updated`
- `game.ended`

---

## Estratégia de Escala

- Suporte a **N salas simultâneas** por particionamento lógico por `roomId`
- Broadcast por canal/sala no WebSocket
- Para escalar horizontalmente:
  - adapter pub/sub (ex.: Redis) para sincronizar eventos entre instâncias
- Regras determinísticas de score no backend para evitar inconsistência

---

## Estrutura de Pastas (Sugestão)

```bash
kahoot-bt/
  apps/
    web-host/
    web-player/
    api/
  packages/
    shared-types/
    ui/
    game-engine/
  infra/
    docker/
    nginx/
  docs/
    architecture.md
```

---

## Roadmap (MVP -> Battle Royale)

### MVP

- [ ] Criar sala com ID na URL
- [ ] Entrada de participante com username
- [ ] Rodada com 1 pergunta / 4 alternativas
- [ ] Timer de 120s em tempo real
- [ ] Pontuação por milissegundos
- [ ] Ranking cumulativo atualizado em tempo real
- [ ] Reveal da resposta correta ao fim da rodada

### V2

- [ ] Múltiplas perguntas por quiz
- [ ] Painel completo de host
- [ ] Persistência de partidas
- [ ] Reconexão automática de participantes

### Battle Royale Mode

- [ ] Zona de risco: janela de resposta vai encurtando por rodada
- [ ] Multiplicador de streak (acertos consecutivos)
- [ ] Eliminação progressiva por round (opcional)
- [ ] Power-ups de partida (ex.: escudo de tempo)

---

## Stack Sugerida

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Fastify/NestJS + WebSocket (Socket.IO)
- **DB**: PostgreSQL
- **Cache/Realtime scale**: Redis
- **ORM**: Prisma

---

## Critérios de Pronto

- Toda atualização de jogo refletida em tempo real no host e participantes
- Score com precisão em milissegundos
- Ranking exibindo todos os usuários da sala
- Pontuação cumulativa correta ao longo do quiz
- Suporte a múltiplas salas sem conflito de estado

---

## Próximo Passo

Definir o contrato de eventos (`WebSocket event schema`) e as entidades do banco para iniciar a implementação do backend sem retrabalho.
