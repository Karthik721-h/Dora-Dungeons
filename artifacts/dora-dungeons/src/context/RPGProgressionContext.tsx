import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Weapon {
  id: string;
  name: string;
  damage: number;
  specialAbility: string;
}

export interface Armor {
  id: string;
  name: string;
  defense: number;
}

export interface RPGState {
  playerXP: number;
  unlockedWeapons: Weapon[];
  equippedWeapon: Weapon;
  unlockedArmor: Armor[];
  equippedArmor: Armor;
  unlockedAbilities: string[];
  /**
   * True when ALL charges of .destroy have been consumed this level.
   * Reset to false on RESTORE_DESTROY (level-up).
   */
  destroyConsumed: boolean;
}

// ─── Starter defaults ─────────────────────────────────────────────────────────

export const STARTER_WEAPON: Weapon = {
  id: "wooden-sword",
  name: "Wooden Sword",
  damage: 2,
  specialAbility: "None",
};

export const STARTER_ARMOR: Armor = {
  id: "peasant-tunic",
  name: "Peasant Tunic",
  defense: 1,
};

const DEFAULT_STATE: RPGState = {
  playerXP: 0,
  unlockedWeapons: [STARTER_WEAPON],
  equippedWeapon: STARTER_WEAPON,
  unlockedArmor: [STARTER_ARMOR],
  equippedArmor: STARTER_ARMOR,
  // 2 charges per level — decrements to 1 on first use, removed on second use.
  unlockedAbilities: [".destroy (2 Charges)"],
  destroyConsumed: false,
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export type RPGAction =
  | { type: "ADD_XP"; payload: number }
  | { type: "SPEND_XP"; payload: number }
  | { type: "EQUIP_ITEM"; payload: { kind: "weapon" | "armor"; id: string } }
  | { type: "REMOVE_ABILITY"; payload: string }
  /**
   * Consume one .destroy charge:
   *   .destroy (2 Charges) → .destroy (1 Charge)  (decrement)
   *   .destroy (1 Charge)  → removed               (all charges spent)
   */
  | { type: "USE_DESTROY" }
  /** Unlock a new weapon from the shop and auto-equip it (best weapon wins). */
  | { type: "ADD_WEAPON"; payload: Weapon }
  /** Add or update an armor in the roster and auto-equip it. */
  | { type: "SYNC_ARMOR"; payload: Armor }
  /** Recharge .destroy to 2 Charges — awarded once per dungeon level cleared. */
  | { type: "RESTORE_DESTROY" };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function rpgReducer(state: RPGState, action: RPGAction): RPGState {
  switch (action.type) {
    case "ADD_XP": {
      const next = state.playerXP + action.payload;
      console.log(
        `[RPG] ADD_XP +${action.payload} → playerXP: ${state.playerXP} → ${next}`,
      );
      return { ...state, playerXP: next };
    }

    case "SPEND_XP": {
      if (action.payload > state.playerXP) {
        console.warn(
          `[RPG] SPEND_XP failed — requested ${action.payload} XP but only ${state.playerXP} available`,
        );
        return state;
      }
      const next = state.playerXP - action.payload;
      console.log(
        `[RPG] SPEND_XP -${action.payload} → playerXP: ${state.playerXP} → ${next}`,
      );
      return { ...state, playerXP: next };
    }

    case "EQUIP_ITEM": {
      if (action.payload.kind === "weapon") {
        const weapon = state.unlockedWeapons.find(
          (w) => w.id === action.payload.id,
        );
        if (!weapon) {
          console.warn(
            `[RPG] EQUIP_ITEM failed — weapon "${action.payload.id}" not in unlockedWeapons`,
          );
          return state;
        }
        console.log(
          `[RPG] EQUIP_ITEM weapon → "${weapon.name}" (damage: ${weapon.damage}, ability: ${weapon.specialAbility})`,
        );
        return { ...state, equippedWeapon: weapon };
      } else {
        const armor = state.unlockedArmor.find(
          (a) => a.id === action.payload.id,
        );
        if (!armor) {
          console.warn(
            `[RPG] EQUIP_ITEM failed — armor "${action.payload.id}" not in unlockedArmor`,
          );
          return state;
        }
        console.log(
          `[RPG] EQUIP_ITEM armor → "${armor.name}" (defense: ${armor.defense})`,
        );
        return { ...state, equippedArmor: armor };
      }
    }

    case "REMOVE_ABILITY": {
      console.log(`[RPG] REMOVE_ABILITY "${action.payload}" — consumed`);
      return {
        ...state,
        unlockedAbilities: state.unlockedAbilities.filter(
          (a) => a !== action.payload,
        ),
      };
    }

    case "USE_DESTROY": {
      const has2 = state.unlockedAbilities.includes(".destroy (2 Charges)");
      const has1 = state.unlockedAbilities.includes(".destroy (1 Charge)");
      if (!has2 && !has1) {
        console.warn("[RPG] USE_DESTROY — no charges remaining, ignoring");
        return state;
      }
      if (has2) {
        // Decrement: 2 → 1 charge
        console.log("[RPG] USE_DESTROY — charge spent: 2 → 1 remaining");
        return {
          ...state,
          unlockedAbilities: state.unlockedAbilities.map((a) =>
            a === ".destroy (2 Charges)" ? ".destroy (1 Charge)" : a,
          ),
        };
      }
      // has1: last charge — remove entirely, mark fully consumed
      console.log("[RPG] USE_DESTROY — last charge consumed, ability exhausted");
      return {
        ...state,
        destroyConsumed: true,
        unlockedAbilities: state.unlockedAbilities.filter(
          (a) => a !== ".destroy (1 Charge)",
        ),
      };
    }

    case "RESTORE_DESTROY": {
      // Already at full charges → no-op
      if (state.unlockedAbilities.includes(".destroy (2 Charges)")) return state;
      // Lingering 1-charge from previous level → upgrade to 2
      if (state.unlockedAbilities.includes(".destroy (1 Charge)")) {
        console.log("[RPG] RESTORE_DESTROY — upgraded 1 → 2 Charges");
        return {
          ...state,
          destroyConsumed: false,
          unlockedAbilities: state.unlockedAbilities.map((a) =>
            a === ".destroy (1 Charge)" ? ".destroy (2 Charges)" : a,
          ),
        };
      }
      // Normal recharge after both charges spent
      console.log("[RPG] RESTORE_DESTROY — .destroy (2 Charges) recharged");
      return {
        ...state,
        destroyConsumed: false,
        unlockedAbilities: [".destroy (2 Charges)", ...state.unlockedAbilities],
      };
    }

    case "ADD_WEAPON": {
      const incoming = action.payload;
      const alreadyOwned = state.unlockedWeapons.some(
        (w) => w.id === incoming.id,
      );
      // Update the stored copy in case stats changed (e.g. hotfix to damage table)
      const newWeapons = alreadyOwned
        ? state.unlockedWeapons.map((w) => (w.id === incoming.id ? incoming : w))
        : [...state.unlockedWeapons, incoming];
      // Auto-equip only if the incoming weapon is strictly stronger than what's equipped
      const shouldEquip = incoming.damage > state.equippedWeapon.damage;
      console.log(
        `[RPG] ADD_WEAPON "${incoming.name}" (damage: ${incoming.damage})${alreadyOwned ? " — already owned" : " — unlocked"}${shouldEquip ? ", equipped" : ""}`,
      );
      return {
        ...state,
        unlockedWeapons: newWeapons,
        equippedWeapon: shouldEquip ? incoming : state.equippedWeapon,
      };
    }

    case "SYNC_ARMOR": {
      const incoming = action.payload;
      const exists = state.unlockedArmor.some((a) => a.id === incoming.id);
      const newArmors = exists
        ? state.unlockedArmor.map((a) =>
            a.id === incoming.id ? incoming : a,
          )
        : [...state.unlockedArmor, incoming];
      console.log(
        `[RPG] SYNC_ARMOR "${incoming.name}" (defense: ${incoming.defense})`,
      );
      return {
        ...state,
        unlockedArmor: newArmors,
        equippedArmor: incoming,
      };
    }

    default:
      return state;
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "dora_rpg_progression";

function loadState(): RPGState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<RPGState>;

    const destroyConsumed = parsed.destroyConsumed === true;

    // ── Migration ──────────────────────────────────────────────────────────
    // v1 saves used ".destroy (1 Charge)" as the per-level ability.
    // v2 changes the system to 2 charges per level.
    // Rules:
    //   • Old ".destroy (1 Charge)" + destroyConsumed=false  → upgrade to 2 Charges
    //     (player hadn't fired it yet this level; give them the full 2-charge grant)
    //   • Old ".destroy (1 Charge)" + destroyConsumed=true   → inconsistent state,
    //     treat as fully spent (remove it; RESTORE_DESTROY will recharge on level-up)
    //   • No destroy variant + destroyConsumed=false          → add 2 Charges
    //     (pre-flag saves that never stored the ability explicitly)
    //   • ".destroy (2 Charges)" already present             → no-op
    let abilities = (parsed.unlockedAbilities ?? []).filter(
      (a) => a !== ".destroy (1 Charge)", // strip v1 entries unconditionally
    );
    const hasV2 = abilities.includes(".destroy (2 Charges)");
    if (!hasV2 && !destroyConsumed) {
      abilities = [".destroy (2 Charges)", ...abilities];
    }

    return {
      playerXP:        parsed.playerXP        ?? DEFAULT_STATE.playerXP,
      unlockedWeapons: parsed.unlockedWeapons  ?? DEFAULT_STATE.unlockedWeapons,
      equippedWeapon:  parsed.equippedWeapon   ?? DEFAULT_STATE.equippedWeapon,
      unlockedArmor:   parsed.unlockedArmor    ?? DEFAULT_STATE.unlockedArmor,
      equippedArmor:   parsed.equippedArmor    ?? DEFAULT_STATE.equippedArmor,
      unlockedAbilities: abilities,
      destroyConsumed,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: RPGState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — continue silently */
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface RPGContextValue {
  state: RPGState;
  addXP: (amount: number) => void;
  spendXP: (amount: number) => void;
  equipItem: (kind: "weapon" | "armor", id: string) => void;
  removeAbility: (name: string) => void;
  /**
   * Consume one .destroy charge.
   * 2 Charges → 1 Charge (first use) → removed entirely (second use).
   */
  useDestroy: () => void;
  /** Unlock a weapon purchased in the shop and auto-equip it. */
  addWeapon: (weapon: Weapon) => void;
  /** Add or update an armor (e.g. after shop upgrade) and auto-equip it. */
  syncArmor: (armor: Armor) => void;
  /** Recharge .destroy to 2 Charges — called on level-up. */
  restoreDestroy: () => void;
}

const RPGProgressionContext = createContext<RPGContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RPGProgressionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(rpgReducer, undefined, loadState);

  // Persist every state change to localStorage
  useEffect(() => {
    saveState(state);
  }, [state]);

  const addXP = useCallback(
    (amount: number) => dispatch({ type: "ADD_XP", payload: amount }),
    [],
  );

  const spendXP = useCallback(
    (amount: number) => dispatch({ type: "SPEND_XP", payload: amount }),
    [],
  );

  const equipItem = useCallback(
    (kind: "weapon" | "armor", id: string) =>
      dispatch({ type: "EQUIP_ITEM", payload: { kind, id } }),
    [],
  );

  const removeAbility = useCallback(
    (name: string) => dispatch({ type: "REMOVE_ABILITY", payload: name }),
    [],
  );

  const useDestroy = useCallback(
    () => dispatch({ type: "USE_DESTROY" }),
    [],
  );

  const addWeapon = useCallback(
    (weapon: Weapon) => dispatch({ type: "ADD_WEAPON", payload: weapon }),
    [],
  );

  const syncArmor = useCallback(
    (armor: Armor) => dispatch({ type: "SYNC_ARMOR", payload: armor }),
    [],
  );

  const restoreDestroy = useCallback(
    () => dispatch({ type: "RESTORE_DESTROY" }),
    [],
  );

  return (
    <RPGProgressionContext.Provider
      value={{ state, addXP, spendXP, equipItem, removeAbility, useDestroy, addWeapon, syncArmor, restoreDestroy }}
    >
      {children}
    </RPGProgressionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRPGProgression(): RPGContextValue {
  const ctx = useContext(RPGProgressionContext);
  if (!ctx) {
    throw new Error(
      "useRPGProgression must be used inside <RPGProgressionProvider>",
    );
  }
  return ctx;
}
