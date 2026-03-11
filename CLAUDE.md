# CLAUDE.md

## Project Overview

Simple Tabs Card is a custom card for Home Assistant dashboards that organizes cards into a tabbed interface. It is built as a web component using Lit 3 and TypeScript, distributed via HACS (Home Assistant Community Store).

## Build & Development Commands

```bash
npm start        # Start Rollup in watch mode (dev server on port 5000)
npm run build    # Production build (minified output to dist/simple-tabs.js)
npm run lint     # Run ESLint on src/**/*.ts
```

There are no tests configured in this project. Verification is done by building successfully and manual testing in Home Assistant.

## Architecture

The entire source lives in two files:

- `src/simple-tabs.ts` — Main `<simple-tabs>` custom element. Handles rendering tabs, card loading, swipe gestures, animations, template subscriptions, condition evaluation, deep linking, and tab memory.
- `src/simple-tabs-editor.ts` — Visual `<simple-tabs-editor>` for the Home Assistant UI config panel. Provides YAML editing, tab management (add/remove/reorder), per-card editors, and global settings controls.

Build output is a single file: `dist/simple-tabs.js`.

### Key Interfaces (in `simple-tabs.ts`)

- `TabsCardConfig` — Top-level card configuration
- `TabConfig`, `TabConfigSingleCard`, `TabConfigMultiCard` — Per-tab config (supports legacy single-card and multi-card formats)
- `StateCondition`, `TemplateCondition`, `UserCondition` — Condition types for tab visibility
- `DefaultTabRule` — Dynamic default tab selection rules

## Tech Stack

- **Language:** TypeScript 5.2 (strict mode, ES2021 target, decorators enabled)
- **Framework:** Lit 3 (web components with `@customElement`, `@property`, `@state`, `@query`)
- **Bundler:** Rollup 3 with TypeScript, CommonJS, Node resolve, and Terser plugins
- **Linter:** ESLint with `@typescript-eslint`
- **Formatter:** Prettier
- **Runtime deps:** `lit`, `custom-card-helpers`, `home-assistant-js-websocket`, `js-yaml`

## Code Conventions

### Naming

- Private properties/methods: underscore prefix `_camelCase` (e.g., `_selectedTabIndex`, `_handleSwipeStart`)
- Public properties: `camelCase` (e.g., `hass`, `editMode`)
- Event handlers: arrow functions for automatic `this` binding (e.g., `_handleClick = (e: Event) => { }`)
- Custom element names: kebab-case (`simple-tabs`, `simple-tabs-editor`)

### Formatting (Prettier)

- Semicolons: yes
- Quotes: single
- Trailing commas: all
- Print width: 120
- Indent: 2 spaces
- Bracket same line: yes

### Component Patterns

- Use Lit decorators (`@customElement`, `@property`, `@state`, `@query`) — not manual property definitions
- Use `willUpdate()` for pre-render calculations (e.g., computing visible tab indices)
- Use `shouldUpdate()` to skip unnecessary re-renders
- Use `configChanged()` helper to compare configs and avoid redundant work
- Inline styles via Lit's `static styles = css\`...\`` — no external CSS files
- CSS custom properties prefixed with `--simple-tabs-*` for theming

### Performance Patterns

- Lazy card loading: cards are created on first tab visit, with optional background pre-loading via `requestIdleCallback`
- Memoized visibility: `_visibleIndices` array recomputed only when visibility changes
- Template subscriptions: managed via `hass.connection.subscribeMessage()` with cleanup in `disconnectedCallback()`
- Containment CSS (`contain: content`) for layout optimization

### Home Assistant Integration

- Cards are created via `document.createElement()` and configured by setting `.setConfig()` and assigning `.hass`
- The editor fires `config-changed` custom events to propagate config updates to HA
- Template rendering uses the HA WebSocket API (`render_template` subscription)
- Uses `ha-*` components from HA frontend (e.g., `ha-yaml-editor`, `ha-textfield`, `ha-icon-picker`, `ha-switch`)

## CI/CD

- **Build check** (`.github/workflows/build.yml`): Runs on push to `main` and PRs. Node 18, `npm ci && npm run build`.
- **Release** (`.github/workflows/release.yml`): On GitHub release publish, builds and uploads `dist/simple-tabs.js` as a release asset.

## File Structure

```
src/
  simple-tabs.ts          # Main card component (~1150 lines)
  simple-tabs-editor.ts   # Visual config editor (~650 lines)
dist/
  simple-tabs.js          # Built output (do not edit)
rollup.config.js          # Bundler config
tsconfig.json             # TypeScript config
.eslintrc.js              # Linter config
.prettierrc.js            # Formatter config
hacs.json                 # HACS integration metadata
```
