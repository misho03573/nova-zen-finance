# NOVA release-readiness quality pass

## Scope
Fix only issues reproduced in the preview or proven directly from current code. Preserve financial calculations, synchronization, security, routes, translations, and visual design.

## Verified fixes

1. **Touch and keyboard usability**
   - Increase shared form controls and key text actions to at least 44px on touch devices.
   - Make Wallet transaction actions visible on touch and when keyboard focus enters a row.
   - Add visible focus styling to custom buttons and ensure selection controls expose their selected state.
   - Prevent translated bottom-navigation labels from wrapping or clipping.

2. **Form validation and feedback**
   - Reject invalid goal targets, saved amounts, monthly amounts, and zero/non-finite contributions before state changes.
   - Show localized validation feedback instead of silently doing nothing.
   - Add proper input constraints and accessible labels to affected goal controls.

3. **Stored-data resilience and privacy**
   - Validate persisted NOVA state before hydration so malformed collection fields cannot crash screens after reload.
   - Fall back safely without changing valid financial data.
   - Include conflict-recovery snapshots in sign-out/reset cleanup so financial data is not left on the device.

4. **Accessibility fixes**
   - Announce lock-screen authentication errors to assistive technology.
   - Add missing dialog descriptions and semantic labels for verified icon-only controls.
   - Keep the selected application language reflected on the document.

## Tests and verification

- Add focused unit tests for persisted-state validation, recovery-key cleanup, and goal amount validation.
- Re-test at 320px mobile and 1280px desktop widths, including keyboard focus and overflow checks.
- Run the full test suite, typecheck, translation checks, production build, and inspect the final build log.

## Remaining-risk reporting

Report only risks that remain observable after verification, especially areas that require a real native device or authenticated multi-device session.
