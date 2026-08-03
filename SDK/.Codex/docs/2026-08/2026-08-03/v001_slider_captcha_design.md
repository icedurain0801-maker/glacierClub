# Sliding Image CAPTCHA Demo Design

Date: 2026-08-03

## Scope

Create an English, standalone HTML demo in `SDK/client/slider-captcha.html`. The demo represents the sliding image CAPTCHA behavior specified by the final QA test case. It is a frontend prototype only: no backend authentication, token issuance, persistence, or real CAPTCHA image service is included.

## UI Structure

- Centered CAPTCHA card on a neutral page.
- Card title: `Security verification`.
- Canvas image area: 320 x 180 CSS pixels, with a generated visual scene, randomized gap, and movable puzzle piece.
- Slider track below the image. The handle is draggable by mouse and touch.
- Refresh control regenerates the scene and gap together.
- A compact test-control strip allows the QA reviewer to simulate image-load failure and reopen the verification after closing.
- A fixed bottom-right requirements icon opens a right-side drawer. The drawer includes the final QA requirements in English and can be dismissed by close button, backdrop, or Escape.

## CAPTCHA Behavior

1. A puzzle is generated automatically on load.
2. The gap is 40 x 40 pixels and stays at least 20 pixels from the image's left and right edges.
3. The puzzle piece starts at the slider origin and follows the handle continuously.
4. The handle and piece are clamped to the track. Pointer capture supports both desktop and mobile interaction.
5. Releasing the handle checks alignment with a 20-pixel tolerance. A successful alignment shows `Verification successful`, keeps the solved state visible, then closes the card after one second. An incorrect release shows `Verification failed, please try again` and returns the piece to the origin.
6. Refresh regenerates both image and gap. Simulated image-load failure shows an error state and a refresh action instead of a blank canvas.
7. Closing the card cancels the current verification and returns to the idle state. Reopening starts a fresh puzzle.

## Requirement Drawer Content

The drawer documents:

- Trigger paths for account-password and phone-plus-code login, including account-not-found, wrong-account, wrong-password, and same-device UID failures.
- Three-failure trigger behavior and continuation after successful verification.
- Verification close behavior and the Beijing-time six-hour error window.
- Image, gap, refresh, loading/error, drag-boundary, release, and tolerance rules.
- Success/failure feedback.
- Portrait/landscape, weak-network, Android/iOS, and user-experience test points.
- SDK admin configuration: entry, enabled-by-default behavior, disabling, and re-enabling.

## Error and Accessibility Handling

- Loading and failure states are explicit and never leave an empty verification surface.
- Buttons use native `button` elements with visible labels and focus styles.
- The slider handle has an accessible label and keyboard support: Left/Right move it by 4 pixels; Home/End move to the track bounds; Space releases and checks the current position.
- The drawer uses `aria-hidden` and a labelled dialog region.

## Verification Checklist

- Open the HTML directly or serve `SDK` over a local HTTP server.
- Drag with mouse and touch; verify continuous piece movement and track clamping.
- Release away from the gap to see failure and reset.
- Release within 20 pixels of the gap to see success and delayed close.
- Refresh repeatedly and verify image and gap always change together.
- Use the test control to simulate load failure, then refresh.
- Close and reopen the CAPTCHA; verify a new puzzle is generated.
- Open the requirements drawer from the bottom-right icon and dismiss it through all supported paths.
