/**
 * useIAP — CdvPurchase (Cordova In-App Purchases v13+) integration.
 *
 * Responsibilities:
 *  - Register the 4 Dora Dungeons products with the Apple App Store on mount.
 *  - Listen for `approved` events → unlock premium, speak TTS confirmation,
 *    finish the transaction.
 *  - Listen for `finished` events → log only.
 *  - Expose `restorePurchases()` so the paywall footer can trigger a restore
 *    with TTS/visual feedback.
 *
 * On web / dev builds, CdvPurchase is not defined — every guard below is a
 * no-op, which keeps the mock purchase flow working without changes.
 */

import { useEffect, useCallback } from "react";
import { AudioManager } from "@/audio/AudioManager";
import { IAP_IDS, type IapTierId } from "@/config/iap";

// ---------------------------------------------------------------------------
// Minimal CdvPurchase type declarations (runtime-injected by Capacitor plugin)
// ---------------------------------------------------------------------------
declare const CdvPurchase: {
  store: {
    register: (products: CdvProduct[]) => void;
    when: () => CdvWhen;
    update: () => void;
    order: (productId: string) => void;
    restorePurchases: () => void;
  };
  ProductType: {
    PAID_SUBSCRIPTION: string;
    NON_CONSUMABLE: string;
  };
  Platform: {
    APPLE_APPSTORE: string;
  };
};

interface CdvProduct {
  id: string;
  type: string;
  platform: string;
}

interface CdvTransaction {
  products: Array<{ id: string }>;
  finish: () => void;
}

interface CdvWhen {
  approved:  (cb: (t: CdvTransaction) => void) => CdvWhen;
  finished:  (cb: (t: CdvTransaction) => void) => CdvWhen;
}

// ---------------------------------------------------------------------------

/** Reverse-lookup: Apple product ID → tier key */
function tierFromProductId(productId: string): IapTierId | null {
  for (const [tier, id] of Object.entries(IAP_IDS)) {
    if (id === productId) return tier as IapTierId;
  }
  return null;
}

/**
 * @param onPurchase  Callback fired when a purchase is approved.
 *                    Receives the tier key (e.g. "lifetime") or the raw
 *                    product ID if the reverse-lookup fails.
 */
export function useIAP(onPurchase: (tier: string) => void) {
  // ── Store initialisation ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof CdvPurchase === "undefined") return; // web/dev — skip

    // Register all 4 products.
    CdvPurchase.store.register([
      {
        id:       IAP_IDS.weekly,
        type:     CdvPurchase.ProductType.PAID_SUBSCRIPTION,
        platform: CdvPurchase.Platform.APPLE_APPSTORE,
      },
      {
        id:       IAP_IDS.monthly,
        type:     CdvPurchase.ProductType.PAID_SUBSCRIPTION,
        platform: CdvPurchase.Platform.APPLE_APPSTORE,
      },
      {
        id:       IAP_IDS.yearly,
        type:     CdvPurchase.ProductType.PAID_SUBSCRIPTION,
        platform: CdvPurchase.Platform.APPLE_APPSTORE,
      },
      {
        id:       IAP_IDS.lifetime,
        type:     CdvPurchase.ProductType.NON_CONSUMABLE,
        platform: CdvPurchase.Platform.APPLE_APPSTORE,
      },
    ]);

    // Set up event listeners.
    CdvPurchase.store.when()
      .approved((transaction) => {
        // Identify the tier that was purchased.
        const productId = transaction.products[0]?.id ?? "";
        const tier = tierFromProductId(productId) ?? productId;

        // Unlock premium, persist state, close paywall.
        onPurchase(tier);

        // Speak TTS confirmation.
        AudioManager.speak(
          "Payment successful. Your legendary journey is now unlimited.",
          { interrupt: true }
        );

        // Acknowledge the transaction with Apple so it isn't re-delivered.
        transaction.finish();
      })
      .finished((transaction) => {
        console.log("[IAP] Transaction finished:", transaction.products);
      });

    // Fetch latest prices and subscription status from Apple.
    CdvPurchase.store.update();
  // onPurchase identity is stable (useCallback in App), but listing it would
  // cause re-registration on every render — deliberately omitted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore purchases ─────────────────────────────────────────────────────
  const restorePurchases = useCallback(() => {
    // Speak feedback immediately so the user knows something is happening.
    AudioManager.speak("Checking for previous purchases.", { interrupt: true });

    if (typeof CdvPurchase !== "undefined") {
      // If a previous purchase exists, the approved event fires again and
      // onPurchase() handles the unlock — no extra code needed here.
      CdvPurchase.store.restorePurchases();
    }
    // On web, the TTS message above is sufficient feedback for the mock path.
  }, []);

  return { restorePurchases };
}
