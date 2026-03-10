### Conditional Tabs

You can dynamically show or hide a tab by adding a `conditions` list to its configuration. The tab will only be visible if **all** conditions in the list are met (this is an "AND" relationship).

Each condition in the list must be an object of one of the following types:

#### State Condition

This condition checks if a specific entity has a specific state.

| Key | Type | Description |
| :--- | :--- | :--- |
| `entity`| string | The entity ID to check. |
| `state` | string | The state the entity must have for the condition to be true. |

**Example:** Show a "Security" tab only if an `input_boolean` is on.
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

#### Template Condition

This condition evaluates a Home Assistant template in real-time. The tab will be shown if the template's result is "truthy" (e.g., `true`, a non-zero number, or a non-empty string like "show"). For clarity, it's best to have your template explicitly return `true` or `false`.

| Key | Type | Description |
| :--- | :--- | :--- |
| `template`| string | The Home Assistant template to evaluate. |

**Example:** Only show a "Guest Mode" tab if the `guest_mode` input boolean is on.
```yaml
tabs:
  - title: Guest Mode
    icon: mdi:account-star
    conditions:
      - template: "{{ is_state('input_boolean.guest_mode', 'on') }}"
    card:
      # ... card config for guests
```

#### Combining Conditions

You can add multiple condition objects to the list to create more specific rules.

**Example:** Show a "Good Morning" tab only if a specific person is home *and* it is between 6 AM and 11 AM.
```yaml
tabs:
  - title: Good Morning
    icon: mdi:weather-sunset-up
    conditions:
      # Condition 1: Person must be home
      - entity: person.jane_doe
        state: 'home'
      # AND Condition 2: Must be morning
      - template: "{{ now().hour >= 6 and now().hour < 11 }}"
    card:
      # ... card showing morning routine info
```