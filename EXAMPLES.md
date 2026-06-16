# Examples

## Basic Tabs

```yaml
type: custom:simple-tabs
tabs:
  - title: Home
    icon: mdi:home
    card:
      type: markdown
      content: Home content
  - title: Climate
    icon: mdi:thermometer
    card:
      type: thermostat
      entity: climate.living_room
```

## Styled Pill Bar

```yaml
type: custom:simple-tabs
tabs_alignment: start
tab_position: top
card_background: transparent
card_padding: 12px 0 12px 0
bar_background: transparent
bar_border: 1px solid var(--gray400)
bar_padding: 2px
bar_border_radius: 999px
button_background: transparent
button_border_color: transparent
button_text_color: var(--gray400)
button_hover_color: var(--gray600)
button_hover_border_color: transparent
button_active_background: var(--active-big)
button_active_text_color: var(--gray100)
button_padding: 8px 18px
tabs_gap: 6px
tabs:
  - title: Home
    icon: mdi:home
    card:
      type: markdown
      content: Home content
  - title: Garden
    icon: mdi:flower
    card:
      type: markdown
      content: Garden content
  - title: Climate
    icon: mdi:thermometer
    card:
      type: markdown
      content: Climate content
```

## Multiple Cards In One Tab

```yaml
type: custom:simple-tabs
tabs:
  - title: Living Room
    icon: mdi:sofa
    cards:
      - type: entity
        entity: light.living_room
      - type: thermostat
        entity: climate.living_room
      - type: media-control
        entity: media_player.living_room_tv
  - title: Kitchen
    icon: mdi:silverware-fork-knife
    cards:
      - type: tile
        entity: light.kitchen
      - type: tile
        entity: switch.coffee_machine
```

## Dynamic Default Tab

```yaml
type: custom:simple-tabs
default_tab:
  - tab: 2
    conditions:
      - entity: alarm_control_panel.home
        state: armed_away
  - tab: 3
    conditions:
      - template: "{{ states('sensor.outdoor_temperature') | float(0) < 0 }}"
  - tab: 1
tabs:
  - title: Home
    icon: mdi:home
    card:
      type: markdown
      content: Default home view
  - title: Security
    icon: mdi:shield-lock
    card:
      type: alarm-panel
      entity: alarm_control_panel.home
  - title: Weather
    icon: mdi:weather-snowy
    card:
      type: weather-forecast
      entity: weather.home
```

## Conditional Tabs

You can dynamically show or hide a tab by adding a `conditions` list to its configuration. The tab is visible only if all conditions are met.

### State Condition

This condition checks if a specific entity has a specific state. It also supports numeric comparisons for sensor-like entities.

| Key | Type | Description |
| :--- | :--- | :--- |
| `entity` | string | The entity ID to check. |
| `state` | string | Exact state like `'on'` or numeric comparison like `'> 0'`, `'>= 10'`, `'< 5'`, `'<= 5'`, `'= 3'`, or `'== 3'`. |

```yaml
tabs:
  - title: Security
    icon: mdi:shield-lock
    conditions:
      - entity: input_boolean.show_security_tab
        state: 'on'
    card:
      type: alarm-panel
      entity: alarm_control_panel.home
```

```yaml
tabs:
  - title: Alerts
    icon: mdi:alert
    conditions:
      - entity: sensor.unusual_temperature_alert
        state: '> 0'
    card:
      type: markdown
      content: There are active temperature alerts.
```

### Template Condition

This condition evaluates a Home Assistant template in real time.

| Key | Type | Description |
| :--- | :--- | :--- |
| `template` | string | The Home Assistant template to evaluate. |

```yaml
tabs:
  - title: Guest Mode
    icon: mdi:account-star
    conditions:
      - template: "{{ is_state('input_boolean.guest_mode', 'on') }}"
    card:
      type: markdown
      content: Guest controls
```

```yaml
tabs:
  - title: Outdoor Climate
    conditions:
      - template: "{{ states('sensor.outdoor_temperature') | float(0) > 0 }}"
    card:
      type: markdown
      content: It is above freezing outside.
```

### Combining Conditions

```yaml
tabs:
  - title: Good Morning
    icon: mdi:weather-sunset-up
    conditions:
      - entity: person.jane_doe
        state: 'home'
      - template: "{{ now().hour >= 6 and now().hour < 11 }}"
    card:
      type: markdown
      content: Morning routine info
```

## Full Example

```yaml
type: custom:simple-tabs
tabs_alignment: start
hide_inactive_tab_titles: true
enable_swipe: true
swipe_animation: true
tab_click_animation: false
remember_tab: per_device
default_tab:
  - tab: 2
    conditions:
      - entity: light.kitchen_lights
        state: 'on'
  - tab: 1
card_background: transparent
card_padding: 12px 0 12px 0
bar_background: transparent
bar_border: 1px solid rgba(255,255,255,0.12)
bar_padding: 4px
bar_border_radius: 999px
button_background: transparent
button_border_color: transparent
button_text_color: var(--secondary-text-color)
button_hover_color: var(--primary-text-color)
button_hover_border_color: transparent
button_active_background: linear-gradient(90deg, #e59bc2, #f6c7a8)
button_active_text_color: '#222'
button_padding: 8px 18px
tabs_gap: 6px
tabs:
  - title: Living Room
    icon: mdi:sofa
    card:
      type: markdown
      content: Living Room goes here
  - title: Kitchen
    icon: mdi:silverware-fork-knife
    card:
      type: markdown
      content: Kitchen goes here
  - title: Admin
    icon: mdi:cog
    conditions:
      - user: YOUR_ADMIN_ID_HERE
    card:
      type: markdown
      content: Sensitive admin controls
```
