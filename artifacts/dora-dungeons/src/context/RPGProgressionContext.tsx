import {
  createContext,
  useContext,
  useReducer,
  useEffect,
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
  id: "rusty-sword",
  name: "Rusty Sword",
  damage: 5,
  specialAbility: "None",
};

export const STARTER_ARMOR: Armor = {
  id: "tattered-robe",
  name: "Tattered Robe",
  defense: 2,
};

const DEFAULT_STATE: RPGState = {
  playerXP: 0,
  unlockedWeapons: [STARTER_WEAPON],
  equippedWeapon: STARTER_WEAPON,
  unlockedArmor: [STARTER_ARMOR],
  equippedArmor: STARTER_ARMOR,
  unlockedAbilities: [],
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export type RPGAction =
  | { type: "ADD_XP"; payload: number }
  | { type: "SPEND_XP"; payload: number }
  | { type: "EQUIP_ITEM"; payload: { kind: "weapon" | "armor"; id: string } };

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
}

const RPGProgressionContext = createContext<RPGContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RPGProgressionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(rpgReducer, undefined, loadState);

  // Persist every state change to localStorage
  useEffect(() => {
    saveState(state);
  }, [state]);

  const addXP = (amount: number) =>
    dispatch({ type: "ADD_XP", payload: amount });

  const spendXP = (amount: number) =>
    dispatch({ type: "SPEND_XP", payload: amount });

  const equipItem = (kind: "weapon" | "armor", id: string) =>
    dispatch({ type: "EQUIP_ITEM", payload: { kind, id } });

  return (
    <RPGProgressionContext.Provider value={{ state, addXP, spendXP, equipItem }}>
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
