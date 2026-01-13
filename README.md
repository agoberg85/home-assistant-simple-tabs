# Simple Tabs Card

A clean and configurable tabs card for Home Assistant Dashboards.

![Simple Tabs Card Screenshot](https://raw.githubusercontent.com/agoberg85/home-assistant-simple-tabs/main/simple-tabs-gif.gif)

## Support development

Buy me a coffee: https://buymeacoffee.com/mysmarthomeblog

Subscribe to Youtube channel: https://www.youtube.com/@My_Smart_Home

## Features

- **Organize Your Dashboard:** Group any Dashboard cards into a clean, tabbed interface.
- **Tab Icons:** Add icon to your tab titles.
- **Stylable:** Customize colors for the background, border, text, and active tab.
- **Alignment:** Align your tabs to the start, center, or end of the card.
- **Dynamic Defaults:** Change the default tab automatically based on your home's state (e.g., show "Remote" tab when TV is on).
- **User Privacy:** Hide specific tabs from specific users (e.g., hide admin controls from guests).
- **Conditional Tabs:** Dynamically show or hide tabs based on entity states or complex jinja templates.
- **Performance:** Use the default "lazy-loading" for the best performance, or enable "pre-loading" for instantaneous tab switching.

## Installation

### HACS (Recommended)

1.  Go to the HACS page in your Home Assistant instance.
2.  Click the three-dot menu in the top right.
3.  Select "Custom repositories".
4.  In the "Repository" field, paste the URL of this repository (https://github.com/agoberg85/home-assistant-simple-tabs).
5.  For "Category", select "Dashboard".
6.  Click "Add".
7.  The `simple-tabs-card` will now appear in the HACS Frontend list. Click "Install".

### Manual Installation

1.  Download the `simple-tabs.js` file from the latest [release](https://github.com/agoberg85/home-assistant-simple-tabs/releases).
2.  Copy the file to the `www` directory in your Home Assistant `config` folder.
3.  In your Lovelace dashboard, go to "Manage Resources" and add a new resource:
    - URL: `/local/simple-tabs.js`
    - Resource Type: `JavaScript Module`

## Configuration

### Main Options

| Name | Type | Required? | Description | Default |
| :--- | :--- | :--- | :--- | :--- |
| `type` | string | **Required** | `custom:simple-tabs` | |
| `tabs` | list | **Required** | A list of tab objects to display. See below. | |
| `alignment` | string | Optional | Justification for the row of tabs. (`start`, `center`, `end`) | `'center'` |
| `default_tab` | number/list | Optional | Defines the default tab. Can be a static number (1-based) or a list of conditional rules (see Advanced Configuration). | `1` |
| `hide_inactive_tab_titles` | boolean | Optional | If `true`, hides the title text on tabs that are not currently active (showing only the icon). | `false` |
| `pre-load` | boolean | Optional | If `true`, renders all tab content on load for faster switching. | `false` |
| `background-color`| string | Optional | CSS color for the button background. | `none` |
| `border-color` | string | Optional | CSS color for the button border. | Your theme's `divider-color` |
| `text-color` | string | Optional | CSS color for the button text. | Your theme's `secondary-text-color`|
| `hover-color` | string | Optional | CSS color for button text and border on hover. | Your theme's `primary-text-color`|
| `active-text-color`| string | Optional | CSS color for the active tab's text. | Your theme's `text-primary-color`|
| `active-background`| string | Optional | CSS color/gradient for the active tab's background. | Your theme's `primary-color` |
| `container_background`| string | Optional | CSS color/gradient for the background color of the container. | none |
| `container_padding`| string | Optional | Container padding | 12px |
| `container_rounding`| string | Optional | Border radius of the container | 32px |
| `tabs_gap`| string | Optional | Gap between buttons | 6px |
| `button_padding`| string | Optional | Padding inside each button | 12px |

### Tab Object Options

Each entry in the `tabs` list is an object with the following properties:

| Name | Type | Required? | Description |
| :--- | :--- | :--- | :--- |
| `title` | string | Optional* | The text to display on the tab. Can be jinja template |
| `icon` | string | Optional* | An MDI icon to display next to the title (e.g., `mdi:lightbulb`). Can be jinja template |
| `card` | object | **Required** | A standard Lovelace card configuration. |
| `conditions` | list | Optional | A list of conditions (`entity`, `template`, or `user`) that must be met to show the tab. |
| `badge:` | string | Optional* | Jinja template that outputs true/false |

*Either title or icon has to be defined.

## Advanced Configuration

### Dynamic Default Tab

Instead of a static number, `default_tab` can be a list of rules. The card will check them from top to bottom and select the first one that matches.

**Note:** It is recommended to use `entity` state checks here rather than `template` for faster initial loading.

```yaml
default_tab:
  # 1. If TV is on, open Tab 2 (Controls)
  - tab: 2
    conditions:
      - entity: media_player.tv
        state: 'on'
  # 2. If it is night time, open Tab 3 (Bedroom)
  - tab: 3
    conditions:
      - entity: sun.sun
        state: 'below_horizon'
  # 3. Fallback to Tab 1
  - tab: 1
```

### User Visibility (Privacy)

You can hide specific tabs from specific users by adding a `user` condition. You will need the long User ID string (found in HA Settings -> People -> Users -> Click User -> ID at bottom).

```yaml
tabs:
  - title: Admin Controls
    icon: mdi:shield-account
    conditions:
      - user: 
          - "8234982374982374982374"  # Dad
          - "1928371928371928371928"  # Mom
    card:
       # ...
```

## Example Usage

### Full Example

This configuration demonstrates dynamic defaults, user restrictions, and the compact "hide inactive titles" style.

```yaml
type: custom:simple-tabs
alignment: start
hide_inactive_tab_titles: true
default_tab:
  - tab: 2
    conditions:
      - entity: light.kitchen_lights
        state: 'on'
  - tab: 1
tabs:
  - title: Livingroom
    icon: mdi:sofa
    card:
      type: markdown
      content: Livingroom goes here
  - title: Kitchen
    icon: mdi:silverware-fork-knife
    card:
      type: markdown
      content: Kitchen goes here
  - title: Admin
    icon: mdi:cog
    conditions:
      - user: "YOUR_ADMIN_ID_HERE"
    card:
      type: markdown
      content: Sensitive admin controls...
```

## Roadmap ahead

- **Visual Configuration Editor:** The current version has a basic UI editor, will continue developing a more robust UI editor.
- **More styling options:** Add more configuration options for for example font size, font weight, tab spacing, and button border-radius.
- **Touch navigation:** Add support for touch/swipe navigation on mobile devices.
- **Animations:** Add animations when switching between tabs.
- **URL support:** Make tabs linkable via URLs (like #tab-2)
- **Badges:** Option to add badges (text, number, color) to tab buttons.