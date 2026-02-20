# MVP - Etapa 4 (UI por modo)

Objetivo: reduzir confusão separando fluxo de uso antes da conexão.

## O que mudou

- Tela inicial com seleção de modo:
  - `Organizador (criar sala)`
  - `Participante (join)`
  - `Debug (ver tudo)`
- Formulário adaptado por modo.
- Logs visíveis somente em `Debug`.
- Controles de host exibidos apenas quando o usuário realmente é host.

## Regras simples de UX

1. Organizador:
   - Gera room ID.
   - Entra primeiro para virar host no MVP atual.
   - Vê botões de iniciar/proxima pergunta quando `becameHost=true`.

2. Participante:
   - Só informa room ID + username.
   - Não vê painel de host.

3. Debug:
   - Mostra logs e painel completo para inspeção técnica.

## Dependências

- `apps/web-player/src/main.ts` depende de `packages/shared-types`.
- A regra de host continua no backend (`apps/api/src/game.ts`).
- A UI apenas reflete `debug.join_ack.becameHost`.
