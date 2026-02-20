# MVP - Etapa 5 (Perguntas pelo Host: manual + CSV)

Objetivo: deixar o MVP jogável com perguntas definidas pelo organizador em tempo real.

## O que foi implementado

1. Backend agora mantém banco de perguntas por sala (`questionBank`).
2. Organizador pode publicar perguntas por evento websocket:
   - `host.set_question_bank`
3. Origem das perguntas fica registrada na sala:
   - `default` (fallback)
   - `manual`
   - `csv`
4. UI mostra claramente a origem e quantidade:
   - `questions: <source> (<count>)`

## Fluxo recomendado (Organizador)

1. Selecionar modo `Organizador`.
2. Entrar na sala primeiro (para virar host no MVP atual).
3. Montar rascunho de perguntas:
   - manualmente, ou
   - colando/importando CSV.
4. Publicar rascunho (`Manual` ou `CSV`).
5. Iniciar jogo e avançar perguntas.

## Formato CSV aceito

Cada linha representa 1 pergunta com 6 colunas:

```text
title,optionA,optionB,optionC,optionD,correctIndex
```

- `correctIndex` deve ser `1`, `2`, `3` ou `4`.

Exemplo:

```csv
2 + 2 = ?,1,3,4,5,3
Capital do Brasil?,Rio de Janeiro,Sao Paulo,Brasilia,Salvador,3
```

## Como validar a origem das perguntas

No card de sessão, observe:

- `questions: manual (N)` quando publicar via manual
- `questions: csv (N)` quando publicar via CSV
- `questions: default (1)` quando não publicar banco customizado

## Dependências de código

1. `packages/shared-types/src/events.ts`
   - evento `host.set_question_bank`
   - payload de entrada de perguntas
   - `room.state_updated` enriquecido com `questionCount` e `questionSource`
2. `apps/api/src/game.ts`
   - armazenamento e validação do banco por sala
   - seleção da resposta correta real por pergunta
3. `apps/api/src/server.ts`
   - handler websocket do novo evento
4. `apps/web-player/src/main.ts`
   - editor manual
   - parser CSV
   - publicação do banco e feedback visual

## Limitações atuais

- Ainda não há persistência em banco (somente memória).
- Edição do banco permitida apenas antes de iniciar a partida.
- Um host por sala (quem entra primeiro).
