/**
 * Central Apple App Store product ID configuration.
 * Update these placeholders with your real App Store Connect product IDs
 * before submitting to the App Store.
 */
export const IAP_IDS = {
  weekly:   "com.doradungeons.weekly.placeholder",
  monthly:  "com.doradungeons.monthly.placeholder",
  yearly:   "com.doradungeons.yearly.placeholder",
  lifetime: "com.doradungeons.lifetime.placeholder",
} as const;

export type IapTierId = keyof typeof IAP_IDS;
