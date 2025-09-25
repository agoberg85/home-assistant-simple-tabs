# Simple Tabs Card

A clean, highly configurable, and responsive tabs card for Home Assistant Lovelace.

![Simple Tabs Card Screenshot](https://raw.githubusercontent.com/agoberg85/home-assistant-simple-tabs/main/simple-tabs-gif.gif)

## Features

- **Organize Your Dashboard:** Group any Lovelace cards into a clean, tabbed interface to save space and reduce clutter.
- **Tab Icons:** Add icon to your tab titles.
- **Stylable:** Customize colors for the background, border, text, and active tab.
- **Alignment:** Align your tabs to the start, center, or end of the card.
- **Performance:** Use the default "lazy-loading" for the best performance, or enable "pre-loading" for instantaneous tab switching.

## Installation

### HACS (Recommended)

1.  Go to the HACS page in your Home Assistant instance.
2.  Click on "Frontend" and then the three-dot menu in the top right.
3.  Select "Custom repositories".
4.  In the "Repository" field, paste the URL of this repository.
5.  For "Category", select "Lovelace".
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
| `pre-load` | boolean | Optional | If `true`, renders all tab content on load for faster switching. | `false` |
| `background-color`| string | Optional | CSS color for the button background. | `none` |
| `border-color` | string | Optional | CSS color for the button border. | Your theme's `divider-color` |
| `text-color` | string | Optional | CSS color for the button text. | Your theme's `secondary-text-color`|
| `hover-color` | string | Optional | CSS color for button text and border on hover. | Your theme's `primary-text-color`|
| `active-text-color`| string | Optional | CSS color for the active tab's text. | Your theme's `text-primary-color`|
| `active-background`| string | Optional | CSS color/gradient for the active tab's background. | Your theme's `primary-color` |

### Tab Object Options

Each entry in the `tabs` list is an object with the following properties:

| Name | Type | Required? | Description |
| :--- | :--- | :--- | :--- |
| `title` | string | **Required** | The text to display on the tab. |
| `card` | object | **Required** | A standard Lovelace card configuration. |
| `icon` | string | Optional | An MDI icon to display next to the title (e.g., `mdi:lightbulb`). |

## Example Usage

### Example Configuration

This will create two centered tabs using your theme's default colors.

```yaml
type: custom:simple-tabs
pre-load: true
alignment: center
background-color: "#2a2a2a"
border-color: "#555555"
text-color: "#bbbbbb"
hover-color: "#ffffff"
active-text-color: "#000000"
active-background: "linear-gradient(90deg, #ffde00, #ff9900)"
tabs:
  - title: Weather
    icon: mdi:abacus
    card:
      type: markdown
      content: Weather card goes here
  - title: Lights
    card:
      type: markdown
      content: Lights card goes here
```

## Roadmap ahead

- **Visual Configuration Editor:** The card is currently YAML only. Need to build a GUI editor.
- **More styling options:** Add more configuration options for for example font size, font weight, tab spacing, and button border-radius.

## Support development

[bmc]: https://buymeacoffee.com/mysmarthomeblog
[youtube]: https://www.youtube.com/@My_Smart_Home
