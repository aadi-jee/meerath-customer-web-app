# Customer app update — 13 September 2026

## Included

- Home-only transparent announcement ticker using the new App Announcements API. Multiple messages, scheduling, branch targeting, tap actions and display order are supported. Text uses the app theme; pause and reduced-motion support included.
- Dark teal delivery message in light mode; existing dark-mode colour retained.
- Events & Catering entry on Home and More. Enquiry form calls the existing v2 catering API; requests appear in the existing admin Catering Enquiries screen.
- In-app Cart Back restores the originating screen, category/subcategory, product choices and scroll position.

## Install and try

1. Keep a backup of your current customer project.
2. Follow INSTALL-ANNOUNCEMENTS.md in the bundle: run migration 44, update Admin, then copy the customer folder contents into your customer project.
3. Run `node --test tests/*.test.cjs` (73 tests pass in the supplied environment).
4. Run your local preview. In Admin > App Announcements, create and enable a message. Existing Website Content announcement controls now remain separate for the website.
5. Check Home in both themes and in Arabic. Verify that the announcement is absent from other pages.
6. Open Cart from a scrolled category and use the in-app Back arrow; check the restored category and position.
7. Send one clearly labelled test catering enquiry and verify it in Admin. This end-to-end live submission has not been performed here.

## Remaining work

This is an announcements update, not the complete account/native-app release. Browser/hardware Back still needs a full routing implementation. Customer authentication remains the existing demo implementation; persistent accounts, rewards, biometric confirmation, native push and store builds are not implemented in this update. Do not treat the demo OTP as secure authentication.

Browser visual verification could not run because the installed Playwright package has no Chromium executable. Flutter tests/build were not run; admin changes require local compilation. Automated tests use simulated API responses, not the live database. The new SQL has not been executed live.
