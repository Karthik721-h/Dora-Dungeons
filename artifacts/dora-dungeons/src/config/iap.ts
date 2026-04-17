/**
 * Finalised Apple App Store product IDs.
 * Keys are UPPERCASE to match the App Store Connect convention.
 * Used in useIAP.ts for store registration and in SubscriptionOverlay.tsx
 * for order() calls. The UI tier keys (weekly/monthly/yearly/lifetime) are
 * kept lowercase internally and mapped to these IDs at the call site.
 */
export const IAP_IDS = {
  WEEKLY:   "com.doradungeons.weekly",
  MONTHLY:  "com.doradungeons.monthly",
  YEARLY:   "com.doradungeons.yearly",
  LIFETIME: "com.doradungeons.lifetime",
} as const;

export type IapTierId = keyof typeof IAP_IDS;
