# v001 Changelog

## Changes
- Updated `post-detail-en.html` so the bottom bar like icon matches the main like button in Original mode after liking.
- Added a classic liked state for the stacked mini like control: blue filled thumb, light blue circular background, and no football ball overlay.
- Kept Football mode behavior unchanged.

## Verification
- Playwright verified Original mode from both main-like and bottom-bar-like entry points.
- Playwright verified Football mode still uses the football ball liked state.
