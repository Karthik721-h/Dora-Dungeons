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
  unlockedAbilities: [".destroy (1 Charge)"],
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export type RPGAction =
  | { type: "ADD_XP"; payload: number }
  | { type: "SPEND_XP"; payload: number }
  | { type: "EQUIP_ITEM"; payload: { kind: "weapon" | "armor"; id: string } }
  | { type: "REMOVE_ABILITY"; payload: string };

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
    return {
      playerXP: parsed.playerXP ?? DEFAULT_STATE.playerXP,
      unlockedWeapons:
        parsed.unlockedWeapons ?? DEFAULT_STATE.unlockedWeapons,
      equippedWeapon:
        parsed.equippedWeapon ?? DEFAULT_STATE.equippedWeapon,
      unlockedArmor: parsed.unlockedArmor ?? DEFAULT_STATE.unlockedArmor,
      equippedArmor: parsed.equippedArmor ?? DEFAULT_STATE.equippedArmor,
      unlockedAbilities:
        parsed.unlockedAbilities ?? DEFAULT_STATE.unlockedAbilities,
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

  return (
    <RPGProgressionContext.Provider
      value={{ state, addXP, spendXP, equipItem, removeAbility }}
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
