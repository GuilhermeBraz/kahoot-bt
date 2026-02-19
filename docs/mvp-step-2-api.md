# MVP - Etapa 2 (API Realtime em Memória)

Objetivo desta etapa: ter um backend mínimo para testar e debugar fluxo realtime sem banco e sem frontend.

## O que foi criado

- `packages/shared-types/src/events.ts`
  - contrato único de eventos (depende de ninguém; é base para todos)
- `apps/api/src/game.ts`
  - regras de domínio (sala, rodada, resposta, pontuação)
  - depende de `shared-types`
- `apps/api/src/server.ts`
  - transporte Socket.IO e roteamento de eventos
  - depende de `game.ts` e `shared-types`
- `apps/api/src/debug-sim.ts`
  - simulação de host + 2 jogadores para debug
  - depende de `shared-types` e Socket.IO client

## Dependência entre módulos (importante)

Ordem correta de dependência:

1. `shared-types` (base)
2. `game-engine` (`game.ts`)
3. `server` (I/O)
4. `debug-sim` (teste)

Regra:

- `shared-types` nunca importa `api`.
- `game.ts` não conhece socket diretamente (facilita testes unitários).
- `server.ts` só orquestra rede e chama regras do `game.ts`.

## Como rodar

1. Instalar dependências:

```bash
npm install
```

2. Terminal 1 - subir API:

```bash
npm run dev:api
```

3. Terminal 2 - rodar simulação:

```bash
npm run sim:api
```

## O que esperar no log

- `room.state_updated`
- `question.started`
- `debug.answer_ack` para cada resposta
- `question.ended`
- `answer.reveal`
- `leaderboard.updated`
- `game.ended`

## Limitações intencionais (para manter MVP simples)

- Sem banco de dados (estado em memória)
- Apenas 1 pergunta fake
- Primeiro usuário vira host automaticamente
- Sem autenticação

## Próxima etapa sugerida

Etapa 3: extrair validações para um módulo separado e adicionar testes unitários de scoring/desempate.
