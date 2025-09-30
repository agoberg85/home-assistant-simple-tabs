import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
} from 'custom-card-helpers';

function configChanged(oldConfig: TabsCardConfig | undefined, newConfig: TabsCardConfig): boolean {
  if (!oldConfig) return true;
  if (oldConfig.tabs.length !== newConfig.tabs.length) return true;
  
  return oldConfig.tabs.some((tab, index) => {
    const newTab = newConfig.tabs[index];
    if (!newTab) return true;
    
    return tab.title !== newTab.title ||
           tab.icon !== newTab.icon ||
           JSON.stringify(tab.card) !== JSON.stringify(newTab.card) ||
           JSON.stringify(tab.conditions) !== JSON.stringify(newTab.conditions);
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
}

declare global { 
  interface Window { 
    loadCardHelpers?: () => Promise<unknown>;
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

  static getStubConfig(): Record<string, unknown> {
    return {
      type: 'custom:simple-tabs',
      default_tab: 1,
      tabs: [
        {
          title: 'Tab 1',
          icon: 'mdi:home',
          card: {
            type: 'markdown',
            content: 'Content for Tab 1',
          },
        },
        {
          title: 'Tab 2',
          icon: 'mdi:cog',
          card: {
            type: 'markdown',
            content: 'Content for Tab 2',
          },
        },
      ]
    };
  }

  private _templateUnsubscribers: (() => void)[] = [];
  private _disconnectCleanupTimeout?: number;

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
      if (!this.isConnected) {
        this._unsubscribeTemplates();
      }
    }, 0);
  }
  
  private _handleResize = (): void => {
    this._updateOverflowState();
  };

  private _unsubscribeTemplates(): void {
    this._templateUnsubscribers.forEach(unsubscriber => {
      if (unsubscriber) {
        unsubscriber();
      }
    });
    this._templateUnsubscribers = [];
  }

  public async setConfig(config: TabsCardConfig): Promise<void> {
    if (!config || !config.tabs) throw new Error('Invalid configuration');
    
    const configHasChanged = configChanged(this._config, config);
    
    if (configHasChanged) {
      this._cards = config['pre-load'] ? await this._createCards(config.tabs) : new Array(config.tabs.length).fill(null);
      this._tabVisibility = new Array(config.tabs.length).fill(true);
      this._renderedTitles = config.tabs.map(tab => tab.title);
      this._renderedIcons = config.tabs.map(tab => tab.icon);
      this._unsubscribeTemplates();
      await this._subscribeToTemplates(config.tabs);

      // Set the initial selected tab index based on the default_tab config
      let initialTabIndex = 0;
      if (config.default_tab !== undefined) {
        // Use a 1-based index for user-friendliness, so subtract 1 for the array index
        const defaultIndex = config.default_tab - 1;
        if (defaultIndex >= 0 && defaultIndex < config.tabs.length) {
          initialTabIndex = defaultIndex;
        } else {
          console.warn(`[Simple Tabs] Invalid default_tab index: ${config.default_tab}. It must be between 1 and ${config.tabs.length}. Falling back to the first tab.`);
        }
      }
      this._selectedTabIndex = initialTabIndex;
    }
    
    this._config = { alignment: 'center', 'pre-load': false, ...config };
  }

  private _isTemplate(value: string | undefined): boolean {
    return typeof value === 'string' && (value.includes('{{') || value.includes('{%'));
  }

  private async _subscribeToTemplates(tabs: TabConfig[]): Promise<void> {
    const subscriptionPromises: Promise<void>[] = [];

    tabs.forEach((tab, index) => {
      const templateConditions = tab.conditions?.filter(c => 'template' in c) as TemplateCondition[] | undefined;
      if (templateConditions?.length) {
        templateConditions.forEach(condition => {
          const subscriptionPromise = this.hass.connection.subscribeMessage<{result: any}>(
            (message) => {
              const result = message.result;
              let isTrue = false;
              if (typeof result === 'boolean') {
                isTrue = result;
              } else if (typeof result === 'string') {
                const lowerResult = result.toLowerCase().trim();
                isTrue = lowerResult === 'true' || (lowerResult !== 'false' && lowerResult !== '');
              } else if (typeof result === 'number') {
                isTrue = result !== 0;
              } else {
                isTrue = !!result;
              }
              
              if (this._tabVisibility[index] !== isTrue) {
                this._tabVisibility[index] = isTrue;
                this.requestUpdate();
              }
            },
            {
              type: 'render_template',
              template: condition.template,
            }
          ).then(unsubscribe => {
            this._templateUnsubscribers.push(unsubscribe);
          });
          
          subscriptionPromises.push(subscriptionPromise);
        });
      }

      if (this._isTemplate(tab.title)) {
        const subscriptionPromise = this.hass.connection.subscribeMessage<{result: any}>(
            (message) => {
                const newTitle = message.result;
                if (this._renderedTitles[index] !== newTitle) {
                    this._renderedTitles = [
                        ...this._renderedTitles.slice(0, index),
                        newTitle,
                        ...this._renderedTitles.slice(index + 1)
                    ];
                }
            },
            {
                type: 'render_template',
                template: tab.title,
            }
        ).then(unsubscribe => {
            this._templateUnsubscribers.push(unsubscribe);
        });
        subscriptionPromises.push(subscriptionPromise);
      }

      if (this._isTemplate(tab.icon)) {
        const subscriptionPromise = this.hass.connection.subscribeMessage<{result: any}>(
            (message) => {
                const newIcon = message.result;
                if (this._renderedIcons[index] !== newIcon) {
                    this._renderedIcons = [
                        ...this._renderedIcons.slice(0, index),
                        newIcon,
                        ...this._renderedIcons.slice(index + 1)
                    ];
                }
            },
            {
                type: 'render_template',
                template: tab.icon,
            }
        ).then(unsubscribe => {
            this._templateUnsubscribers.push(unsubscribe);
        });
        subscriptionPromises.push(subscriptionPromise);
      }
    });

    await Promise.all(subscriptionPromises);
  }

  protected shouldUpdate(changedProps: Map<string | symbol, unknown>): boolean {
    if (changedProps.has('_config') || changedProps.has('_tabVisibility') || changedProps.has('_selectedTabIndex') || changedProps.has('_renderedTitles') || changedProps.has('_renderedIcons')) {
      return true;
    }

    if (changedProps.has('hass')) {
      const oldHass = changedProps.get('hass') as HomeAssistant;
      if (oldHass && this._config?.tabs) {
        const relevantEntities = this._config.tabs
          .flatMap(tab => tab.conditions?.filter(c => 'entity' in c).map(c => (c as StateCondition).entity) || []);
        
        if (relevantEntities.length > 0) {
          return relevantEntities.some(entity => 
            oldHass.states[entity]?.state !== this.hass.states[entity]?.state
          );
        }
      }
      return true;
    }

    return false;
  }

  private _shouldShowTab(tab: TabConfig, index: number): boolean {
    if (!tab.conditions || !Array.isArray(tab.conditions)) return true;

    return tab.conditions.every((condition) => {
      if ('entity' in condition && 'state' in condition) {
        const entityState = this.hass.states[condition.entity]?.state;
        return entityState !== undefined && entityState === condition.state;
      }
      if ('template' in condition) {
        return this._tabVisibility[index];
      }
      return false;
    });
  }

  private async _createCard(tabConfig: TabConfig): Promise<LovelaceCard | null> {
    try {
      const helpers = await window.loadCardHelpers?.();
      if (!helpers) throw new Error("Card helpers couldn't be loaded.");
      
      const element = (helpers as any).createCardElement(tabConfig.card) as LovelaceCard;
      element.hass = this.hass;
      return element;
    } catch (e: unknown) {
      console.error('Error creating card:', tabConfig.card, e);
      return null;
    }
  }

  private async _ensureCard(index: number): Promise<void> {
    if (!this._cards[index] && this._config.tabs[index]) {
      this._cards[index] = await this._createCard(this._config.tabs[index]);
      this.requestUpdate();
    }
  }
  
  private _scrollToActiveTab(): void {
    const tabsContainer = this.shadowRoot?.querySelector('.tabs');
    const activeButton = this.shadowRoot?.querySelector('.tab-button.active');
    
    if (tabsContainer && activeButton) {
      const containerRect = tabsContainer.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      
      const scrollLeft = buttonRect.left - containerRect.left + tabsContainer.scrollLeft 
                        - containerRect.width / 2 + buttonRect.width / 2;
      
      tabsContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }

  private _updateOverflowState(): void {
    const tabsContainer = this.shadowRoot?.querySelector('.tabs');
    const containerWrapper = this.shadowRoot?.querySelector('.tabs-container');
    
    if (!tabsContainer || !containerWrapper) return;
    
    const isOverflowing = tabsContainer.scrollWidth > tabsContainer.clientWidth;
    const canScrollLeft = tabsContainer.scrollLeft > 0;
    const canScrollRight = tabsContainer.scrollLeft < (tabsContainer.scrollWidth - tabsContainer.clientWidth);
    
    (containerWrapper as HTMLElement).style.setProperty('--left-fade-opacity', canScrollLeft ? '1' : '0');
    (containerWrapper as HTMLElement).style.setProperty('--right-fade-opacity', canScrollRight ? '1' : '0');
  }

  private async _createCards(tabConfigs: TabConfig[]): Promise<(LovelaceCard | null)[]> {
    const helpers = await window.loadCardHelpers?.();
    if (!helpers) throw new Error("Card helpers couldn't be loaded.");
    
    const cardPromises = tabConfigs.map(async (tab) => {
      try {
        const element = (helpers as any).createCardElement(tab.card) as LovelaceCard;
        element.hass = this.hass;
        return element;
      } catch (e: unknown) {
        console.error('Error creating card:', tab.card, e);
        return null;
      }
    });
    
    const results = await Promise.allSettled(cardPromises);
    return results.map(result => (result.status === 'fulfilled' ? result.value : null));
  }

  protected updated(changedProps: Map<string | symbol, unknown>): void {
    super.updated(changedProps);
    if (changedProps.has('hass') && this._cards) {
      this._cards.forEach((card) => { if (card) card.hass = this.hass; });
    }
    
    if (changedProps.has('_selectedTabIndex')) {
      this._scrollToActiveTab();
    }
    
    if (changedProps.has('_config') || changedProps.has('_tabVisibility')) {
      requestAnimationFrame(() => this._updateOverflowState());
    }
  }

  protected render(): TemplateResult {
    try {
      if (!this._config || !this.hass) return html``;

      const visibleTabs = this._config.tabs.map((tab, index) => ({ tab, originalIndex: index }))
        .filter(({ tab, originalIndex }) => this._shouldShowTab(tab, originalIndex));

      if (!visibleTabs.some(({ originalIndex }) => originalIndex === this._selectedTabIndex)) {
        this._selectedTabIndex = visibleTabs.length > 0 ? visibleTabs[0].originalIndex : -1;
      }
      
      const styles = {
        '--simple-tabs-justify-content': this._config.alignment,
        '--simple-tabs-bg-color': this._config['background-color'],
        '--simple-tabs-border-color': this._config['border-color'],
        '--simple-tabs-text-color': this._config['text-color'],
        '--simple-tabs-hover-_color': this._config['hover-color'],
        '--simple-tabs-active-text-color': this._config['active-text-color'],
        '--simple-tabs-active-bg': this._config['active-background'],
      };

      let contentTemplate: TemplateResult;
      
      if (this._config['pre-load']) {
        contentTemplate = html`<div class="content-container">${this._config.tabs.map((tab, index) => {
          if (!this._shouldShowTab(tab, index)) return html``;
          return html`<div class="tab-panel" ?hidden=${this._selectedTabIndex !== index}>${this._cards[index]}</div>`
        })}</div>`;
      } else {
        if (this._selectedTabIndex >= 0 && !this._cards[this._selectedTabIndex]) {
          this._ensureCard(this._selectedTabIndex);
        }
        contentTemplate = html`<div class="content-container"><div class="tab-panel">${this._cards[this._selectedTabIndex]}</div></div>`;
      }

      return html`
        <div class="card-container" style=${styleMap(styles)}>
          <div class="tabs-container">
          <div class="tabs" role="tablist" @scroll=${this._updateOverflowState}>
            ${visibleTabs.map(({ tab, originalIndex }) => {
              if (!this._config['pre-load'] && !this._cards[originalIndex] && originalIndex !== this._selectedTabIndex) {
              } else if (this._config['pre-load'] && !this._cards[originalIndex]) {
                return html``;
              }

              const renderedTitle = this._renderedTitles[originalIndex];
              const renderedIcon = this._renderedIcons[originalIndex];
              
              return html`<button
                class="tab-button ${originalIndex === this._selectedTabIndex ? 'active' : ''}"
                @click=${() => (this._selectedTabIndex = originalIndex)}
            >
                ${renderedIcon ? html`<ha-icon .icon=${renderedIcon}></ha-icon>` : ''}
                ${renderedTitle ? html`<span>${renderedTitle}</span>` : ''}
            </button>`;
          
            })}
          </div>
          </div>
          ${contentTemplate}
        </div>
      `;
    } catch (error) {
      console.error('Simple Tabs render error:', error);
      return html`<ha-card><div class="error">Failed to render tabs card</div></ha-card>`;
    }
  }
  
  static styles = css`
    .tab-button:has(span) ha-icon {
      margin-left: -5px;
    }

    .tab-button:not(:has(span)) ha-icon {
      margin: 0;
    }

    .tab-button:not(:has(span)) {
      padding: 8px 12px;
    }

    .card-container {
      position: relative;
      isolation: isolate;
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
      opacity: var(--left-fade-opacity, 0);
      transition: opacity 0.3s ease;
    }

    .tabs-container::before {
      left: 0;
      background: linear-gradient(to right, var(--primary-background-color, white), transparent);
      opacity: var(--left-fade-opacity, 0);
    }

    .tabs-container::after {
      right: 0;
      background: linear-gradient(to left, var(--primary-background-color, white), transparent);
      opacity: var(--right-fade-opacity, 0);
    }  
    .tabs { 
      display: flex; 
      flex-wrap: nowrap; 
      justify-content: var(--simple-tabs-justify-content, center); 
      gap: 6px; 
      overflow-x: auto;
      overflow-y: hidden;
      padding: 1px;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -ms-overflow-style: none;  
    }
    .tabs::-webkit-scrollbar {
      display: none;
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
    .tab-button:hover { outline-color: var(--simple-tabs-hover-color, var(--primary-text-color)); color: var(--simple-tabs-hover-color, var(--primary-text-color)); }
    .tab-button.active { 
      outline-color: transparent; 
      color: var(--simple-tabs-active-text-color, var(--text-primary-color)); 
      background: var(--simple-tabs-active-bg, var(--primary-color)); 
      z-index: 11;
    }
    .content-container { padding-top: 12px; }
    .tab-panel[hidden] { display: none; }
    .error { padding: 16px; color: var(--error-color); text-align: center; }
  `;
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "simple-tabs",
  name: "Simple Tabs",
  preview: true,
  description: "A card to display multiple cards in a tabbed interface."
});