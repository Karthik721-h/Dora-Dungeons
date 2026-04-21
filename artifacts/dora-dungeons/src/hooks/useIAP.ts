/**
 * useIAP — CdvPurchase (Cordova In-App Purchases v13+) integration.
 *
 * Source of truth for premium status is the Apple receipt, validated via
 * the `.owned()` listener that fires on mount (after store.update()) and
 * again after every restore/refresh. localStorage is never used here.
 *
 * On web / dev builds, CdvPurchase is not defined — every guard is a no-op
 * so the mock purchase flow in SubscriptionOverlay continues to work.
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
    when:     () => CdvWhen;
    update:   () => void;
    refresh:  () => void;
    order:    (productId: string) => void;
  };
  ProductType: {
    PAID_SUBSCRIPTION: string;
    NON_CONSUMABLE:    string;
  };
  Platform: {
    APPLE_APPSTORE: string;
  };
};

interface CdvProduct {
  id:       string;
  type:     string;
  platform: string;
}

interface CdvTransaction {
  products: Array<{ id: string }>;
  finish:   () => void;
}

interface CdvOwnedProduct {
  id: string;
}

interface CdvWhen {
  approved: (cb: (t: CdvTransaction)    => void) => CdvWhen;
  finished: (cb: (t: CdvTransaction)    => void) => CdvWhen;
  owned:    (cb: (p: CdvOwnedProduct)   => void) => CdvWhen;
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
 * @param onPurchase  Called whenever a product becomes owned (new purchase or
 *                    restore). Receives the tier key ("lifetime", "yearly", …)
 *                    or the raw product ID if the reverse-lookup fails.
 */
export function useIAP(onPurchase: (tier: string) => void) {
  // ── Store initialisation ──────────────────────────────────────────────────
  useEffect(() => {
    const initIAP = () => {
      if (typeof CdvPurchase === "undefined") return; // web/dev — skip

      // Register all 4 products.
      CdvPurchase.store.register([
        {
          id:       IAP_IDS.WEEKLY,
          type:     CdvPurchase.ProductType.PAID_SUBSCRIPTION,
          platform: CdvPurchase.Platform.APPLE_APPSTORE,
        },
        {
          id:       IAP_IDS.MONTHLY,
          type:     CdvPurchase.ProductType.PAID_SUBSCRIPTION,
          platform: CdvPurchase.Platform.APPLE_APPSTORE,
        },
        {
          id:       IAP_IDS.YEARLY,
          type:     CdvPurchase.ProductType.PAID_SUBSCRIPTION,
          platform: CdvPurchase.Platform.APPLE_APPSTORE,
        },
        {
          id:       IAP_IDS.LIFETIME,
          type:     CdvPurchase.ProductType.NON_CONSUMABLE,
          platform: CdvPurchase.Platform.APPLE_APPSTORE,
        },
      ]);

      CdvPurchase.store.when()
        // ── New purchase approved → unlock + acknowledge ──────────────────────
        .approved((transaction) => {
          const productId = transaction.products[0]?.id ?? "";
          const tier      = tierFromProductId(productId) ?? productId;

          onPurchase(tier);

          AudioManager.speak(
            "Payment successful. Your legendary journey is now unlimited.",
            { interrupt: true }
          );

          // Acknowledge so Apple doesn't re-deliver the transaction.
          transaction.finish();
        })

        // ── Product is owned (fires on mount + after refresh/restore) ─────────
        // This is the authoritative unlock path — receipt validated by Apple.
        .owned((product) => {
          const tier = tierFromProductId(product.id) ?? product.id;
          onPurchase(tier);
        })

        .finished((transaction) => {
          console.log("[IAP] Transaction finished:", transaction.products);
        });

      // Ask Apple for current ownership status. This triggers .owned() for any
      // product the user already owns, without requiring a new purchase.
      CdvPurchase.store.update();
    };

    if (typeof CdvPurchase !== "undefined") {
      // Cordova already ready (e.g. hot reload in dev)
      initIAP();
    } else {
      document.addEventListener("deviceready", initIAP, { once: true });
    }

    return () => {
      document.removeEventListener("deviceready", initIAP);
    };

  // onPurchase identity is stable (useCallback in App). Listing it would cause
  // re-registration on every render, so it is deliberately omitted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore purchases ─────────────────────────────────────────────────────
  // store.refresh() re-validates all receipts with Apple and re-fires .owned()
  // for anything the user legitimately owns. This is the correct API for
  // "Restore Purchases" per Apple guidelines (not store.restorePurchases()).
  const restorePurchases = useCallback(() => {
    AudioManager.speak("Checking for previous purchases.", { interrupt: true });

    if (typeof CdvPurchase !== "undefined") {
      CdvPurchase.store.refresh();
    }
    // On web the TTS feedback above is sufficient for the mock path.
  }, []);

  return { restorePurchases };
}
