# Simple Tabs Card 1.5.0

## Highlights

- Reworked the tab bar layout so the outer bar acts as a stable shell and only the buttons scroll inside it.
- Replaced the popup card editor flow with inline per-card editing in the visual editor.
- Replaced the noisy preview-based card picker with a simple no-preview picker.
- Reorganized the visual editor into collapsible sections and added style controls for card, bar, and button design options.
- Added a separate `button_hover_border_color` option.

## Breaking Changes

- Public styling option names have been clarified in the docs and visual editor. New configs should use:
  - `tabs_alignment` instead of `alignment`
  - `card_*` instead of `container_*`
  - `bar_*` instead of `tab_buttons_*`
  - `button_*` instead of the older button style names such as `background-color`, `border-color`, and `text-color`
- `show_fade` has been removed from the visual editor and no longer affects rendering.
- The tab bar layout behavior changed: the bar itself no longer scrolls; only the buttons inside it do.

## Notes

Legacy config aliases are still accepted in code for now to ease migration, but they are no longer the preferred documented names.
