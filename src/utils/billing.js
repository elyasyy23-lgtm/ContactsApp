// Billing adapter for Iranian stores (Myket / Cafe Bazaar) — PLACEHOLDER.
//
// Why a placeholder: Expo Go cannot load native modules. Both Myket billing
// (myket-billing SDK) and Cafe Bazaar (Poolakey) are native Android libraries,
// so a real purchase needs a development/production build. Keeping the stub in
// a separate module means the whole purchase flow can be written, tested and
// switched on without touching any screen.
//
// ── How to switch it on (Myket) ─────────────────────────────────────────────
// 1. Create the app + a non-consumable product in the Myket developer panel,
//    with the product id `premium_unlimited` (PREMIUM_PRODUCT_ID below).
// 2. Build a dev client: `npx expo run:android` (or `eas build --profile development`).
// 3. Install the SDK: `npx expo install react-native-myket-iap` (or add the
//    Myket billing AAR through a small config plugin).
// 4. Replace the stub bodies of `purchasePremium` / `restorePremium` with SDK
//    calls, keep the same `{ ok, reason }` return shape, and set BILLING_READY.
// 5. Also add the public RSA key from the Myket panel in that SDK's init call.
//
// The app only cares about the return shape, so screens never change.

export const PREMIUM_PRODUCT_ID = 'premium_unlimited';

// Flip to true once the native SDK call is implemented in this file.
export const BILLING_READY = false;

export async function initBilling() {
  if (!BILLING_READY) return { ok: false, reason: 'not-configured' };
  return { ok: true };
}

/**
 * Opens the store purchase sheet.
 * -> { ok: true, token } on success
 * -> { ok: false, reason: 'cancelled' | 'not-configured' | 'error', error? }
 */
export async function purchasePremium() {
  if (!BILLING_READY) return { ok: false, reason: 'not-configured' };
  return { ok: false, reason: 'not-configured' };
}

/**
 * Re-checks past purchases (reinstall / new device).
 * -> { ok: true } when the premium product is already owned.
 */
export async function restorePremium() {
  if (!BILLING_READY) return { ok: false, reason: 'not-configured' };
  return { ok: false, reason: 'not-configured' };
}
