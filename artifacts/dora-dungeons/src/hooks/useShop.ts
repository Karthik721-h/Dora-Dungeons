/**
 * useShop — Blacksmith Shop API hook
 *
 * Manages shop API calls (catalog, buy, sell, upgrade) using JWT auth.
 * All mutations return the updated GameStateResponse so React Query can be updated inline.
 */
import { useState, useCallback } from "react";
import { GameStateResponse } from "@workspace/api-client-react";

const TOKEN_KEY = "dd_jwt";
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

async function shopFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: { ...authHeaders(), ...(options?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.message ?? "Shop request failed"), {
      status: res.status,
      code: data.error,
      data,
    });
  }
  return data as T;
}

// ── Catalog types ─────────────────────────────────────────────────────────────

export interface ShopWeapon {
  id: string;
  name: string;
  description: string;
  price: number;
  attackBonus: number;
  speedBonus?: number;
  mpBonus?: number;
}

export interface ShopArmor {
  id: string;
  name: string;
  description: string;
  buyPrice: number;
  upgradeCosts: [number, number];
}

export interface SellableItem {
  name: string;
  sellPrice: number;
}

export interface OwnedArmor {
  id: string;
  name: string;
  level: number;
}

export interface ShopCatalog {
  weapons: ShopWeapon[];
  armors: ShopArmor[];
  gold: number;
  ownedWeaponIds: string[];
  ownedArmors: OwnedArmor[];
  sellableItems: SellableItem[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseShopReturn {
  catalog: ShopCatalog | null;
  isLoadingCatalog: boolean;
  isMutating: boolean;
  error: string | null;
  fetchCatalog: () => Promise<void>;
  buyWeapon: (itemId: string) => Promise<GameStateResponse>;
  sellItem: (itemName: string) => Promise<GameStateResponse>;
  upgradeArmor: (armorId: string) => Promise<GameStateResponse>;
}

export function useShop(): UseShopReturn {
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);
    setError(null);
    try {
      const data = await shopFetch<ShopCatalog>("/api/shop/catalog");
      setCatalog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shop.");
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  const buyWeapon = useCallback(async (itemId: string): Promise<GameStateResponse> => {
    setIsMutating(true);
    setError(null);
    try {
      const result = await shopFetch<GameStateResponse>("/api/shop/buy", {
        method: "POST",
        body: JSON.stringify({ itemId }),
      });
      // Refresh catalog to reflect new ownership
      const updatedCatalog = await shopFetch<ShopCatalog>("/api/shop/catalog");
      setCatalog(updatedCatalog);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Purchase failed.";
      setError(msg);
      throw err;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const sellItem = useCallback(async (itemName: string): Promise<GameStateResponse> => {
    setIsMutating(true);
    setError(null);
    try {
      const result = await shopFetch<GameStateResponse>("/api/shop/sell", {
        method: "POST",
        body: JSON.stringify({ itemName }),
      });
      const updatedCatalog = await shopFetch<ShopCatalog>("/api/shop/catalog");
      setCatalog(updatedCatalog);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sale failed.";
      setError(msg);
      throw err;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const upgradeArmor = useCallback(async (armorId: string): Promise<GameStateResponse> => {
    setIsMutating(true);
    setError(null);
    try {
      const result = await shopFetch<GameStateResponse>("/api/shop/upgrade", {
        method: "POST",
        body: JSON.stringify({ armorId }),
      });
      const updatedCatalog = await shopFetch<ShopCatalog>("/api/shop/catalog");
      setCatalog(updatedCatalog);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upgrade failed.";
      setError(msg);
      throw err;
    } finally {
      setIsMutating(false);
    }
  }, []);

  return {
    catalog,
    isLoadingCatalog,
    isMutating,
    error,
    fetchCatalog,
    buyWeapon,
    sellItem,
    upgradeArmor,
  };
}
