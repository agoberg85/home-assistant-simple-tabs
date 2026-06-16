import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fireEvent, HomeAssistant } from 'custom-card-helpers';
import { BadgeDisplay, TabsCardConfig, TabConfig, TabConfigSingleCard, TabConfigMultiCard } from './simple-tabs';
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

interface HaIconButton extends HTMLElement {
  path: string;
  label: string;
  disabled: boolean;
}

interface PickerCardOption {
  type: string;
  name: string;
  description: string;
  config: LovelaceCardConfig;
  custom?: boolean;
}

const CORE_CARD_OPTIONS: PickerCardOption[] = [
  { type: 'tile', name: 'Tile', description: 'Show an entity as a compact tile.', config: { type: 'tile', entity: '' } },
  { type: 'entities', name: 'Entities', description: 'Show a list of entities.', config: { type: 'entities', entities: [] } },
  { type: 'markdown', name: 'Markdown', description: 'Render Markdown text.', config: { type: 'markdown', content: '## New card' } },
  { type: 'button', name: 'Button', description: 'Show a tappable entity button.', config: { type: 'button', entity: '' } },
  { type: 'entity', name: 'Entity', description: 'Show the state of one entity.', config: { type: 'entity', entity: '' } },
  { type: 'gauge', name: 'Gauge', description: 'Show a numeric entity as a gauge.', config: { type: 'gauge', entity: '' } },
  { type: 'history-graph', name: 'History Graph', description: 'Show entity history over time.', config: { type: 'history-graph', entities: [] } },
  { type: 'statistics-graph', name: 'Statistics Graph', description: 'Show long-term statistics.', config: { type: 'statistics-graph', entities: [] } },
  { type: 'media-control', name: 'Media Control', description: 'Control a media player.', config: { type: 'media-control', entity: '' } },
  { type: 'picture', name: 'Picture', description: 'Show an image.', config: { type: 'picture', image: '' } },
  { type: 'picture-entity', name: 'Picture Entity', description: 'Show an entity with an image.', config: { type: 'picture-entity', entity: '' } },
  { type: 'picture-elements', name: 'Picture Elements', description: 'Place elements over an image.', config: { type: 'picture-elements', image: '', elements: [] } },
  { type: 'horizontal-stack', name: 'Horizontal Stack', description: 'Stack cards side by side.', config: { type: 'horizontal-stack', cards: [] } },
  { type: 'vertical-stack', name: 'Vertical Stack', description: 'Stack cards vertically.', config: { type: 'vertical-stack', cards: [] } },
  { type: 'grid', name: 'Grid', description: 'Arrange cards in a grid.', config: { type: 'grid', columns: 2, square: false, cards: [] } },
  { type: 'conditional', name: 'Conditional', description: 'Show a card only when conditions match.', config: { type: 'conditional', conditions: [], card: { type: 'markdown', content: 'Conditional card' } } },
  { type: 'custom', name: 'Manual / Custom YAML', description: 'Start with a YAML-friendly custom card placeholder.', config: { type: 'custom:' } },
];


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
  @state() private _openCardEditors: string[] = [];
  @state() private _cardPickerFilter = '';
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

  private _toggleEnableSwipe(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, enable_swipe: target.checked });
  }

  private _toggleSwipeAnimation(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, swipe_animation: target.checked });
  }

  private _toggleTabClickAnimation(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, tab_click_animation: target.checked });
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


  private _handleConfigInput(ev: Event, field: keyof TabsCardConfig): void {
    if (!this._config) return;
    const target = ev.target as HaInput;
    this._valueChanged({ ...this._config, [field]: target.value });
  }

  private _renderConfigInput(field: keyof TabsCardConfig, label: string, placeholder = ''): TemplateResult {
    return html`
      <ha-input
        .label=${label}
        .value=${String(this._config?.[field] ?? '')}
        .name=${String(field)}
        .placeholder=${placeholder}
        @input=${(e: Event) => this._handleConfigInput(e, field)}
      ></ha-input>
    `;
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
      // Multi-card format - return wrapped 1-column grid config
      return { type: 'grid', columns: 1, square: false, cards: tab.cards };
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

  private _getBadgeTemplates(tab: TabConfig): string[] {
    if (Array.isArray(tab.badge_templates) && tab.badge_templates.length > 0) {
      return tab.badge_templates;
    }
    return tab.badge ? [tab.badge] : [];
  }

  private _setBadgeConfig(tabIndex: number, updates: { badge_templates?: string[]; badge_display?: BadgeDisplay }): void {
    if (!this._config) return;

    const newTabs = [...this._config.tabs];
    const existingBadgeTemplates = this._getBadgeTemplates(newTabs[tabIndex]);
    const updatedTab = {
      ...newTabs[tabIndex],
      badge_templates: updates.badge_templates ?? existingBadgeTemplates,
      badge_display: updates.badge_display ?? newTabs[tabIndex].badge_display,
      badge: undefined
    } as TabConfig & { badge?: string };

    delete updatedTab.badge;
    if (!updatedTab.badge_templates?.length) {
      delete updatedTab.badge_templates;
    }
    if (!updatedTab.badge_display) {
      delete updatedTab.badge_display;
    }

    newTabs[tabIndex] = updatedTab;
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  private _handleBadgeTemplateChange(ev: Event, tabIndex: number, badgeIndex: number): void {
    const target = ev.target as HaInput;
    const badgeTemplates = [...this._getBadgeTemplates(this._config!.tabs[tabIndex])];
    badgeTemplates[badgeIndex] = target.value;
    this._setBadgeConfig(tabIndex, { badge_templates: badgeTemplates });
  }

  private _addBadgeTemplate(tabIndex: number): void {
    const badgeTemplates = [...this._getBadgeTemplates(this._config!.tabs[tabIndex]), ''];
    this._setBadgeConfig(tabIndex, { badge_templates: badgeTemplates });
  }

  private _removeBadgeTemplate(tabIndex: number, badgeIndex: number): void {
    const badgeTemplates = this._getBadgeTemplates(this._config!.tabs[tabIndex]).filter((_, index) => index !== badgeIndex);
    this._setBadgeConfig(tabIndex, { badge_templates: badgeTemplates });
  }

  private _handleBadgeDisplayChange(ev: Event, tabIndex: number): void {
    const target = ev.target as HTMLSelectElement;
    this._setBadgeConfig(tabIndex, { badge_display: target.value as BadgeDisplay });
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

  private _cardEditorKey(tabIndex: number, cardIndex: number): string {
    return `${tabIndex}:${cardIndex}`;
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

  private _toggleCardEditor(tabIndex: number, cardIndex: number): void {
    const key = this._cardEditorKey(tabIndex, cardIndex);
    this._openCardEditors = this._openCardEditors.includes(key)
      ? this._openCardEditors.filter(editorKey => editorKey !== key)
      : [key];
  }

  private _handleInlineCardChanged(ev: Event, tabIndex: number, cardIndex: number): void {
    if (!this._config) return;
    ev.stopPropagation();

    const updatedCard = (ev as CustomEvent).detail?.config as LovelaceCardConfig | undefined;
    if (!updatedCard || typeof updatedCard !== 'object') return;

    const cards = this._getTabCards(this._config.tabs[tabIndex]);
    cards[cardIndex] = updatedCard;
    this._setTabCards(tabIndex, cards);
  }

  private _cardPickerOptions(): PickerCardOption[] {
    const customOptions = (window.customCards || [])
      .filter(card => card.type && card.type !== 'simple-tabs')
      .map(card => ({
        type: `custom:${card.type}`,
        name: card.name || card.type,
        description: card.description || `Custom card: ${card.type}`,
        config: { type: `custom:${card.type}` },
        custom: true
      }));

    return [...CORE_CARD_OPTIONS, ...customOptions].sort((a, b) => a.name.localeCompare(b.name));
  }

  private _filteredCardPickerOptions(): PickerCardOption[] {
    const filter = this._cardPickerFilter.trim().toLowerCase();
    const options = this._cardPickerOptions();
    if (!filter) return options;

    return options.filter(option =>
      option.name.toLowerCase().includes(filter) ||
      option.type.toLowerCase().includes(filter) ||
      option.description.toLowerCase().includes(filter)
    );
  }

  private _handleCardPickerFilter(ev: Event): void {
    this._cardPickerFilter = (ev.target as HTMLInputElement).value;
  }

  private _addPickedCard(tabIndex: number, pickedCard: LovelaceCardConfig): void {
    if (!this._config) return;

    const cards = this._getTabCards(this._config.tabs[tabIndex]);
    cards.push(JSON.parse(JSON.stringify(pickedCard)) as LovelaceCardConfig);
    this._setTabCards(tabIndex, cards);
    this._openCardPickers = this._openCardPickers.filter(index => index !== tabIndex);
    this._openCardEditors = [this._cardEditorKey(tabIndex, cards.length - 1)];
    this._cardPickerFilter = '';
  }

  private _cardTypeLabel(card: LovelaceCardConfig): string {
    const type = card.type || 'Unknown';
    const clean = type.replace(/^custom:/, '').replace(/-/g, ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  private _toggleCardPicker(tabIndex: number): void {
    const isOpen = this._openCardPickers.includes(tabIndex);
    this._openCardPickers = isOpen
      ? this._openCardPickers.filter(index => index !== tabIndex)
      : [tabIndex];
    if (isOpen) {
      this._cardPickerFilter = '';
    }
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
          <ha-expansion-panel .expanded=${true}>
            <div slot="header" class="panel-header">General</div>
            <div class="panel-body">
              <div class="setting-row">
                <span>Hide titles on inactive tabs</span>
                <ha-switch
                  .checked=${this._config.hide_inactive_tab_titles || false}
                  @change=${this._toggleHideInactive}
                ></ha-switch>
              </div>
              <div class="two-column-grid">
                <div class="select-group compact-group">
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
                <div class="select-group compact-group">
                  <label class="select-label">Tab Alignment</label>
                  <select
                    class="ha-like-select"
                    .value=${(this._config.tabs_alignment ?? this._config.alignment) || 'center'}
                    @change=${(e: Event) => this._handleSelectChange(e, 'tabs_alignment')}
                  >
                    <option value="start">Start (Left)</option>
                    <option value="center">Center</option>
                    <option value="end">End (Right)</option>
                  </select>
                </div>
              </div>
              <div class="select-group compact-group">
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
          </ha-expansion-panel>

          <ha-expansion-panel>
            <div slot="header" class="panel-header">Interactions</div>
            <div class="panel-body">
              <div class="setting-row">
                <span>Enable swipe gestures</span>
                <ha-switch
                  .checked=${this._config.enable_swipe ?? true}
                  @change=${this._toggleEnableSwipe}
                ></ha-switch>
              </div>
              <div class="setting-row">
                <span>Animate swipe gestures</span>
                <ha-switch
                  .checked=${this._config.swipe_animation ?? true}
                  @change=${this._toggleSwipeAnimation}
                ></ha-switch>
              </div>
              <div class="setting-row">
                <span>Animate tab clicks</span>
                <ha-switch
                  .checked=${this._config.tab_click_animation ?? this._config.swipe_animation ?? true}
                  @change=${this._toggleTabClickAnimation}
                ></ha-switch>
              </div>
              <div class="setting-row">
                <span>Haptic feedback</span>
                <ha-switch
                  .checked=${this._config.haptic_feedback || false}
                  @change=${this._toggleHaptic}
                ></ha-switch>
              </div>
            </div>
          </ha-expansion-panel>

          <ha-expansion-panel>
            <div slot="header" class="panel-header">Card Shell</div>
            <div class="panel-body">
              <div class="config-grid">
                ${this._renderConfigInput('card_background', 'Card Background', 'transparent')}
                ${this._renderConfigInput('card_border_radius', 'Card Border Radius', '32px')}
                ${this._renderConfigInput('card_padding', 'Card Padding', '12px 0 12px 0')}
                ${this._renderConfigInput('margin', 'Card Margin', '0')}
                ${this._renderConfigInput('margin-bottom', 'Card Margin Bottom', '0')}
              </div>
            </div>
          </ha-expansion-panel>

          <ha-expansion-panel>
            <div slot="header" class="panel-header">Tab Bar</div>
            <div class="panel-body">
              <div class="config-grid">
                ${this._renderConfigInput('bar_background', 'Bar Background', 'transparent')}
                ${this._renderConfigInput('bar_border', 'Bar Border', '1px solid rgba(255,255,255,0.12)')}
                ${this._renderConfigInput('bar_padding', 'Bar Padding', '4px')}
                ${this._renderConfigInput('bar_border_radius', 'Bar Border Radius', '999px')}
                ${this._renderConfigInput('tabs_gap', 'Gap Between Buttons', '6px')}
              </div>
            </div>
          </ha-expansion-panel>

          <ha-expansion-panel>
            <div slot="header" class="panel-header">Buttons</div>
            <div class="panel-body">
              <div class="config-grid">
                ${this._renderConfigInput('button_background', 'Button Background', 'transparent')}
                ${this._renderConfigInput('button_border_color', 'Button Border Color', 'transparent')}
                ${this._renderConfigInput('button_text_color', 'Button Text Color', 'var(--secondary-text-color)')}
                ${this._renderConfigInput('button_hover_color', 'Button Hover Text Color', 'var(--primary-text-color)')}
                ${this._renderConfigInput('button_hover_border_color', 'Button Hover Border Color', 'var(--primary-text-color)')}
                ${this._renderConfigInput('button_active_background', 'Active Button Background', 'var(--primary-color)')}
                ${this._renderConfigInput('button_active_text_color', 'Active Button Text Color', 'var(--text-primary-color)')}
                ${this._renderConfigInput('button_padding', 'Button Padding', '8px 16px')}
              </div>
            </div>
          </ha-expansion-panel>
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
                    <div class="badge-settings">
                      <div class="badge-settings-header">
                        <h3>Badge</h3>
                        <button
                          class="secondary-btn"
                          type="button"
                          @click=${() => this._addBadgeTemplate(index)}
                        >Add Badge Rule</button>
                      </div>
                      <div class="select-group badge-display-group">
                        <label class="select-label">Badge Display</label>
                        <select
                          class="ha-like-select"
                          .value=${tab.badge_display || 'dot'}
                          @change=${(e: Event) => this._handleBadgeDisplayChange(e, index)}
                        >
                          <option value="dot">Dot</option>
                          <option value="count">Count True Rules</option>
                          <option value="exclamation">Exclamation Mark</option>
                        </select>
                      </div>
                      ${this._getBadgeTemplates(tab).length > 0 ? this._getBadgeTemplates(tab).map((badgeTemplate, badgeIndex) => html`
                        <div class="badge-rule-row">
                          <ha-input
                            .label=${`Badge Rule ${badgeIndex + 1} (Jinja)`}
                            .value=${badgeTemplate}
                            placeholder="{{ is_state('light.kitchen', 'on') }}"
                            @input=${(e: Event) => this._handleBadgeTemplateChange(e, index, badgeIndex)}
                          ></ha-input>
                          <button
                            class="icon-btn danger-btn"
                            type="button"
                            title="Remove Badge Rule"
                            @click=${() => this._removeBadgeTemplate(index, badgeIndex)}
                          >
                            <ha-icon icon="mdi:delete"></ha-icon>
                          </button>
                        </div>
                      `) : html`<p class="badge-empty-state">No badge rules yet. Add one to control the badge.</p>`}
                    </div>

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
                              @click=${() => this._toggleCardEditor(index, cardIndex)}
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
                        ${this._openCardEditors.includes(this._cardEditorKey(index, cardIndex)) ? html`
                          <div class="inline-card-editor">
                            <hui-card-element-editor
                              .hass=${this.hass}
                              .lovelace=${this.lovelace}
                              .value=${card}
                              @config-changed=${(e: Event) => this._handleInlineCardChanged(e, index, cardIndex)}
                            ></hui-card-element-editor>
                          </div>
                        ` : ''}
                      `)}
                      <button
                        class="picker-toggle-btn"
                        @click=${() => this._toggleCardPicker(index)}
                      >
                        ${this._openCardPickers.includes(index) ? 'Close Card Picker' : 'Add Card'}
                      </button>
                      ${this._openCardPickers.includes(index) ? html`
                        <div class="card-picker-shell">
                          <input
                            class="card-picker-search"
                            type="search"
                            placeholder="Search cards"
                            .value=${this._cardPickerFilter}
                            @input=${this._handleCardPickerFilter}
                          />
                          <div class="card-picker-grid">
                            ${this._filteredCardPickerOptions().map(option => html`
                              <button
                                class="card-picker-option"
                                type="button"
                                @click=${() => this._addPickedCard(index, option.config)}
                              >
                                <span class="card-picker-option-name">${option.name}</span>
                                <span class="card-picker-option-type">${option.type}</span>
                                <span class="card-picker-option-description">${option.description}</span>
                              </button>
                            `)}
                          </div>
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
      </div>
    `;
  }

  static styles = css`
    .card-config {
      padding: 16px;
    }
    .global-options {
      display: grid;
      gap: 8px;
      margin-bottom: 24px;
    }
    .panel-header {
      font-weight: 500;
    }
    .panel-body {
      display: grid;
      gap: 14px;
      padding: 16px;
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
    .compact-group {
      margin-top: 0;
    }
    .two-column-grid,
    .config-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 16px;
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
    .badge-settings {
      display: grid;
      gap: 12px;
      padding: 14px;
      border-radius: 14px;
      border: 1px solid var(--divider-color);
      background: var(--ha-card-background, rgba(0,0,0,0.12));
    }
    .badge-settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .badge-settings-header h3 {
      margin: 0;
      font-size: 1rem;
    }
    .badge-display-group {
      margin-top: 0;
    }
    .badge-rule-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: end;
    }
    .badge-empty-state {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: 0.95rem;
    }
    .secondary-btn,
    .icon-btn {
      border: 1px solid var(--divider-color);
      background: var(--ha-card-background, rgba(0, 0, 0, 0.16));
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    .secondary-btn {
      padding: 8px 12px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .icon-btn {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .danger-btn {
      color: var(--error-color);
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
      display: grid;
      gap: 12px;
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
    .card-picker-search {
      box-sizing: border-box;
      width: 100%;
      min-height: 42px;
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color, var(--ha-card-background, #1f1f1f));
      color: var(--primary-text-color);
      font: inherit;
    }
    .card-picker-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      max-height: 420px;
      overflow: auto;
      padding-right: 2px;
    }
    .card-picker-option {
      display: grid;
      gap: 4px;
      min-height: 96px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--divider-color);
      background: var(--ha-card-background, rgba(0, 0, 0, 0.14));
      color: var(--primary-text-color);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .card-picker-option:hover,
    .card-picker-option:focus-visible {
      border-color: var(--accent-color);
      outline: none;
    }
    .card-picker-option-name {
      font-weight: 500;
    }
    .card-picker-option-type,
    .card-picker-option-description {
      color: var(--secondary-text-color);
      font-size: 0.9rem;
      line-height: 1.25;
    }
    .inline-card-editor {
      display: block;
      margin: -2px 0 12px 0;
      padding: 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--card-background-color, var(--ha-card-background, #1f1f1f)) 88%, black 12%);
      border: 1px solid var(--divider-color);
    }
    .inline-card-editor hui-card-element-editor {
      display: block;
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

    @media (max-width: 720px) {
      .two-column-grid,
      .config-grid,
      .tab-settings-row {
        grid-template-columns: 1fr;
      }
    }
  `;
}
