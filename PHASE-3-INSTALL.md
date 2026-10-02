# Phase 3 — Customer account orders

Based on Customer_app_latest_2.zip and Supabase_latest.zip (latest migration 57).

## Install

1. Back up your current Customer App.
2. Run supabase/58_customer_account_orders.sql in Supabase SQL Editor.
3. Run supabase/59_verify_customer_account_orders.sql. All five checks should be true.
4. Copy the package files into your Customer App, preserving their folders. Replace index.html, js/auth.js and js/app.js. Add js/account-orders.js and tests/account-orders.test.cjs. Keep SQL files as migration history.
5. In the Customer App terminal run `node --test tests/*.test.cjs`.
6. Restart Live Server and hard-refresh the browser (Ctrl+Shift+R).

## Included

- Signed-in Orders and Order History now load account-owned orders from Supabase.
- Active and past tabs, server statuses including rejected/cancelled, order item snapshots, totals, delivery fee, discount, included VAT and Saudi 12-hour dates.
- Refresh, loading, empty, failure/retry states and Load more (20 orders per page). Tabs filter the loaded pages; use Load more to reach older matching orders.
- Account history is not persisted into guest browser storage. Pending history responses are discarded after sign-out. Sign-out clears this browser's tracked-order/history cache (not database orders).
- Profile text is escaped before display. Demo rewards counters are replaced by dashes; loyalty is not implemented.
- New read-only RPC checks both auth.uid() and restaurant_id, disallows anonymous execution and never returns tracking tokens.
- Existing User ID insert trigger is retained. Profile-save guest linking now requires a confirmed phone and full normalized number, not just a nine-digit suffix. Existing links are not rewritten.

## Live acceptance checks (required)

These were NOT executed against your database here. The 99 local tests use mocks/static checks; SQL checks are not a substitute for live access-control testing.

1. Existing profile: log in, refresh/reopen browser, confirm name and account remain.
2. Place a clearly labelled test order while signed in; confirm Orders shows it.
3. Change its status through your existing POS test workflow. Click Refresh in Customer Orders; confirm the same status. A rejected order must not display Completed.
4. Log into the same account in another browser/device; confirm that order appears.
5. Sign out; log into a DIFFERENT test account. The first account's orders must not appear.
6. Check Arabic, light/dark theme and mobile width.
7. Old guest orders: save your profile again to run the existing phone-link process. Only unowned, matching-number orders in the same restaurant are linked. Guest phone entry itself was not verified at purchase, so this is phone-based recovery, not proof of the original purchaser. No POS-only historical sales import is included.
8. SQL or UI error: share only the error message; never share access/refresh tokens.

## Scope and limitations

Customer App plus Supabase only. No Admin, POS or Super Admin app changes. No deployment performed.
Existing guest tracking stays available. Signed-in order status updates require Refresh; no push notifications or automatic live updates in the new account list.
Reorder is not included in the account list; historical prices must not be reused as current cart prices.
Saved addresses, real rewards and notifications remain separate future phases.
Do not rerun older migrations 54/56 over migration 58 (they replace the tightened profile-save function).
Fixed OTP is for your configured test number only. Remove it before production and revoke temporary management access tokens when finished.

## Rollback

Restore the backed-up index.html, js/auth.js and js/app.js. The additive account-history RPC can remain unused; do not delete orders or profiles. The tightened profile-save function is compatible with confirmed Saudi phone accounts.
