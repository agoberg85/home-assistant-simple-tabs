import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fireEvent, HomeAssistant } from 'custom-card-helpers';
import { TabsCardConfig } from './simple-tabs';
import { LovelaceCardConfig } from 'custom-card-helpers/dist/types';
import * as yaml from 'js-yaml';

// Declare the types for Home Assistant's custom elements globally.
declare global {
  interface HTMLElementTagNameMap {
    'ha-yaml-editor': HaYamlEditor;
    'ha-icon-picker': HaIconPicker;
    'ha-textfield': HaTextField;
    'ha-expansion-panel': HaExpansionPanel;
  }
}

interface HaYamlEditor extends HTMLElement {
  defaultValue: string;
  value: string;
  hass: HomeAssistant;
  isValid: boolean;
  name: string;
}

interface HaIconPicker extends HTMLElement {
  value: string;
  label: string;
  name: string;
}

interface HaTextField extends HTMLElement {
    value: string;
    label: string;
    name: string;
}

interface HaExpansionPanel extends HTMLElement {
    header: string;
    expanded: boolean;
}


// Helper function to safely stringify the card config into YAML
function stringifyCard(card: LovelaceCardConfig | string): string {
  let cardObject: LovelaceCardConfig;

  if (typeof card === 'string') {
    try {
      // Try to parse the string as YAML.
      cardObject = yaml.load(card) as LovelaceCardConfig;
      // If the parsed result is not an object (e.g., just a string or number),
      // return the original string because we can't format it as a card.
      if (typeof cardObject !== 'object' || cardObject === null) {
        return card;
      }
    } catch (e) {
      // If it's not valid YAML, return the string as is for the user to fix.
      return card;
    }
  } else {
    cardObject = card;
  }

  // Now we are sure we have an object, dump it to a clean YAML string.
  try {
    return yaml.dump(cardObject, { skipInvalid: true, indent: 2 }).trimEnd();
  } catch (e) {
    console.error("Error dumping YAML:", e);
    return JSON.stringify(cardObject, null, 2);
  }
}

@customElement('simple-tabs-editor')
export class SimpleTabsEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: TabsCardConfig;

  public setConfig(config: TabsCardConfig): void {
    this._config = config;
  }

  private _valueChanged(newConfig: TabsCardConfig): void {
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _handleTabChange(ev: Event, index: number): void {
    if (!this._config) return;

    const target = ev.target as (HaTextField | HaYamlEditor | HaIconPicker);
    const newTabs = [...this._config.tabs];
    let value: string | object;

    // FIX: Changed the unsafe type cast from 'HTMLInputElement' to a safer generic object type.
    const eventValue = (ev as CustomEvent).detail?.value ?? (target as { value: string }).value;
    const fieldName = target.name;

    if (fieldName === 'card') {
      try {
        // Add indentation to each line of the input to make it valid YAML
        const indentedValue = eventValue
          .split('\n')
          .map((line: string) => `  ${line}`)
          .join('\n');
        value = yaml.load(indentedValue) as object;
        if (value === null || typeof value !== 'object') {
          value = { type: '' };
        }
      } catch (e) {
        value = eventValue;
      }
    } else {
      value = eventValue;
    }

    newTabs[index] = { ...newTabs[index], [fieldName]: value };
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  private _addTab(): void {
    if (!this._config) return;
    const newTabs = [...(this._config.tabs || []), {
      title: 'New Tab',
      icon: 'mdi:new-box',
      card: { type: 'markdown', content: '## New Tab Content' }
    }];
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  private _removeTab(index: number): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    newTabs.splice(index, 1);
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  private _moveTab(index: number, direction: 'up' | 'down'): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    const [tab] = newTabs.splice(index, 1);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    newTabs.splice(newIndex, 0, tab);
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    return html`
      <div class="card-config">
        <div class="tabs-list">
        ${this._config.tabs.map((tab, index) => html`
            <ha-expansion-panel>
                <div slot="header" class="summary-header">
                    <div class="reorder-controls">
                        <ha-icon
                            class="reorder-btn"
                            icon="mdi:arrow-up"
                            title="Move Up"
                            .disabled=${index === 0}
                            @click=${(e: Event) => {
                                e.stopPropagation();
                                this._moveTab(index, 'up');
                            }}
                        ></ha-icon>
                        <ha-icon
                            class="reorder-btn"
                            icon="mdi:arrow-down"
                            title="Move Down"
                            .disabled=${index === this._config.tabs.length - 1}
                            @click=${(e: Event) => {
                                e.stopPropagation();
                                this._moveTab(index, 'down');
                            }}
                        ></ha-icon>
                    </div>
                    <ha-textfield
                        class="summary-title"
                        .name=${'title'}
                        .value=${tab.title || ''}
                        placeholder="Tab Title"
                        @input=${(e: Event) => this._handleTabChange(e, index)}
                        @click=${(e: Event) => e.stopPropagation()}
                    ></ha-textfield>
                    <ha-icon
                        class="remove-icon"
                        icon="mdi:delete"
                        title="Remove Tab"
                        @click=${(e: Event) => {
                            e.stopPropagation();
                            this._removeTab(index);
                        }}
                    ></ha-icon>
                </div>

                <div class="card-content">
                    <ha-icon-picker
                        .label=${'Icon'}
                        .value=${tab.icon || ''}
                        .name=${'icon'}
                        @value-changed=${(e: Event) => this._handleTabChange(e, index)}
                    ></ha-icon-picker>
              <p>Card content (Only YAML for now):</p>
                    <ha-yaml-editor
                        .hass=${this.hass}
                        .name=${'card'}
                        .defaultValue=${stringifyCard(tab.card)}
                        @value-changed=${(e: Event) => this._handleTabChange(e, index)}
                    ></ha-yaml-editor>
                </div>
            </ha-expansion-panel>
        `)}
        </div>
        <mwc-button @click=${this._addTab} raised class="add-btn">
          <ha-icon icon="mdi:plus" style="margin-right: 8px;"></ha-icon>
          Add Tab
        </mwc-button>
      </div>
    `;
  }

  static styles = css`
    .card-config {
      padding: 16px;
    }
    .tabs-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    ha-expansion-panel {
      border-radius: 6px;
      --expansion-panel-content-padding: 0;
      background: var(--sidebar-background-color);
    }
    p {margin: 12px 0 0 0;}
    .summary-header {
      display: flex;
      align-items: center;
      width: 100%;
    }
    .summary-title {
      flex: 1;
      --mdc-text-field-fill-color: transparent; 
      --text-field-border-width: 0px;
    }
    .remove-icon {
      color: var(--secondary-text-color);
      padding: 0 8px;
    }
    .add-btn {
        background: var(--accent-color);
        padding: 8px 16px 8px 8px;
        border-radius: 20px;
        cursor: pointer;
        color: var(--mdc-theme-on-secondary);
    }
    .card-content {
      padding: 16px;
      display: grid;
      gap: 16px;
    }
    .reorder-controls {
        display: flex;
        align-items: center;
        padding-left: 8px;
    }
    .reorder-btn {
        cursor: pointer;
        color: var(--secondary-text-color);
    }
    .reorder-btn[disabled] {
        opacity: 0.3;
        pointer-events: none;
    }
  `;
}