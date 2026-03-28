# Dora Dungeons — Audio-First RPG

## Overview

An audio-first dungeon RPG called Dora Dungeons, inspired by Shades of Doom (audio-based gameplay for visually impaired users). The core game loop is: Listen → Decide → Act → Audio Feedback → Reward → Repeat.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (not yet used by game — state is in-memory)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Frontend**: React + Vite (dark terminal RPG UI)

## Structure

```text
/
├── artifacts/
│   ├── api-server/             # Express API (game routes + health)
│   └── dora-dungeons/          # React + Vite frontend (terminal-style RPG UI)
├── lib/
│   ├── game-engine/            # CORE: Framework-independent game logic
│   │   └── src/
│   │       ├── types/          # TypeScript interfaces & enums
│   │       ├── engine/         # GameEngine (startGame, processCommand)
│   │       ├── combat/         # CombatSystem, StatusEffects
│   │       ├── dungeon/        # DungeonManager (read-only query layer)
│   │       ├── generators/     # DungeonGenerator (seeded PRNG), roomTemplates
│   │       ├── narration/      # NarrationEngine, NarrationRegistry (template system)
│   │       ├── registries/     # AbilityEffectRegistry, EventRegistry
│   │       ├── data/           # Pure data: abilities, enemies, items, statusEffects
│   │       └── ai/             # CommandParser
│   ├── api-spec/               # OpenAPI spec + Orval codegen config
│   ├── api-client-react/       # Generated React Query hooks
│   ├── api-zod/                # Generated Zod schemas from OpenAPI
│   └── db/                     # Drizzle ORM schema + DB connection
└── scripts/                    # Utility scripts
```

## Game Engine Architecture

The `@workspace/game-engine` lib is completely framework-independent (no external runtime deps).

### Data Layer (`/data/`)

Pure TypeScript data files — no logic, no engine imports:

- `abilities.ts` — `ABILITY_DEFINITIONS: Record<string, Ability>` — 8 abilities (fireball, lightning, freeze, inferno, heal, shield, poison_dart, meteor_strike)
- `enemies.ts` — `ENEMY_DEFINITIONS: Record<string, EnemyDefinition>` — 8 enemies
- `items.ts` — `ITEM_DEFINITIONS: Record<string, ItemDefinition>`
- `statusEffects.ts` — `STATUS_DEFINITIONS: Record<string, StatusEffectDefinition>`

**Adding a new ability: edit `abilities.ts` only. Zero engine changes.**

### Registry Layer (`/registries/`)

Fully extensible plug-in maps:

#### `AbilityEffectRegistry`
```typescript
AbilityEffectRegistry.register("CUSTOM_TYPE", handler);
AbilityEffectRegistry.process(effect, player, targets, messages);
```
Built-in types: `DAMAGE`, `HEAL`, `APPLY_STATUS`, `MODIFY_STAT`

- `AbilityEffect.type` is a `string` (not an enum) — new types registered without changing existing handlers
- `AbilityEffect.narrationKey` — optional key into NarrationRegistry for the DAMAGE/HEAL handler to emit narration with the real computed value

#### `EventRegistry`
```typescript
EventRegistry.register("SHRINE", handler);
```
Built-in types: `COMBAT`, `TREASURE`, `TRAP`, `STORY`, `SHRINE`, `EMPTY`

### Generator Layer (`/generators/`)

#### `DungeonGenerator`
```typescript
DungeonGenerator.generateDungeon(seed?: string): Dungeon
```
- Seeded PRNG via `Math.imul` hash — same seed → identical dungeon, different seed → different rooms/events/enemies
- Room templates defined in `roomTemplates.ts` (additive — no DungeonGenerator changes needed to add templates)
- `GameEngine.startGame(playerName?, dungeonSeed?)` passes seed through; API route accepts `req.body.dungeonSeed`

### Narration Layer (`/narration/`)

#### `NarrationRegistry`
```typescript
NarrationRegistry.register("ability.fireball", ["{player} hurls a Fireball at {target}! It detonates for {damage} blazing damage!"]);
NarrationRegistry.get("ability.fireball", { player, target, damage });
```
- Template variables use `{variable}` syntax
- `NarrationEngine` wraps registry for semantic method calls (`spellCast`, `enemyDefeated`, etc.)

### Combat Flow

1. `CombatSystem.playerCastSpell(player, abilityName, enemies, messages)` resolves ability from `ABILITY_DEFINITIONS`
2. Loops over `ability.effects[]` and calls `AbilityEffectRegistry.process(effect, player, targets, messages)` for each
3. Each handler produces its own narration lines (DAMAGE handler uses `effect.narrationKey` for spell-specific templates with actual damage value)
4. No hardcoded switch/case — new effect types plug in via `register()`

### Key Invariants

- `DungeonManager` is read-only after generation — no mutation methods
- Game state is in-memory (module-level) — single session per server process
- Room events reference enemies via `room.event.enemies`; DungeonManager looks up live enemy state

## API Routes

- `POST /api/game/start` — `{ playerName?: string, dungeonSeed?: string }`
- `POST /api/game/action` — `{ command: string }`
- `GET /api/game/state` — returns current `GameState`

Routes are thin delegators — all logic lives in `@workspace/game-engine`.

## Frontend

Dark terminal-style RPG debug interface:
- Game log panel (scrollable, auto-scroll to latest)
- Player status panel (HP/MP bars, level, XP)
- Current room panel (exits, active enemies with HP)
- Command input + EXECUTE button
- Quick macro buttons (movement + combat + examine)

## Root Scripts

- `pnpm run build` — typecheck + build all
- `pnpm run typecheck` — full type check
- `pnpm run typecheck:libs` — typecheck lib packages only
- `pnpm --filter @workspace/api-spec run codegen` — regenerate client/zod from OpenAPI
