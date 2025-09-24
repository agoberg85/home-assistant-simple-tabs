import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceCardConfig,
} from 'custom-card-helpers';
import { styleMap } from 'lit/directives/style-map.js';
import { deepEqual } from './deep-equal';

export interface TabConfig {
  title: string;
  icon?: string;
  card: LovelaceCardConfig;
}

// NEW: Added the optional 'pre-load' boolean
export interface TabsCardConfig {
  type: string;
  tabs: TabConfig[];
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
    loadCardHelpers?: () => Promise<any>;
  }
}

@customElement('simple-tabs')
export class SimpleTabs extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: TabsCardConfig;
  @state() private _cards: (LovelaceCard | null)[] = [];
  @state() private _selectedTabIndex = 0;

  public async setConfig(config: TabsCardConfig): Promise<void> {
    if (!config || !config.tabs || !Array.isArray(config.tabs)) {
      throw new Error('Invalid configuration: "tabs" array is required.');
    }

    if (!this._config || !deepEqual(this._config.tabs, config.tabs)) {
      this._cards = await this._createCards(config.tabs);
    }
    
    // NEW: Set the default for 'pre-load' to false
    this._config = {
      alignment: 'center',
      'pre-load': false, // Lazy-loading is the safer default
      ...config,
    };
  }

  private async _createCards(tabConfigs: TabConfig[]): Promise<(LovelaceCard | null)[]> {
    const helpers = await window.loadCardHelpers?.();
    if (!helpers) {
      throw new Error("Card helpers couldn't be loaded.");
    }
    
    const cardPromises = tabConfigs
      .filter(tab => tab && tab.card && tab.title)
      .map(async (tab) => {
        try {
          const element = helpers.createCardElement(tab.card) as LovelaceCard;
          element.hass = this.hass;
          return element;
        } catch (e) {
          console.error('Error creating card:', tab.card, e);
          return null;
        }
      });

    const results = await Promise.allSettled(cardPromises);
    
    return results.map(result => (result.status === 'fulfilled' ? result.value : null));
  }

  protected updated(changedProperties: Map<string | symbol, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('hass') && this._cards) {
      this._cards.forEach((card) => {
        if (card) {
          card.hass = this.hass;
        }
      });
    }
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    const styles = {
      '--simple-tabs-justify-content': this._config.alignment,
      '--simple-tabs-bg-color': this._config['background-color'],
      '--simple-tabs-border-color': this._config['border-color'],
      '--simple-tabs-text-color': this._config['text-color'],
      '--simple-tabs-hover-color': this._config['hover-color'],
      '--simple-tabs-active-text-color': this._config['active-text-color'],
      '--simple-tabs-active-bg': this._config['active-background'],
    };

    // NEW: The core logic for switching rendering modes
    let contentTemplate: TemplateResult;

    if (this._config['pre-load']) {
      // Eager/Pre-loading mode: render all cards, hide inactive ones with CSS
      contentTemplate = html`
        <div class="content-container">
          ${this._cards.map((card, index) => html`
            <div class="tab-panel" id="tabpanel-${index}" role="tabpanel" ?hidden=${this._selectedTabIndex !== index}>
              ${card}
            </div>
          `)}
        </div>
      `;
    } else {
      // Lazy-loading mode: render only the active card
      contentTemplate = html`
        <div class="content-container">
          <div class="tab-panel" id="tabpanel-${this._selectedTabIndex}" role="tabpanel">
            ${this._cards[this._selectedTabIndex]}
          </div>
        </div>
      `;
    }

    return html`
      <div class="card-container" style=${styleMap(styles)}>
        <div class="tabs" role="tablist">
          <!-- The buttons part of the template remains the same -->
          ${this._config.tabs.map((tab, index) => {
            if (!this._cards[index]) return html``;
            return html`
              <button class="tab-button ${index === this._selectedTabIndex ? 'active' : ''}" @click=${() => (this._selectedTabIndex = index)} role="tab" aria-selected="${index === this._selectedTabIndex}" aria-controls="tabpanel-${index}">
                ${tab.icon ? html`<ha-icon .icon=${tab.icon}></ha-icon>` : ''}
                <span>${tab.title}</span>
              </button>
            `;
          })}
        </div>
        
        <!-- Render the content based on the selected mode -->
        ${contentTemplate}
      </div>
    `;
  }

  // NEW: CSS is updated to support both modes
  static styles = css`
    .tabs { display: flex; flex-wrap: wrap; justify-content: var(--simple-tabs-justify-content, center); gap: 10px; }
    .tab-button { background: var(--simple-tabs-bg-color, none); border: 1px solid var(--simple-tabs-border-color, var(--divider-color)); cursor: pointer; padding: 8px 16px; font-size: var(--ha-font-size-m); color: var(--simple-tabs-text-color, var(--secondary-text-color)); position: relative; border-radius: 24px; transition: all 0.3s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .tab-button:hover { border-color: var(--simple-tabs-hover-color, var(--primary-text-color)); color: var(--simple-tabs-hover-color, var(--primary-text-color)); }
    .tab-button.active { border-color: transparent; color: var(--simple-tabs-active-text-color, var(--text-primary-color)); background: var(--simple-tabs-active-bg, var(--primary-color)); }

    .content-container {
        padding-top: 12px;
    }
    
    .tab-panel[hidden] {
      display: none;
    }
  `;
}