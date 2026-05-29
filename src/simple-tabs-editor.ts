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
    'ha-input': HaInput;
    'ha-expansion-panel': HaExpansionPanel;
    'ha-formfield': HaFormField;
    'ha-switch': HaSwitch;
    'hui-card-element-editor': HuiCardElementEditor;
    'hui-dialog-edit-card': HuiDialogEditCard;
    'hui-card-picker': HuiCardPicker;
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

interface HaInput extends HTMLElement {
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

interface HuiDialogEditCard extends HTMLElement {
  hass?: HomeAssistant;
  showDialog(params: {
    cardConfig: LovelaceCardConfig;
    lovelaceConfig?: any;
    saveCardConfig: (config: LovelaceCardConfig) => void | Promise<LovelaceCardConfig | void>;
  }): Promise<void>;
}

interface HuiCardPicker extends HTMLElement {
  hass?: HomeAssistant;
  lovelace?: any;
  label?: string;
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
  @property({ attribute: false }) public lovelace?: any;
  @state() private _config?: TabsCardConfig;
  @state() private _helpers?: any;
  @state() private _openCardPickers: number[] = [];
  private _initialized = false;

  public setConfig(config: TabsCardConfig): void {
    this._config = config;
    this._initialized = true;
  }

  private _valueChanged(newConfig: TabsCardConfig): void {
    // Keep the editor state in sync even if the parent editor delays pushing
    // the updated config back down, which can happen in nested popup editors.
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig }, { bubbles: true, composed: true });
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

    const target = ev.target as (HaInput | HaYamlEditor | HaIconPicker);
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

  private _getTabCards(tab: TabConfig): LovelaceCardConfig[] {
    if ('cards' in tab && Array.isArray(tab.cards)) {
      return [...tab.cards];
    }
    return tab.card ? [tab.card] : [];
  }

  private _setTabCards(tabIndex: number, cards: LovelaceCardConfig[]): void {
    if (!this._config) return;

    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];

    if (cards.length <= 1) {
      const singleTab: TabConfigSingleCard = {
        ...tab,
        card: cards[0] ?? { type: 'markdown', content: 'New card content' },
        cards: undefined
      } as TabConfigSingleCard;
      delete (singleTab as any).cards;
      newTabs[tabIndex] = singleTab;
    } else {
      const multiCardTab: TabConfigMultiCard = {
        ...tab,
        cards,
        card: undefined
      } as TabConfigMultiCard;
      delete (multiCardTab as any).card;
      newTabs[tabIndex] = multiCardTab;
    }

    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  /**
   * Remove a card from a multi-card tab
   */
  private _removeCard(tabIndex: number, cardIndex: number): void {
    if (!this._config) return;
    const tab = this._config.tabs[tabIndex];
    const cards = this._getTabCards(tab);
    if (cards.length <= 1) return;
    cards.splice(cardIndex, 1);
    this._setTabCards(tabIndex, cards);
  }

  /**
   * Move a card within a multi-card tab
   */
  private _moveCard(tabIndex: number, cardIndex: number, direction: 'up' | 'down'): void {
    if (!this._config) return;
    const tab = this._config.tabs[tabIndex];
    const cards = this._getTabCards(tab);
    const targetIndex = direction === 'up' ? cardIndex - 1 : cardIndex + 1;

    if (targetIndex >= 0 && targetIndex < cards.length) {
      [cards[cardIndex], cards[targetIndex]] = [cards[targetIndex], cards[cardIndex]];
      this._setTabCards(tabIndex, cards);
    }
  }

  private async _openCardEditor(tabIndex: number, cardIndex?: number): Promise<void> {
    if (!this._config || !this.hass) return;

    const tab = this._config.tabs[tabIndex];
    let currentCard: LovelaceCardConfig | undefined;

    if (typeof cardIndex === 'number' && 'cards' in tab && Array.isArray(tab.cards)) {
      currentCard = tab.cards[cardIndex];
    } else if ('card' in tab && tab.card) {
      currentCard = tab.card;
    }

    if (!currentCard) return;

    try {
      await customElements.whenDefined('hui-dialog-edit-card');
      const dialog = document.createElement('hui-dialog-edit-card') as HuiDialogEditCard;
      dialog.hass = this.hass;
      document.body.appendChild(dialog);

      const cleanup = (): void => {
        dialog.removeEventListener('dialog-closed', cleanup as EventListener);
        if (dialog.parentNode === document.body) {
          document.body.removeChild(dialog);
        }
      };
      dialog.addEventListener('dialog-closed', cleanup as EventListener, { once: true });

      await dialog.showDialog({
        cardConfig: currentCard,
        lovelaceConfig: (this as any).lovelace,
        saveCardConfig: (updatedCard: LovelaceCardConfig) => {
          if (!this._config) return;
          if (!updatedCard) return;
          const newTabs = [...this._config.tabs];
          const editableTab = newTabs[tabIndex];

          if (typeof cardIndex === 'number' && 'cards' in editableTab && Array.isArray(editableTab.cards)) {
            const newCards = [...editableTab.cards];
            newCards[cardIndex] = updatedCard;
            const multiCardTab: TabConfigMultiCard = {
              ...editableTab,
              cards: newCards,
              card: undefined
            } as TabConfigMultiCard;
            delete (multiCardTab as any).card;
            newTabs[tabIndex] = multiCardTab;
          } else {
            const singleTab: TabConfigSingleCard = {
              ...editableTab,
              card: updatedCard,
              cards: undefined
            } as TabConfigSingleCard;
            delete (singleTab as any).cards;
            newTabs[tabIndex] = singleTab;
          }

          this._valueChanged({ ...this._config, tabs: newTabs });
        }
      });
    } catch (e) {
      console.error('[Simple Tabs Editor] Failed to open visual card editor:', e);
    }
  }

  private _handleCardPicked(ev: Event, tabIndex: number): void {
    if (!this._config) return;
    ev.stopPropagation();
    const detail = (ev as CustomEvent).detail;
    const pickedCard = detail?.config as LovelaceCardConfig | undefined;
    if (!pickedCard || typeof pickedCard !== 'object') return;

    const cards = this._getTabCards(this._config.tabs[tabIndex]);
    cards.push(pickedCard);
    this._setTabCards(tabIndex, cards);
    this._openCardPickers = this._openCardPickers.filter(index => index !== tabIndex);
  }

  private _cardTypeLabel(card: LovelaceCardConfig): string {
    const type = card.type || 'Unknown';
    const clean = type.replace(/^custom:/, '').replace(/-/g, ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  private _toggleCardPicker(tabIndex: number): void {
    this._openCardPickers = this._openCardPickers.includes(tabIndex)
      ? this._openCardPickers.filter(index => index !== tabIndex)
      : [tabIndex];
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
            <h3 class="settings-title">Display Settings</h3>
            <div class="setting-row">
              <span>Hide titles on inactive tabs</span>
              <ha-switch 
                  .checked=${this._config.hide_inactive_tab_titles || false}
                  @change=${this._toggleHideInactive}
              ></ha-switch>
            </div>
            <div class="setting-row">
              <span>Show scroll fade</span>
              <ha-switch 
                  .checked=${this._config.show_fade ?? true}
                  @change=${this._toggleShowFade}
              ></ha-switch>
            </div>
            <div class="select-group">
              <label class="select-label">Tab Position</label>
              <select 
                  class="ha-like-select"
                  .value=${this._config.tab_position || 'top'}
                  @change=${(e: Event) => this._handleSelectChange(e, 'tab_position')}
              >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
              </select>
            </div>
            <div class="select-group">
              <label class="select-label">Tab Alignment</label>
              <select 
                  class="ha-like-select"
                  .value=${this._config.alignment || 'center'}
                  @change=${(e: Event) => this._handleSelectChange(e, 'alignment')}
              >
                  <option value="start">Start (Left)</option>
                  <option value="center">Center</option>
                  <option value="end">End (Right)</option>
              </select>
            </div>

            <h3 class="settings-title behavior-title">Behavior Settings</h3>
            <div class="setting-row">
              <span>Enable swipe gestures</span>
              <ha-switch 
                  .checked=${this._config.enable_swipe ?? true}
                  @change=${this._toggleEnableSwipe}
              ></ha-switch>
            </div>
            <div class="setting-row">
              <span>Haptic feedback</span>
              <ha-switch 
                  .checked=${this._config.haptic_feedback || false}
                  @change=${this._toggleHaptic}
              ></ha-switch>
            </div>
            <div class="select-group">
              <label class="select-label">Remember last tab</label>
              <select 
                  class="ha-like-select"
                  .value=${String(this._config.remember_tab || 'false')}
                  @change=${(e: Event) => this._handleSelectChange(e, 'remember_tab')}
              >
                  <option value="false">Off</option>
                  <option value="true">On</option>
                  <option value="per_device">Per Device</option>
              </select>
            </div>
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
                    <ha-input
                        class="summary-title"
                        .name=${'title'}
                        .value=${tab.title || ''}
                        placeholder="Tab Title"
                        @input=${(e: Event) => this._handleTabChange(e, index)}
                        @click=${(e: Event) => e.stopPropagation()}
                        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
                    ></ha-input>
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
                        <ha-input
                            .label=${'Tab ID (for deep linking)'}
                            .value=${tab.id || ''}
                            .name=${'id'}
                            @input=${(e: Event) => this._handleTabChange(e, index)}
                        ></ha-input>
                    </div>
                    <ha-input
                        .label=${'Badge Template (Jinja)'}
                        .value=${tab.badge || ''}
                        .name=${'badge'}
                        placeholder="{{ is_state('light.kitchen', 'on') }}"
                        @input=${(e: Event) => this._handleTabChange(e, index)}
                    ></ha-input>

                    <div style="margin-top: 16px;">
                      <h3 style="margin: 0 0 12px 0;">Cards</h3>
                      ${this._getTabCards(tab).map((card, cardIndex, allCards) => html`
                        <div class="card-list-row">
                          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                            <span style="opacity: 0.7;">${cardIndex + 1}</span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this._cardTypeLabel(card)}</span>
                          </div>
                          <div style="display: flex; align-items: center; gap: 0;">
                            <ha-icon-button
                              .label=${'Move Up'}
                              .path=${'M7,15L12,10L17,15H7Z'}
                              ?disabled=${cardIndex === 0}
                              @click=${() => this._moveCard(index, cardIndex, 'up')}
                            ></ha-icon-button>
                            <ha-icon-button
                              .label=${'Move Down'}
                              .path=${'M7,9L12,14L17,9H7Z'}
                              ?disabled=${cardIndex === allCards.length - 1}
                              @click=${() => this._moveCard(index, cardIndex, 'down')}
                            ></ha-icon-button>
                            <ha-icon-button
                              .label=${'Edit Card'}
                              .path=${'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z'}
                              @click=${() => this._openCardEditor(index, cardIndex)}
                            ></ha-icon-button>
                            <ha-icon-button
                              .label=${'Delete Card'}
                              .path=${'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z'}
                              ?disabled=${allCards.length <= 1}
                              style="color: var(--error-color);"
                              @click=${() => this._removeCard(index, cardIndex)}
                            ></ha-icon-button>
                          </div>
                        </div>
                      `)}
                      <button
                        class="picker-toggle-btn"
                        @click=${() => this._toggleCardPicker(index)}
                      >
                        ${this._openCardPickers.includes(index) ? 'Close Card Picker' : 'Add Card'}
                      </button>
                      ${this._openCardPickers.includes(index) ? html`
                        <div class="card-picker-shell">
                          <hui-card-picker
                            .hass=${this.hass}
                            .lovelace=${this.lovelace}
                            label="Search cards"
                            @config-changed=${(e: Event) => this._handleCardPicked(e, index)}
                          ></hui-card-picker>
                        </div>
                      ` : ''}
                    </div>
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
        padding: 14px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        background: var(--ha-card-background, rgba(0,0,0,0.12));
    }
    .settings-title {
      margin: 0 0 10px 0;
      font-size: 1.1rem;
      font-weight: 500;
    }
    .behavior-title {
      margin-top: 18px;
    }
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: 0 2px;
      border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 70%, transparent 30%);
    }
    .setting-row:last-of-type {
      border-bottom: none;
    }
    .select-group {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }
    .select-label {
      font-size: 0.95rem;
      color: var(--secondary-text-color);
    }
    .ha-like-select {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--card-background-color, var(--ha-card-background, #1f1f1f)) 88%, black 12%);
      font: inherit;
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
    .card-list-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      padding: 8px 12px;
      border-radius: 20px;
      background: var(--ha-card-background, rgba(0,0,0,0.16));
      border: 1px solid var(--divider-color);
    }
    .card-picker-shell {
      margin-top: 12px;
      padding: 12px;
      border-radius: 16px;
      background: color-mix(in srgb, var(--card-background-color, var(--ha-card-background, #1f1f1f)) 84%, black 16%);
      border: 1px solid var(--divider-color);
    }
    .picker-toggle-btn {
      width: 100%;
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--divider-color);
      background: var(--ha-card-background, rgba(0, 0, 0, 0.16));
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
      text-align: center;
    }
    .card-picker-shell hui-card-picker {
      --ha-card-border-radius: 16px;
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
