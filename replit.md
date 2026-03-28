# Dora Dungeons — Audio-First RPG Foundation

## Overview

A scalable foundation for an audio-first dungeon RPG called Dora Dungeons, inspired by Shades of Doom (audio-based gameplay for visually impaired users). The core game loop is: Listen → Decide → Act → Audio Feedback → Reward → Repeat.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Frontend**: React + Vite (dark terminal RPG UI)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (game routes + health)
│   └── dora-dungeons/      # React + Vite frontend (terminal-style RPG UI)
├── lib/
│   ├── game-engine/        # CORE: Framework-independent game logic
│   │   ├── src/types/      # TypeScript interfaces & enums
│   │   ├── src/engine/     # GameEngine class (startGame, processCommand)
│   │   ├── src/combat/     # CombatSystem (attack, defend, cast_spell)
│   │   ├── src/dungeon/    # DungeonManager (room navigation, encounters)
│   │   └── src/ai/         # CommandParser (voice → parsed command)
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Game Engine Architecture

The `@workspace/game-engine` lib is completely framework-independent:

### Core Entities (TypeScript interfaces)
- `Player` — HP, MP, level, XP, attack, defense, abilities, inventory
- `Enemy` — HP, attack, defense, XP reward, defeated state
- `Room` — name, description, exits (node-based), enemies, items
- `Dungeon` — Map of rooms with startRoomId and bossRoomId
- `Ability` — name, MP cost, damage/heal, type (offensive/defensive)
- `Item` — name, type, effect

### Enums/Constants
- `GameStatus`: IDLE, IN_COMBAT, EXPLORING, GAME_OVER, VICTORY
- `ActionType`: ATTACK, DEFEND, MOVE, CAST_SPELL, LOOK, STATUS, TAKE, USE
- `Direction`: north, south, east, west, up, down

### GameEngine class
- `startGame(playerName?)` — Initializes session, dungeon, player
- `processCommand(input: string)` — Parses and executes a voice command
- `updateState()` — Recalculates game status
- `getState()` — Returns current GameState

### CombatSystem
- Turn-based player vs enemy
- `attack(player, enemy)` — Player attacks with counterattack
- `defend(player, enemies)` — Defensive stance reduces damage by 50%
- `castSpell(player, spell, enemy, enemies)` — Uses MP for offensive/healing spells

### DungeonManager
- 5 rooms: Entrance → Main Hall → {Armory, Storage Room} → Throne Room
- Node-based graph (no graphics, purely logical)
- Boss room: Throne Room (Orc Warlord)

### CommandParser (Voice AI layer)
- Input: `"attack goblin"` → Output: `{ action: "ATTACK", target: "GOBLIN", raw: "attack goblin" }`
- Supports all action types and directions
- Extensible keyword mapping

## API Routes

- `POST /api/game/start` — Start new session (`{ playerName?: string }`)
- `POST /api/game/action` — Process command (`{ command: string }`)
- `GET /api/game/state` — Get current state

Routes are thin delegators — all logic lives in `@workspace/game-engine`.

## Frontend

Dark terminal-style RPG debug interface:
- Game log panel (scrollable, auto-scroll to latest)
- Player status panel (HP/MP bars, level, XP)
- Current room panel (exits, active enemies with HP)
- Command input + EXECUTE button
- Quick macro buttons (movement + combat + examine)

## TypeScript & Composite Projects

- `lib/*` packages are composite and emit declarations via `tsc --build`
- Root `tsconfig.json` lists all lib packages as project references
- `artifacts/*` are leaf packages checked with `tsc --noEmit`

## Root Scripts

- `pnpm run build` — typecheck + build all
- `pnpm run typecheck` — full type check
- `pnpm --filter @workspace/api-spec run codegen` — regenerate client/zod from OpenAPI

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API. Game routes in `src/routes/game.ts`, delegates to `@workspace/game-engine`.
- `pnpm --filter @workspace/api-server run dev` — dev server
- `pnpm --filter @workspace/api-server run build` — production bundle

### `artifacts/dora-dungeons` (`@workspace/dora-dungeons`)
React + Vite frontend. Dark RPG terminal UI.
- `pnpm --filter @workspace/dora-dungeons run dev` — dev server

### `lib/game-engine` (`@workspace/game-engine`)
Core game logic — fully framework independent. No external runtime dependencies.

### `lib/db` (`@workspace/db`)
Database layer using Drizzle ORM with PostgreSQL. No game schema yet (game state is in-memory).

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI 3.1 spec for all game + health endpoints.

### `lib/api-zod` (`@workspace/api-zod`)
Generated Zod schemas: `StartGameBody`, `StartGameResponse`, `ProcessActionBody`, `ProcessActionResponse`, `GetGameStateResponse`.

### `lib/api-client-react` (`@workspace/api-client-react`)
Generated React Query hooks: `useStartGame`, `useProcessAction`, `useGetGameState`.
