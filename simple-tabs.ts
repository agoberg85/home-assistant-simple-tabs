import './simple-tabs-editor';
import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from 'custom-card-helpers';

// (Interfaces like StateCondition, TabConfig, etc. remain the same)
// ... (Your existing interfaces go here) ...
function configChanged(oldConfig: TabsCardConfig | undefined, newConfig: TabsCardConfig): boolean {
  if (!oldConfig) return true;
  if (oldConfig.tabs.length !== newConfig.tabs.length) return true;
  
  return oldConfig.tabs.some((tab, index) => {
    const newTab = newConfig.tabs[index];
    if (!newTab) return true;
    
    return tab.title !== newTab.title ||
           tab.icon !== newTab.icon ||
           JSON.stringify(tab.card) !== JSON.stringify(tab.card) ||
           JSON.stringify(tab.conditions) !== JSON.stringify(tab.conditions);
  });
}

export interface StateCondition { entity: string; state: string; }
export interface TemplateCondition { template: string; }

export interface TabConfig {
  title: string;
  icon?: string;
  card: LovelaceCardConfig;
  conditions?: (StateCondition | TemplateCondition)[];
}

export interface TabsCardConfig {
  type: string;
  tabs: TabConfig[];
  default_tab?: number;
  'pre-load'?: boolean;
  alignment?: 'start' | 'center' | 'end';
  'background-color'?: string;
  'border-color'?: string;
  'text-color'?: string;
  'hover-color'?: string;
  'active-text-color'?: string;
  'active-background'?: string;
  margin?: string;
  container_background?: string;
  container_padding?: string;
  container_rounding?: string;  
}

declare global { 
  interface Window { 
    loadCardHelpers?: () => Promise<any>;
    customCards?: { type: string; name: string; preview?: boolean; description?: string; }[];
  } 
}


@customElement('simple-tabs')
export class SimpleTabs extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: TabsCardConfig;
  @state() private _cards: (LovelaceCard | null)[] = [];
  @state() private _selectedTabIndex = 0;
  @state() private _tabVisibility: boolean[] = [];
  @state() private _renderedTitles: (string | undefined)[] = [];
  @state() private _renderedIcons: (string | undefined)[] = [];

  @query('.tabs') private _tabsEl?: HTMLDivElement;

  private _helpers?: any;
  private _helpersPromise?: Promise<void>;
  private _templateUnsubscribers: (() => void)[] = [];
  private _disconnectCleanupTimeout?: number;
  private _hassSet = false;

  static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('simple-tabs-editor') as LovelaceCardEditor;
  }

  static getStubConfig(): Record<string, unknown> {
    return {
      type: 'custom:simple-tabs',
      tabs: [
        { title: 'Tab 1', icon: 'mdi:home', card: { type: 'markdown', content: 'Content for Tab 1' } },
        { title: 'Tab 2', icon: 'mdi:cog', card: { type: 'markdown', content: 'Content for Tab 2' } },
      ]
    };
  }
  
  private _loadHelpers(): Promise<void> {
    if (this._helpers) return Promise.resolve();
    if (!this._helpersPromise) {
      this._helpersPromise = new Promise(async (resolve, reject) => {
        try {
          this._helpers = await window.loadCardHelpers?.();
          resolve();
        } catch (e) {
          console.error('[Simple Tabs] Error loading card helpers:', e);
          reject(e);
        }
      });
    }
    return this._helpersPromise;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (this._disconnectCleanupTimeout) {
      clearTimeout(this._disconnectCleanupTimeout);
      this._disconnectCleanupTimeout = undefined;
    }
    window.addEventListener('resize', this._handleResize);
  }
  
  public async disconnectedCallback(): Promise<void> {
    super.disconnectedCallback();
    window.removeEventListener('resize', this._handleResize);
    this._disconnectCleanupTimeout = window.setTimeout(() => {
      if (!this.isConnected) this._unsubscribeTemplates();
    }, 0);
  }
  
  private _handleResize = (): void => { this._updateOverflowState(); };

  private _unsubscribeTemplates(): void {
    this._templateUnsubscribers.forEach(unsubscriber => unsubscriber?.());
    this._templateUnsubscribers = [];
  }

  public async setConfig(config: TabsCardConfig): Promise<void> {
    if (!config || !config.tabs) throw new Error('Invalid configuration');
    
    if (!configChanged(this._config, config)) return;
      
    this._loadHelpers();
    this._unsubscribeTemplates();

    this._config = { alignment: 'center', 'pre-load': false, ...config };
    this._cards = new Array(config.tabs.length).fill(null);
    this._tabVisibility = new Array(config.tabs.length).fill(true);
    this._renderedTitles = config.tabs.map(tab => tab.title);
    this._renderedIcons = config.tabs.map(tab => tab.icon);

    if (this._hassSet) {
      this._subscribeToTemplates(this._config.tabs);
    }
    
    let initialTabIndex = 0;
    if (config.default_tab !== undefined) {
      const defaultIndex = config.default_tab - 1;
      if (defaultIndex >= 0 && defaultIndex < config.tabs.length) {
        initialTabIndex = defaultIndex;
      } else {
        console.warn(`[Simple Tabs] Invalid default_tab: ${config.default_tab}. Falling back to first tab.`);
      }
    }
    this._selectedTabIndex = initialTabIndex;

    if (this._config['pre-load']) {
      this._createCards(this._config.tabs).then(cards => { this._cards = cards; });
    }
  }
  
  private _isTemplate(value: unknown): value is string {
    return typeof value === 'string' && (value.includes('{{') || value.includes('{%'));
  }

  private async _subscribeToTemplates(tabs: TabConfig[]): Promise<void> {
    const renderTemplate = async (template: string, callback: (result: any) => void) => {
      try {
        const unsub = await this.hass.connection.subscribeMessage(callback, { type: 'render_template', template });
        this._templateUnsubscribers.push(unsub);
      } catch (e) {
        console.error("[Simple Tabs] Error subscribing to template:", e);
      }
    };
  
    const promises = tabs.flatMap((tab, index) => {
      const subs: Promise<void>[] = [];
      const updateState = (key: '_renderedTitles' | '_renderedIcons', value: any) => {
          const currentArray = this[key];
          if (currentArray[index] !== value) {
              const newArray = [...currentArray];
              newArray[index] = value;
              this[key] = newArray;
          }
      };

      if (this._isTemplate(tab.title)) {
        subs.push(renderTemplate(tab.title, msg => updateState('_renderedTitles', msg.result)));
      }
      if (this._isTemplate(tab.icon)) {
        subs.push(renderTemplate(tab.icon, msg => updateState('_renderedIcons', msg.result)));
      }
      tab.conditions?.forEach(cond => {
        if ('template' in cond) {
          subs.push(renderTemplate(cond.template, msg => {
            let isTrue = !!msg.result;
            if (typeof msg.result === 'string') {
              const lower = msg.result.toLowerCase().trim();
              isTrue = lower !== 'false' && lower !== '';
            }
            if (this._tabVisibility[index] !== isTrue) {
              const newVisibility = [...this._tabVisibility];
              newVisibility[index] = isTrue;
              this._tabVisibility = newVisibility;
            }
          }));
        }
      });
      return subs;
    });
    await Promise.all(promises);
  }

  protected shouldUpdate(changedProps: Map<string | symbol, unknown>): boolean {
    // Always update if the configuration, selected tab, or visibility changes.
    if (
      changedProps.has('_config') ||
      changedProps.has('_selectedTabIndex') ||
      changedProps.has('_tabVisibility') ||
      changedProps.has('_renderedTitles') ||
      changedProps.has('_renderedIcons')
    ) {
      return true;
    }
  
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
  
    // If there's no old hass object, we need to update.
    if (!oldHass) {
      return true;
    }
  
    // This is the key change: we check if the entity states have changed.
    // We also check 'localize' for language changes.
    return (
      oldHass.states !== this.hass.states ||
      oldHass.localize !== this.hass.localize
    );
  }
  
  private _shouldShowTab(tab: TabConfig, index: number): boolean {
    return tab.conditions?.every(c => {
      if ('entity' in c) return this.hass.states[c.entity]?.state === c.state;
      if ('template' in c) return this._tabVisibility[index];
      return false;
    }) ?? true;
  }

  private async _createCard(tabConfig: TabConfig): Promise<LovelaceCard | null> {
    try {
      await this._loadHelpers();
      const element = this._helpers.createCardElement(tabConfig.card) as LovelaceCard;
      element.hass = this.hass;
      return element;
    } catch (e) {
      console.error('[Simple Tabs] Error creating card:', tabConfig.card, e);
      return null;
    }
  }

  private async _ensureCard(index: number): Promise<void> {
    if (this._cards[index] || !this._config.tabs[index]) return;
    const card = await this._createCard(this._config.tabs[index]);
    this._cards = [...this._cards.slice(0, index), card, ...this._cards.slice(index + 1)];
  }
  
  private _scrollToActiveTab(smooth = true): void {
    const tabsContainer = this._tabsEl;
    const activeButton = this.shadowRoot?.querySelector('.tab-button.active');
    if (tabsContainer && activeButton) {
      const containerRect = tabsContainer.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      const scrollLeft = buttonRect.left - containerRect.left + tabsContainer.scrollLeft - containerRect.width / 2 + buttonRect.width / 2;
      tabsContainer.scrollTo({ 
        left: scrollLeft, 
        behavior: smooth ? 'smooth' : 'auto' 
      });
    }
  }

  private _updateOverflowState(): void {
    const tabsContainer = this._tabsEl;
    const containerWrapper = this.shadowRoot?.querySelector('.tabs-container');
    if (tabsContainer && containerWrapper) {
      const scrollBuffer = 1;
      const canScrollLeft = tabsContainer.scrollLeft > scrollBuffer;
      const canScrollRight = tabsContainer.scrollWidth > tabsContainer.clientWidth + tabsContainer.scrollLeft + scrollBuffer;
      containerWrapper.classList.toggle('can-scroll-left', canScrollLeft);
      containerWrapper.classList.toggle('can-scroll-right', canScrollRight);
    }
  }

  private async _createCards(tabConfigs: TabConfig[]): Promise<(LovelaceCard | null)[]> {
    await this._loadHelpers();
    const cardPromises = tabConfigs.map(tab => this._createCard(tab));
    return Promise.all(cardPromises);
  }

  public firstUpdated(): void {
    requestAnimationFrame(() => this._scrollToActiveTab(false));

    if (!this._config['pre-load']) {
      setTimeout(() => this._startBackgroundCardLoading(), 100);
    }
  }
  
  private _startBackgroundCardLoading(): void {
    if (!this._config) return;
  
    const tabsToLoad = this._config.tabs
      .map((_, index) => index)
      .filter(index => index !== this._selectedTabIndex && !this._cards[index]);
  
    const loadNext = () => {
      if (tabsToLoad.length === 0) return;
      const indexToLoad = tabsToLoad.shift()!;
      this._ensureCard(indexToLoad).then(() => {
        requestAnimationFrame(loadNext);
      });
    };
  
    loadNext();
  }
  
  // FIX: Updated drag handler to distinguish between click and drag
  private _handleDragStart(e: MouseEvent): void {
    const tabsEl = this._tabsEl;
    if (!tabsEl) return;

    if (e.button !== 0) return; // Only drag with left mouse button

    let isDragging = false;
    const startX = e.pageX;
    const scrollLeft = tabsEl.scrollLeft;

    const handleDragMove = (em: MouseEvent): void => {
      const walk = em.pageX - startX;
      
      // If we haven't started dragging and we've moved enough, start the drag
      if (!isDragging && Math.abs(walk) > 3) {
          isDragging = true;
          tabsEl.classList.add('dragging');
      }

      if (isDragging) {
          tabsEl.scrollLeft = scrollLeft - walk;
          this._updateOverflowState();
      }
    };

    const handleDragEnd = (): void => {
      tabsEl.classList.remove('dragging');
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }

  protected updated(changedProps: Map<string | symbol, unknown>): void {
    if (this.hass && this._config && !this._hassSet) {
      this._hassSet = true;
      this._subscribeToTemplates(this._config.tabs);
    }

    if (changedProps.has('hass')) {
      this._cards.forEach(card => { if (card) card.hass = this.hass; });
    }
    
    if (changedProps.has('_selectedTabIndex') && !this._config['pre-load']) {
      this._ensureCard(this._selectedTabIndex);
    }

    // FIX: No changes here, but confirming that this call now correctly uses
    // the default smooth scrolling for clicks.
    if (changedProps.has('_selectedTabIndex')) {
        this._scrollToActiveTab();
    }
    
    if (changedProps.has('_config') || changedProps.has('_tabVisibility')) {
      requestAnimationFrame(() => this._updateOverflowState());
    }
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) return html``;

    const visibleTabs = this._config.tabs
      .map((tab, originalIndex) => ({ tab, originalIndex }))
      .filter(({ tab, originalIndex }) => this._shouldShowTab(tab, originalIndex));

    if (visibleTabs.length > 0 && !visibleTabs.some(({ originalIndex }) => originalIndex === this._selectedTabIndex)) {
        Promise.resolve().then(() => {
            this._selectedTabIndex = visibleTabs[0].originalIndex;
        });
    }
    
    const styles: { [key: string]: string | undefined } = {
      '--simple-tabs-bg-color': this._config['background-color'],
      '--simple-tabs-border-color': this._config['border-color'],
      '--simple-tabs-text-color': this._config['text-color'],
      '--simple-tabs-hover-color': this._config['hover-color'],
      '--simple-tabs-active-text-color': this._config['active-text-color'],
      '--simple-tabs-active-bg': this._config['active-background'],
      '--simple-tabs-container-bg': this._config.container_background,
      '--simple-tabs-container-padding': this._config.container_padding,
      '--simple-tabs-container-rounding': this._config.container_rounding,      
    };
    
    if (this._config.margin) {
      styles.margin = this._config.margin;
    }
    
    const content = this._config.tabs.map((tab, index) => html`
      <div class="tab-panel" ?hidden=${this._selectedTabIndex !== index}>
        ${this._shouldShowTab(tab, index) ? this._cards[index] : ''}
      </div>`);
      
    const alignmentClass = `align-${this._config.alignment || 'center'}`;
    
    return html`
      <div class="card-container" style=${styleMap(styles)}>
        <div class="tabs-container ${alignmentClass}">
          <div class="tabs" role="tablist" @scroll=${this._updateOverflowState} @mousedown=${this._handleDragStart}>
            ${visibleTabs.map(({ originalIndex }) => html`
              <button
                class="tab-button ${originalIndex === this._selectedTabIndex ? 'active' : ''}"
                @click=${() => (this._selectedTabIndex = originalIndex)}
              >
                ${this._renderedIcons[originalIndex] ? html`<ha-icon .icon=${this._renderedIcons[originalIndex]}></ha-icon>` : ''}
                ${this._renderedTitles[originalIndex] ? html`<span>${this._renderedTitles[originalIndex]}</span>` : ''}
              </button>`
            )}
          </div>
        </div>
        <div class="content-container">${content}</div>
      </div>
    `;
  }
  
  static styles = css`
    :host { display: block; }
    .card-container {
      position: relative;
      isolation: isolate;
      background: var(--simple-tabs-container-bg, none);
      padding: var(--simple-tabs-container-padding, 0);
      border-radius: var(--simple-tabs-container-rounding, 0);
    }

    .tabs-container {
      position: relative;
      overflow: hidden;
    }
    .tabs-container::before, .tabs-container::after {
      content: '';
      position: absolute;
      top: 0;
      width: 60px;
      height: 100%;
      pointer-events: none;
      z-index: 10;
      will-change: opacity;
      transform: translateZ(0);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .tabs-container::before {
      left: 0;
      background: linear-gradient(to right, var(--primary-background-color, white), transparent);
    }

    .tabs-container::after {
      right: 0;
      background: linear-gradient(to left, var(--primary-background-color, white), transparent);
    } 
    .tabs-container.can-scroll-left::before { opacity: 1; }
    .tabs-container.can-scroll-right::after { opacity: 1; }
    
    .tabs { 
      display: flex; 
      flex-wrap: nowrap; 
      gap: 6px; 
      overflow-x: auto;
      overflow-y: hidden;
      padding: 1px;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -ms-overflow-style: none;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
    }
    
    .tabs.dragging {
      cursor: grabbing;
    }
    
    .tabs.dragging .tab-button {
        pointer-events: none;
    }

    .tabs::-webkit-scrollbar { display: none; }
    
    .tabs-container.align-start .tabs {
        justify-content: flex-start;
    }
    .tabs-container.align-end .tabs {
        justify-content: flex-end;
    }
    .tabs-container.align-center .tabs::before,
    .tabs-container.align-center .tabs::after {
        content: '';
        flex-grow: 1;
    }
    
    .tab-button { 
      box-sizing: border-box; 
      background: var(--simple-tabs-bg-color, none); 
      outline: 1px solid var(--simple-tabs-border-color, var(--divider-color)); 
      border: none; 
      cursor: pointer; 
      padding: 8px 16px; 
      font-size: var(--ha-font-size-m); 
      color: var(--simple-tabs-text-color, var(--secondary-text-color)); 
      position: relative; 
      z-index: 1;
      border-radius: 24px; 
      transition: all 0.3s; 
      display: inline-flex; 
      align-items: center; 
      justify-content: center; 
      gap: 8px; 
      font-family: var(--primary-font-family);
      text-wrap: nowrap;
    }
    .tab-button ha-icon { margin-left: -4px; }
    .tab-button:not(:has(span)) { padding: 8px 12px; }
    .tab-button:not(:has(span)) ha-icon { margin: 0; }
    .tab-button:hover { 
      color: var(--simple-tabs-hover-color, var(--primary-text-color));
      outline-color: var(--simple-tabs-hover-color, var(--primary-text-color));
    }
    .tab-button.active { 
      color: var(--simple-tabs-active-text-color, var(--text-primary-color)); 
      background: var(--simple-tabs-active-bg, var(--primary-color)); 
      outline-color: transparent; 
    }
    .content-container { padding-top: 12px; }
    .tab-panel[hidden] { display: none; }
  `;
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "simple-tabs",
  name: "Simple Tabs",
  preview: true,
  description: "A card to display multiple cards in a tabbed interface."
});