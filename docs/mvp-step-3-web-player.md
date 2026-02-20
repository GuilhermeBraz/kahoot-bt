# MVP - Etapa 3 (Web Player mínimo)

Objetivo: testar no navegador o fluxo realtime já existente na API, sem React e sem complexidade extra.

## Arquivos desta etapa

- `apps/web-player/index.html`
  - UI simples para entrar na sala, responder e ver ranking.
- `apps/web-player/src/main.ts`
  - conexão Socket.IO + listeners de eventos.

## Dependências (quem depende de quê)

1. `packages/shared-types`
2. `apps/api/src/game.ts`
3. `apps/api/src/server.ts`
4. `apps/web-player/src/main.ts`

Regra importante:

- O frontend não calcula score nem valida regra de rodada.
- O servidor é a fonte de verdade de estado/pontuação.

## Como rodar

1. API:

```bash
npm run dev:api
```

2. Web player (novo terminal):

```bash
npm run dev:player
```

3. Abrir no navegador:

- `http://localhost:5173`

4. Para testar com 2 pessoas/janelas:

- abra duas abas com usernames diferentes
- primeiro usuário conectado vira host no MVP atual
- host clica `host.start_game` e `host.next_question`
- participantes clicam nas alternativas

## Eventos observáveis na UI

- `room.state_updated`
- `question.started`
- `question.timer_tick`
- `question.ended`
- `leaderboard.updated`
- `game.ended`

## Limitações intencionais

- Host e player compartilham a mesma tela (modo debug)
- Apenas banco de perguntas fake no backend
- Sem persistência em banco
