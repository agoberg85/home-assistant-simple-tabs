import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fireEvent, HomeAssistant } from 'custom-card-helpers';
import { TabsCardConfig, TabConfig, TabConfigSingleCard, TabConfigMultiCard } from './simple-tabs';
import { LovelaceCardConfig } from 'custom-card-helpers/dist/types';
import * as yaml from 'js-yaml';

declare global {
  interface HTMLElementTagNameMap {
    'ha-yaml-editor': HaYamlEditor;
    'ha-icon-picker': HaIconPicker;
    'ha-textfield': HaTextField;
    'ha-expansion-panel': HaExpansionPanel;
    'ha-formfield': HaFormField;
    'ha-switch': HaSwitch;
    'hui-card-element-editor': HuiCardElementEditor;
    'ha-icon-button': HaIconButton;
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

interface HaFormField extends HTMLElement {
  label: string;
}

interface HaSwitch extends HTMLElement {
  checked: boolean;
  disabled: boolean;
}

interface HuiCardElementEditor extends HTMLElement {
  hass?: HomeAssistant;
  value?: LovelaceCardConfig;
  lovelace?: any;
}

interface HaIconButton extends HTMLElement {
  path: string;
  label: string;
  disabled: boolean;
}

function stringifyCard(card: LovelaceCardConfig | string | undefined): string {
  if (!card) {
    return '';  // Empty card
  }

  let cardObject: LovelaceCardConfig;

  if (typeof card === 'string') {
    try {
      cardObject = yaml.load(card) as LovelaceCardConfig;
      if (typeof cardObject !== 'object' || cardObject === null) {
        return card;
      }
    } catch (e) {
      return card;
    }
  } else {
    cardObject = card;
  }

  try {
    // Use specific options to avoid |- literal block scalar
    return yaml.dump(cardObject, {
      indent: 2,
      lineWidth: -1,  // Disable line wrapping
      noRefs: true,   // Don't use anchors/references
      sortKeys: false,
      flowLevel: -1   // Use block style, not flow style
    }).trim();
  } catch (e) {
    console.error("Error dumping YAML:", e);
    return JSON.stringify(cardObject, null, 2);
  }
}

@customElement('simple-tabs-editor')
export class SimpleTabsEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config?: TabsCardConfig;
  @state() private _helpers?: any;
  @state() private _collapsedCards: Set<string> = new Set();
  private _initialized = false;

  public setConfig(config: TabsCardConfig): void {
    this._config = config;
    this._initialized = true;
  }

  private _valueChanged(newConfig: TabsCardConfig): void {
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _toggleHideInactive(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, hide_inactive_tab_titles: target.checked });
  }

  private _toggleShowFade(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, show_fade: target.checked });
  }

  private _toggleEnableSwipe(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, enable_swipe: target.checked });
  }

  private _toggleHaptic(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, haptic_feedback: target.checked });
  }

  private _handleSelectChange(ev: Event, field: string): void {
    if (!this._config) return;
    const target = ev.target as any;
    this._valueChanged({ ...this._config, [field]: target.value });
  }

  /**
   * Check if tab is using new multi-card format
   */
  private _isMultiCardTab(tab: TabConfig): tab is TabConfigMultiCard {
    return 'cards' in tab && Array.isArray(tab.cards);
  }

  /**
   * Get card config from tab (handles both formats)
   */
  private _getTabCard(tab: TabConfig): LovelaceCardConfig | undefined {
    if ('cards' in tab && Array.isArray(tab.cards)) {
      // Multi-card format - return wrapped config
      return { type: 'vertical-stack', cards: tab.cards };
    }
    return tab.card;
  }

  private _handleTabChange(ev: Event, index: number): void {
    if (!this._config) return;

    const target = ev.target as (HaTextField | HaYamlEditor | HaIconPicker);
    const newTabs = [...this._config.tabs];
    let value: string | object;

    const eventValue = (ev as CustomEvent).detail?.value ?? (target as { value: string }).value;
    const fieldName = target.name;

    if (fieldName === 'card') {
      try {
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
    const newTabs = this._config.tabs.filter((_, i) => i !== index);
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  /**
   * Add a new card to a multi-card tab
   */
  private _addCard(tabIndex: number): void {
    if (!this._config) return;

    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];

    // If tab has single card, convert to multi-card format
    if ('card' in tab && tab.card) {
      // SMART UNWRAPPING: Check if the single card is a container (vertical-stack or 1-column grid)
      const isContainer = tab.card.type === 'vertical-stack' ||
        (tab.card.type === 'grid' && (tab.card as any).columns === 1);

      let initialCards: LovelaceCardConfig[] = [tab.card];

      if (isContainer && (tab.card as any).cards) {
        // Unwrap the container's cards
        initialCards = [...(tab.card as any).cards];
      }

      const multiCardTab: TabConfigMultiCard = {
        ...tab,
        cards: [...initialCards, { type: 'markdown', content: 'New card content' }],
        card: undefined
      };
      delete (multiCardTab as any).card;
      newTabs[tabIndex] = multiCardTab;
    }
    // If already multi-card, just add new placeholder
    else if ('cards' in tab) {
      newTabs[tabIndex] = {
        ...tab,
        cards: [...tab.cards, { type: 'markdown', content: 'New card content' }]
      };
    }

    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  /**
   * Remove a card from a multi-card tab
   */
  private _removeCard(tabIndex: number, cardIndex: number): void {
    if (!this._config) return;

    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];

    if ('cards' in tab && tab.cards) {
      const newCards = tab.cards.filter((_, i) => i !== cardIndex);

      // If only one card left, convert back to single-card format
      if (newCards.length === 1) {
        newTabs[tabIndex] = {
          ...tab,
          card: newCards[0],
          cards: undefined
        } as TabConfigSingleCard;
        delete (newTabs[tabIndex] as any).cards;
      } else {
        newTabs[tabIndex] = { ...tab, cards: newCards };
      }
    }

    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  /**
   * Move a card within a multi-card tab
   */
  private _moveCard(tabIndex: number, cardIndex: number, direction: 'up' | 'down'): void {
    if (!this._config) return;

    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];

    if ('cards' in tab && tab.cards) {
      const newCards = [...tab.cards];
      const targetIndex = direction === 'up' ? cardIndex - 1 : cardIndex + 1;

      if (targetIndex >= 0 && targetIndex < newCards.length) {
        [newCards[cardIndex], newCards[targetIndex]] = [newCards[targetIndex], newCards[cardIndex]];
        newTabs[tabIndex] = { ...tab, cards: newCards };
        this._valueChanged({ ...this._config, tabs: newTabs });
      }
    }
  }

  /**
   * Toggle card collapse state
   */
  private _toggleCardCollapse(tabIndex: number, cardIndex: number): void {
    const key = `${tabIndex}-${cardIndex}`;
    const newCollapsed = new Set(this._collapsedCards);
    if (newCollapsed.has(key)) {
      newCollapsed.delete(key);
    } else {
      newCollapsed.add(key);
    }
    this._collapsedCards = newCollapsed;
  }

  /**
   * Update a card within a multi-card tab
   */
  private _updateCard(tabIndex: number, cardIndex: number, cardConfig: LovelaceCardConfig): void {
    if (!this._config) return;

    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];

    if ('cards' in tab && tab.cards) {
      const newCards = [...tab.cards];
      newCards[cardIndex] = cardConfig;
      newTabs[tabIndex] = { ...tab, cards: newCards };
    }

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
        <div class="global-options">
            <h3>Display Settings</h3>
            <ha-formfield label="Hide titles on inactive tabs">
                <ha-switch 
                    .checked=${this._config.hide_inactive_tab_titles || false}
                    @change=${this._toggleHideInactive}
                ></ha-switch>
            </ha-formfield>
            <br>
            <ha-formfield label="Show scroll fade">
                <ha-switch 
                    .checked=${this._config.show_fade ?? true}
                    @change=${this._toggleShowFade}
                ></ha-switch>
            </ha-formfield>
            <br><br>
            <label>Tab Position</label>
            <select 
                .value=${this._config.tab_position || 'top'}
                @change=${(e: Event) => this._handleSelectChange(e, 'tab_position')}
                style="width: 100%; margin-top: 8px; padding: 8px;"
            >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
            </select>
            <select 
                .value=${this._config.alignment || 'center'}
                @change=${(e: Event) => this._handleSelectChange(e, 'alignment')}
                style="width: 100%; margin-top: 8px; padding: 8px;"
            >
                <option value="start">Start (Left)</option>
                <option value="center">Center</option>
                <option value="end">End (Right)</option>
            </select>
            
            <h3 style="margin-top: 16px;">Behavior Settings</h3>
            <ha-formfield label="Enable swipe gestures">
                <ha-switch 
                    .checked=${this._config.enable_swipe ?? true}
                    @change=${this._toggleEnableSwipe}
                ></ha-switch>
            </ha-formfield>
            <br>
            <ha-formfield label="Haptic feedback">
                <ha-switch 
                    .checked=${this._config.haptic_feedback || false}
                    @change=${this._toggleHaptic}
                ></ha-switch>
            </ha-formfield>
            <br><br>
            <label>Remember last tab</label>
            <select 
                .value=${String(this._config.remember_tab || 'false')}
                @change=${(e: Event) => this._handleSelectChange(e, 'remember_tab')}
                style="width: 100%; margin-top: 8px; padding: 8px;"
            >
                <option value="false">Off</option>
                <option value="true">On</option>
                <option value="per_device">Per Device</option>
            </select>
        </div>

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
                            .disabled=${index === (this._config?.tabs.length || 0) - 1}
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
                        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
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
                    <div class="tab-settings-row">
                        <ha-icon-picker
                            .label=${'Icon'}
                            .value=${tab.icon || ''}
                            .name=${'icon'}
                            @value-changed=${(e: Event) => this._handleTabChange(e, index)}
                        ></ha-icon-picker>
                        <ha-textfield
                            .label=${'Tab ID (for deep linking)'}
                            .value=${tab.id || ''}
                            .name=${'id'}
                            @input=${(e: Event) => this._handleTabChange(e, index)}
                        ></ha-textfield>
                    </div>
                    <ha-textfield
                        .label=${'Badge Template (Jinja)'}
                        .value=${tab.badge || ''}
                        .name=${'badge'}
                        placeholder="{{ is_state('light.kitchen', 'on') }}"
                        @input=${(e: Event) => this._handleTabChange(e, index)}
                    ></ha-textfield>

                    ${this._isMultiCardTab(tab) ? html`
                      <!-- Multi-card mode: Show individual YAML editors for each card -->
                      <h3 style="margin-top: 16px;">Tab Cards (${tab.cards.length})</h3>
                      ${tab.cards.map((card, cardIndex) => {
        const isCollapsed = this._collapsedCards.has(`${index}-${cardIndex}`);
        return html`
                        <div style="margin-bottom: 6px; padding: 6px; border: 1px solid var(--divider-color); border-radius: 8px; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                          <div 
                            style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: var(--secondary-background-color, rgba(0,0,0,0.05));"
                            @click=${() => this._toggleCardCollapse(index, cardIndex)}
                          >
                            <div style="display: flex; align-items: center; gap: 0px;">
                              ${tab.cards.length > 1 ? html`
                                <div style="display: flex; gap: 0px;" @click=${(e: Event) => e.stopPropagation()}>
                                  <ha-icon-button
                                    .label=${'Move Up'}
                                    .path=${'M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z'}
                                    ?disabled=${cardIndex === 0}
                                    @click=${() => this._moveCard(index, cardIndex, 'up')}
                                  ></ha-icon-button>
                                  <ha-icon-button
                                    .label=${'Move Down'}
                                    .path=${'M7.41,8.59L12,13.17L16.59,8.59L18,10L12,16L6,10L7.41,8.59Z'}
                                    ?disabled=${cardIndex === (tab.cards?.length || 0) - 1}
                                    @click=${() => this._moveCard(index, cardIndex, 'down')}
                                  ></ha-icon-button>
                                </div>
                              ` : ''}
                              <strong>Card ${cardIndex + 1}</strong>
                              <span style="font-weight: normal; opacity: 0.7; font-size: 0.9em;">- ${card.type}</span>
                            </div>

                            <div style="display: flex; align-items: center; gap: 0px;">
                              ${tab.cards.length > 1 ? html`
                                <ha-icon-button
                                  .label=${'Remove Card'}
                                  .path=${'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z'}
                                  style="color: var(--error-color);"
                                  @click=${(e: Event) => {
              e.stopPropagation();
              this._removeCard(index, cardIndex);
            }}
                                ></ha-icon-button>
                              ` : ''}
                              <ha-icon .icon=${isCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-down'}></ha-icon>
                            </div>
                          </div>
                          <ha-yaml-editor
                            .hass=${this.hass}
                            .name=${'card-' + cardIndex}
                            .defaultValue=${stringifyCard(card)}
                            style=${isCollapsed ? 'display: none;' : ''}
                            @value-changed=${(e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.value && detail.isValid !== false) {
              this._updateCard(index, cardIndex, detail.value);
            }
          }}
                          ></ha-yaml-editor>
                        </div>
                      `;
      })}
                      <button 
                        @click=${() => this._addCard(index)}
                        style="width: 100%; padding: 12px; background: var(--primary-color); color: var(--text-primary-color); border: none; border-radius: 8px; cursor: pointer; font-size: 14px; margin-top: 8px;"
                      >
                        + Add Another Card
                      </button>
                    ` : html`
                      <!-- Single card mode (legacy): Show single YAML editor with option to convert -->
                      <div style="margin-top: 16px;">
                        <p>Card content:</p>
                        <ha-yaml-editor
                          .hass=${this.hass}
                          .name=${'card'}
                          .defaultValue=${stringifyCard(this._getTabCard(tab))}
                          @value-changed=${(e: Event) => this._handleTabChange(e, index)}
                        ></ha-yaml-editor>
                        <button 
                          @click=${() => this._addCard(index)}
                          style="width: 100%; padding: 10px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 8px; cursor: pointer; font-size: 14px; margin-top: 12px;"
                        >
                          + Add Another Card (Convert to Multi-Card)
                        </button>
                      </div>
                    `}
                </div>
            </ha-expansion-panel>
        `)}
        </div>
        <mwc-button @click=${this._addTab} raised class="add-btn">
          <ha-icon icon="mdi:plus" style="margin-right: 8px;"></ha-icon>
          Add Tab
        </mwc-button>
        
        <p class="help-text">
            <strong>Note:</strong> Advanced styling and logic features must be configured via the YAML code editor.
        </p>
      </div>
    `;
  }

  static styles = css`
    .card-config {
      padding: 16px;
    }
    .global-options {
        margin-bottom: 24px;
        padding: 8px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
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
    .help-text { font-size: 0.9em; color: var(--secondary-text-color); margin-top: 24px; }
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
      display: grid;
      gap: 16px;
      overflow: auto;
      margin: 16px;
    }
    .tab-settings-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
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