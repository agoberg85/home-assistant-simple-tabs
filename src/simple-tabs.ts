import './simple-tabs-editor';
import { LitElement, html, css, TemplateResult, PropertyValues } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from 'custom-card-helpers';
import { forwardHaptic } from 'custom-card-helpers';

// --- CONFIG CHECKER ---
function configChanged(oldConfig: TabsCardConfig | undefined, newConfig: TabsCardConfig): boolean {
  if (!oldConfig) return true;
  if (oldConfig.tabs.length !== newConfig.tabs.length) return true;
  if (oldConfig.hide_inactive_tab_titles !== newConfig.hide_inactive_tab_titles) return true;
  if (oldConfig.show_fade !== newConfig.show_fade) return true;
  if (JSON.stringify(oldConfig.default_tab) !== JSON.stringify(newConfig.default_tab)) return true;

  return oldConfig.tabs.some((tab, index) => {
    const newTab = newConfig.tabs[index];
    if (!newTab) return true;
    return tab.title !== newTab.title ||
      tab.icon !== newTab.icon ||
      tab.id !== newTab.id ||
      tab.badge !== newTab.badge ||
      JSON.stringify('card' in tab ? tab.card : undefined) !== JSON.stringify('card' in newTab ? newTab.card : undefined) ||
      JSON.stringify('cards' in tab ? tab.cards : undefined) !== JSON.stringify('cards' in newTab ? newTab.cards : undefined) ||
      JSON.stringify(tab.conditions) !== JSON.stringify(newTab.conditions);
  });
}

// --- INTERFACES ---
export interface StateCondition { entity: string; state: string; }
export interface TemplateCondition { template: string; }
export interface UserCondition { user: string | string[]; }
export type Condition = StateCondition | TemplateCondition | UserCondition;

// Base properties shared by both tab formats
interface TabConfigBase {
  title: string;
  icon?: string;
  id?: string;
  badge?: string;
  conditions?: Condition[];
}

// Legacy format: single card (backward compatible)
export interface TabConfigSingleCard extends TabConfigBase {
  card: LovelaceCardConfig;
  cards?: never;  // Ensure cards is not present
}

// New format: multiple cards with visual editor
export interface TabConfigMultiCard extends TabConfigBase {
  cards: LovelaceCardConfig[];
  card?: never;  // Ensure card is not present
}

// Union type to support both formats
export type TabConfig = TabConfigSingleCard | TabConfigMultiCard;

export interface DefaultTabRule {
  tab: number;
  conditions?: Condition[];
}

export interface TabsCardConfig {
  type: string;
  tabs: TabConfig[];
  default_tab?: number | DefaultTabRule[];
  hide_inactive_tab_titles?: boolean;
  show_fade?: boolean;
  'pre-load'?: boolean;
  alignment?: 'start' | 'center' | 'end';
  'background-color'?: string;
  'border-color'?: string;
  'text-color'?: string;
  'hover-color'?: string;
  'active-text-color'?: string;
  'active-background'?: string;
  margin?: string;
  'margin-bottom'?: string;
  container_background?: string;
  container_padding?: string;
  container_rounding?: string;
  tabs_gap?: string;
  button_padding?: string;
  tab_position?: 'top' | 'bottom';
  enable_swipe?: boolean;
  swipe_animation?: boolean;
  swipe_threshold?: number;
  remember_tab?: boolean | 'per_device';
  haptic_feedback?: boolean;
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
  @state() private _prevSelectedTabIndex = 0;
  @state() private _transitionDirection: 'left' | 'right' | 'none' = 'none';

  // OPTIMIZATION: Store visibility as a simple array
  @state() private _tabVisibility: boolean[] = [];

  // OPTIMIZATION: Memoized visible indices to avoid map/filter in render
  @state() private _visibleIndices: number[] = [];

  @state() private _renderedTitles: (string | undefined)[] = [];
  @state() private _renderedIcons: (string | undefined)[] = [];
  @state() private _renderedBadges: (boolean | undefined)[] = [];

  @query('.tabs') private _tabsEl?: HTMLDivElement;
  @query('.content-container') private _contentEl?: HTMLDivElement;

  private _helpers?: any;
  private _helpersPromise?: Promise<void>;
  private _templateUnsubscribers: (() => void)[] = [];
  private _disconnectCleanupTimeout?: number;
  private _hassSet = false;
  private _initialized = false;
  private _lastCheckedUrl = '';
  // Swipe gesture tracking
  private _touchStartX = 0;
  private _touchStartY = 0;
  private _touchStartTime = 0;
  private _isSwiping = false;
  private _blockSwipeForGesture = false;

  static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('simple-tabs-editor') as LovelaceCardEditor;
  }

  static getStubConfig(): Record<string, unknown> {
    return {
      type: 'custom:simple-tabs',
      tabs: [
        { title: 'Tab 1', icon: 'mdi:home', id: 'tab1', card: { type: 'markdown', content: 'Content 1' } },
        { title: 'Tab 2', icon: 'mdi:cog', id: 'tab2', card: { type: 'markdown', content: 'Content 2' } },
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
          console.error('[Simple Tabs] Helpers error:', e);
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
    window.addEventListener('resize', this._handleResize, { passive: true });
    window.addEventListener('hashchange', this._handleDeepLink, { passive: true });
    window.addEventListener('popstate', this._handleDeepLink, { passive: true });
    window.addEventListener('location-changed', this._handleDeepLink, { passive: true });

    // Immediate check
    this._handleDeepLink();
  }

  public async disconnectedCallback(): Promise<void> {
    super.disconnectedCallback();
    window.removeEventListener('resize', this._handleResize);
    window.removeEventListener('hashchange', this._handleDeepLink);
    window.removeEventListener('popstate', this._handleDeepLink);
    window.removeEventListener('location-changed', this._handleDeepLink);
    this._disconnectCleanupTimeout = window.setTimeout(() => {
      if (!this.isConnected) this._unsubscribeTemplates();
    }, 0);
  }

  // Throttled resize handler
  private _handleResize = (): void => {
    requestAnimationFrame(() => this._updateOverflowState());
  };

  private _handleDeepLink = (): void => {
    // Use requestAnimationFrame to avoid blocking main thread during load
    requestAnimationFrame(() => this._checkDeepLink());
  }

  private _triggerHaptic(): void {
    if (!this._config?.haptic_feedback) return;

    // Home Assistant listens for this event to provide platform-native haptics,
    // including iOS environments where navigator.vibrate is typically unavailable.
    forwardHaptic('selection');

    if ('vibrate' in navigator) {
      navigator.vibrate(10); // Light 10ms tap
    }
  }

  private _getConfigFingerprint(): string {
    if (!this._config?.tabs?.length) {
      return 'default';
    }

    // Build a stable key from user-defined tab metadata instead of a random instance id.
    const keySource = JSON.stringify(
      this._config.tabs.map((tab, index) => ({
        index,
        id: tab.id ?? '',
        title: tab.title ?? '',
        icon: tab.icon ?? '',
      }))
    );

    let hash = 0;
    for (let i = 0; i < keySource.length; i += 1) {
      hash = ((hash << 5) - hash + keySource.charCodeAt(i)) | 0;
    }

    return Math.abs(hash).toString(36);
  }

  private _getStorageKey(): string {
    const base = `simple-tabs-${this._getConfigFingerprint()}-last-tab`;
    if (this._config?.remember_tab === 'per_device') {
      // Include user agent or device info for per-device memory
      const deviceId = btoa(navigator.userAgent).substring(0, 10);
      return `${base}-${deviceId}`;
    }
    return base;
  }

  private _saveTabToMemory(index: number): void {
    if (!this._config?.remember_tab) return;
    try {
      localStorage.setItem(this._getStorageKey(), String(index));
    } catch (e) {
      console.error('[Simple Tabs] Failed to save tab memory:', e);
    }
  }

  private _loadTabFromMemory(): number | null {
    if (!this._config?.remember_tab) return null;
    try {
      const stored = localStorage.getItem(this._getStorageKey());
      if (stored !== null) {
        const index = parseInt(stored, 10);
        if (!isNaN(index) && index >= 0 && index < this._config.tabs.length) {
          return index;
        }
      }
    } catch (e) {
      console.error('[Simple Tabs] Failed to load tab memory:', e);
    }
    return null;
  }

  private _isFormControl(target: HTMLElement): boolean {
    const tagName = target.tagName.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target.isContentEditable
    );
  }

  private _hasHorizontalScroll(target: HTMLElement): boolean {
    const style = window.getComputedStyle(target);
    const overflowX = style.overflowX;
    const canOverflow =
      overflowX === 'auto' ||
      overflowX === 'scroll' ||
      overflowX === 'overlay' ||
      (overflowX === 'hidden' && target.scrollWidth > target.clientWidth + 1);

    return canOverflow && target.scrollWidth > target.clientWidth + 1;
  }

  private _canTargetConsumeHorizontalSwipe(target: HTMLElement, deltaX: number): boolean {
    if (!this._hasHorizontalScroll(target)) return false;

    const maxScrollLeft = target.scrollWidth - target.clientWidth;
    if (maxScrollLeft <= 0) return false;

    const scrollBuffer = 1;

    // Finger moving left means nested content would need room to scroll right.
    if (deltaX < 0) {
      return target.scrollLeft < maxScrollLeft - scrollBuffer;
    }

    if (deltaX > 0) {
      return target.scrollLeft > scrollBuffer;
    }

    return false;
  }

  private _shouldAlwaysBlockSwipe(e: TouchEvent): boolean {
    const path = e.composedPath();

    for (const target of path) {
      if (!(target instanceof HTMLElement)) continue;

      // Stop traversing if we reach the content container itself
      if (target === this._contentEl) break;

      const tagName = target.tagName.toLowerCase();
      const classList = target.classList;

      if (
        this._isFormControl(target) ||
        tagName === 'ha-slider' ||
        tagName === 'mwc-slider' ||
        classList.contains('slider') ||
        classList.contains('swiper') ||
        target.hasAttribute('data-no-swipe')
      ) {
        return true;
      }
    }
    return false;
  }

  private _shouldYieldToNestedHorizontalScroll(e: TouchEvent, deltaX: number): boolean {
    const path = e.composedPath();

    for (const target of path) {
      if (!(target instanceof HTMLElement)) continue;

      if (target === this._contentEl) break;

      if (this._canTargetConsumeHorizontalSwipe(target, deltaX)) {
        return true;
      }
    }

    return false;
  }

  private _unsubscribeTemplates(): void {
    this._templateUnsubscribers.forEach(unsubscriber => unsubscriber?.());
    this._templateUnsubscribers = [];
  }

  public async setConfig(config: TabsCardConfig): Promise<void> {
    if (!config || !config.tabs) throw new Error('Invalid configuration');

    if (!configChanged(this._config, config)) return;

    this._loadHelpers();
    this._unsubscribeTemplates();

    this._config = {
      alignment: 'center',
      'pre-load': false,
      tab_position: 'top',
      enable_swipe: true,
      swipe_animation: true,
      swipe_threshold: 50,
      remember_tab: false,
      haptic_feedback: false,
      ...config
    };

    // Initialize Arrays
    const len = config.tabs.length;
    this._cards = new Array(len).fill(null);
    this._tabVisibility = new Array(len).fill(true);
    this._renderedTitles = config.tabs.map(tab => tab.title);
    this._renderedIcons = config.tabs.map(tab => tab.icon);
    this._renderedBadges = new Array(len).fill(false);
    this._visibleIndices = config.tabs.map((_, i) => i); // Assume all visible initially

    this._initialized = false;

    if (this._hassSet) {
      this._subscribeToTemplates(this._config.tabs);
    }

    if (this._config['pre-load']) {
      this._createCards(this._config.tabs).then(cards => { this._cards = cards; });
    }
  }

  private _isTemplate(value: unknown): boolean {
    return typeof value === 'string' && (value.includes('{{') || value.includes('{%'));
  }

  private async _subscribeToTemplates(tabs: TabConfig[]): Promise<void> {
    const renderTemplate = async (template: string, callback: (result: any) => void) => {
      try {
        const unsub = await this.hass.connection.subscribeMessage(callback, { type: 'render_template', template });
        this._templateUnsubscribers.push(unsub);
      } catch (e) {
        console.error("[Simple Tabs] Template error:", e);
      }
    };

    // Batch promises for performance
    const promises: Promise<void>[] = [];

    tabs.forEach((tab, index) => {
      // Helper for state updates
      const updateState = (key: '_renderedTitles' | '_renderedIcons' | '_renderedBadges', value: any) => {
        if (this[key][index] !== value) {
          const newArray = [...this[key]];
          newArray[index] = value;
          this[key] = newArray as any; // Trigger update
        }
      };

      if (this._isTemplate(tab.title)) {
        promises.push(renderTemplate(tab.title, msg => updateState('_renderedTitles', msg.result)));
      }
      if (this._isTemplate(tab.icon)) {
        promises.push(renderTemplate(tab.icon as string, msg => updateState('_renderedIcons', msg.result)));
      }

      if (tab.badge) {
        if (this._isTemplate(tab.badge)) {
          promises.push(renderTemplate(tab.badge, msg => {
            const res = msg.result;
            const isVisible = (res === true || res === 'on' || res === 'true' || (typeof res === 'number' && res > 0));
            updateState('_renderedBadges', isVisible);
          }));
        } else {
          const res = tab.badge;
          const isVisible = (res === 'true' || res === 'on');
          if (this._renderedBadges[index] !== isVisible) {
            const next = [...this._renderedBadges];
            next[index] = isVisible;
            this._renderedBadges = next;
          }
        }
      }

      tab.conditions?.forEach(cond => {
        if ('template' in cond) {
          promises.push(renderTemplate(cond.template, msg => {
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
    });

    await Promise.all(promises);
  }

  // OPTIMIZATION: Critical lifecycle method to prevent pops
  // Calculations done here do NOT trigger a re-render, they happen before paint
  protected willUpdate(changedProps: PropertyValues): void {

    // 1. Recalculate visibility if dependencies change
    if (changedProps.has('_tabVisibility') || changedProps.has('hass') || changedProps.has('_config')) {
      this._calculateVisibleIndices();
    }

    // 2. Ensure selected tab is valid (Auto-select first visible if current is hidden)
    if (this._visibleIndices.length > 0) {
      if (!this._visibleIndices.includes(this._selectedTabIndex)) {
        // Silently switch to the first available tab
        this._selectedTabIndex = this._visibleIndices[0];
      }
    }
  }

  private _calculateVisibleIndices(): void {
    if (!this._config) return;
    const newIndices = this._config.tabs
      .map((_, i) => i)
      .filter(i => {
        const tab = this._config.tabs[i];
        // Quick check for simple conditions (cached results)
        if (tab.conditions) {
          return tab.conditions.every(c => {
            if ('template' in c) return this._tabVisibility[i];
            return this._checkCondition(c);
          });
        }
        return true;
      });

    // Only update if actually different (array comparison)
    if (newIndices.length !== this._visibleIndices.length ||
      !newIndices.every((val, index) => val === this._visibleIndices[index])) {
      this._visibleIndices = newIndices;
    }
  }

  protected shouldUpdate(changedProps: Map<string | symbol, unknown>): boolean {
    if (changedProps.has('_config') ||
      changedProps.has('_selectedTabIndex') ||
      changedProps.has('_visibleIndices') || // Use the computed indices
      changedProps.has('_renderedTitles') ||
      changedProps.has('_renderedIcons') ||
      changedProps.has('_renderedBadges')) {
      return true;
    }

    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
    if (!oldHass || !this.hass) return true;

    // Fast HASS update check
    return (
      oldHass.states !== this.hass.states ||
      oldHass.localize !== this.hass.localize ||
      oldHass.user !== this.hass.user
    );
  }

  private _checkCondition(c: Condition): boolean {
    if ('entity' in c) {
      return this.hass.states[c.entity]?.state === c.state;
    }
    // Templates handled via subscriptions, User handled here
    if ('user' in c) {
      if (!this.hass.user) return false;
      const allowed = Array.isArray(c.user) ? c.user : [c.user];
      return allowed.includes(this.hass.user.id) || allowed.includes(this.hass.user.name);
    }
    return false;
  }

  private _calculateDefaultTab(): number {
    if (this._config.default_tab === undefined) return 0;

    if (typeof this._config.default_tab === 'number') {
      const idx = this._config.default_tab - 1;
      return (idx >= 0 && idx < this._config.tabs.length) ? idx : 0;
    }

    if (Array.isArray(this._config.default_tab)) {
      for (const rule of this._config.default_tab) {
        const index = rule.tab - 1;
        if (index < 0 || index >= this._config.tabs.length) continue;
        if (!rule.conditions || rule.conditions.length === 0) return index;

        const allMet = rule.conditions.every(c => this._checkCondition(c));
        if (allMet) return index;
      }
    }
    return 0;
  }

  private _checkDeepLink(): boolean {
    if (!this._config || !this._config.tabs) return false;

    this._lastCheckedUrl = window.location.href;
    let targetId: string | null = null;
    let isFromQuery = false;

    const url = new URL(window.location.href);
    if (url.searchParams.has('tab')) {
      targetId = url.searchParams.get('tab');
      isFromQuery = true;
    } else {
      const hash = window.location.hash.substring(1);
      if (hash) targetId = hash;
    }

    if (!targetId) return false;

    const foundIndex = this._config.tabs.findIndex(tab => {
      if (tab.id === targetId) return true;
      if (!tab.id && tab.title && !this._isTemplate(tab.title)) {
        const slug = tab.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (slug === targetId) return true;
      }
      return false;
    });

    if (foundIndex >= 0 && foundIndex !== this._selectedTabIndex) {
      // Use visibleIndices to check visibility efficiently
      this._calculateVisibleIndices();
      if (this._visibleIndices.includes(foundIndex)) {
        this._selectedTabIndex = foundIndex;
        if (isFromQuery) {
          url.searchParams.delete('tab');
          window.history.replaceState(null, '', url.toString());
          this._lastCheckedUrl = url.toString();
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Normalizes tab card config to handle both single card and multi-card formats
   * Legacy: { card: {...} } - returns card as-is
   * New: { cards: [{...}, {...}] } - wraps in vertical-stack
   */
  private _normalizeTabCard(tab: TabConfig): LovelaceCardConfig {
    // New multi-card format
    if ('cards' in tab && Array.isArray(tab.cards)) {
      return {
        type: 'grid',
        columns: 1,
        square: false,
        cards: tab.cards
      };
    }

    // Legacy single card format (backward compatible)
    if ('card' in tab && tab.card !== undefined) {
      return tab.card;
    }

    // Fallback (shouldn't happen with proper types)
    throw new Error('[Simple Tabs] Invalid tab configuration: must have either "card" or "cards" property');
  }

  private async _createCard(tabConfig: TabConfig): Promise<LovelaceCard | null> {
    try {
      await this._loadHelpers();
      const normalizedCard = this._normalizeTabCard(tabConfig);
      const element = this._helpers.createCardElement(normalizedCard) as LovelaceCard;
      element.hass = this.hass;
      return element;
    } catch (e) {
      console.error('[Simple Tabs] Create card error:', e);
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

      // Only toggle if class is missing to avoid style recalc
      if (containerWrapper.classList.contains('can-scroll-left') !== canScrollLeft) {
        containerWrapper.classList.toggle('can-scroll-left', canScrollLeft);
      }
      if (containerWrapper.classList.contains('can-scroll-right') !== canScrollRight) {
        containerWrapper.classList.toggle('can-scroll-right', canScrollRight);
      }
    }
  }

  private async _createCards(tabConfigs: TabConfig[]): Promise<(LovelaceCard | null)[]> {
    await this._loadHelpers();
    return Promise.all(tabConfigs.map(tab => this._createCard(tab)));
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (changedProps.has('_config')) {
      const marginBottom = this._config['margin-bottom'] ?? '0px';
      this.style.setProperty('--simple-tabs-margin-bottom', marginBottom);
    }

    if (this.hass && this._config && !this._hassSet) {
      this._hassSet = true;
      this._subscribeToTemplates(this._config.tabs);
    }

    if (window.location.href !== this._lastCheckedUrl) {
      const deepLinkSuccess = this._checkDeepLink();
      if (!this._initialized && !deepLinkSuccess) {
        // Priority: dynamic default > remembered tab > first tab
        const dynamicDefault = this._calculateDefaultTab();
        const remembered = this._loadTabFromMemory();

        if (dynamicDefault !== 0) {
          // Dynamic default takes priority
          this._selectedTabIndex = dynamicDefault;
        } else if (remembered !== null) {
          // Use remembered tab if no dynamic default
          this._selectedTabIndex = remembered;
        } else {
          // Fallback to first tab
          this._selectedTabIndex = 0;
        }
      }
      this._initialized = true;
    } else if (!this._initialized) {
      // Priority: dynamic default > remembered tab > first tab
      const dynamicDefault = this._calculateDefaultTab();
      const remembered = this._loadTabFromMemory();

      if (dynamicDefault !== 0) {
        this._selectedTabIndex = dynamicDefault;
      } else if (remembered !== null) {
        this._selectedTabIndex = remembered;
      } else {
        this._selectedTabIndex = 0;
      }
      this._initialized = true;
    }

    if (changedProps.has('hass')) {
      const len = this._cards.length;
      for (let i = 0; i < len; i++) {
        const card = this._cards[i];
        if (card) card.hass = this.hass;
      }
    }

    if (changedProps.has('_selectedTabIndex') && !this._config['pre-load']) {
      this._ensureCard(this._selectedTabIndex);
    }

    if (changedProps.has('_selectedTabIndex')) {
      this._scrollToActiveTab();
    }

    if (changedProps.has('_config') || changedProps.has('_visibleIndices')) {
      requestAnimationFrame(() => this._updateOverflowState());
    }
  }

  public firstUpdated(): void {
    requestAnimationFrame(() => this._scrollToActiveTab(false));

    if (!this._config['pre-load']) {
      // Slightly increased delay to prioritize initial render paint
      setTimeout(() => this._startBackgroundCardLoading(), 200);
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
      // Use IdleCallback if available for better performance
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          this._ensureCard(indexToLoad).then(() => loadNext());
        });
      } else {
        setTimeout(() => {
          this._ensureCard(indexToLoad).then(() => loadNext());
        }, 50);
      }
    };
    loadNext();
  }

  private _handleDragStart(e: MouseEvent): void {
    const tabsEl = this._tabsEl;
    if (!tabsEl || e.button !== 0) return;

    let isDragging = false;
    const startX = e.pageX;
    const scrollLeft = tabsEl.scrollLeft;

    const handleDragMove = (em: MouseEvent): void => {
      const walk = em.pageX - startX;
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

  private _handleTouchStart = (e: TouchEvent): void => {
    if (!this._config?.enable_swipe) return;

    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this._touchStartTime = Date.now();
    this._isSwiping = false;
    this._blockSwipeForGesture = this._shouldAlwaysBlockSwipe(e);
  };

  private _handleTouchMove = (e: TouchEvent): void => {
    if (!this._config?.enable_swipe || !this._touchStartX) return;
    if (this._blockSwipeForGesture) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - this._touchStartX;
    const deltaY = touch.clientY - this._touchStartY;

    // Detect swipe intent: horizontal movement must dominate
    if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > 10) {
      if (this._shouldYieldToNestedHorizontalScroll(e, deltaX)) {
        return;
      }

      this._isSwiping = true;
      // Prevent scroll when swiping horizontally
      e.preventDefault();
    }
  };

  private _handleTouchEnd = (e: TouchEvent): void => {
    if (!this._config?.enable_swipe || !this._touchStartX || !this._isSwiping) {
      this._touchStartX = 0;
      this._touchStartY = 0;
      this._isSwiping = false;
      this._blockSwipeForGesture = false;
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this._touchStartX;
    const deltaY = touch.clientY - this._touchStartY;
    const deltaTime = Date.now() - this._touchStartTime;
    const threshold = this._config.swipe_threshold ?? 50;

    // Reset tracking
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._isSwiping = false;
    this._blockSwipeForGesture = false;

    // Check if swipe meets criteria
    if (Math.abs(deltaX) < threshold || deltaTime > 500) return;
    if (Math.abs(deltaY) > Math.abs(deltaX) / 2) return; // Too much vertical movement

    const currentIndex = this._visibleIndices.indexOf(this._selectedTabIndex);
    if (currentIndex === -1) return;

    let newIndex = currentIndex;
    if (deltaX < 0 && currentIndex < this._visibleIndices.length - 1) {
      // Swipe left: next tab
      newIndex = currentIndex + 1;
    } else if (deltaX > 0 && currentIndex > 0) {
      // Swipe right: previous tab
      newIndex = currentIndex - 1;
    }

    if (newIndex !== currentIndex) {
      this._selectTab(this._visibleIndices[newIndex], true); // User-initiated
    }
  };

  private _selectTab(index: number, userInitiated = false): void {
    if (index === this._selectedTabIndex) return;

    // Calculate direction
    // If wrapping support is added later, logic needs update. For now simple index comparison.
    // RTL support might invert this logic visually.
    const direction = index > this._selectedTabIndex ? 'right' : 'left';

    this._prevSelectedTabIndex = this._selectedTabIndex;
    this._selectedTabIndex = index;
    this._transitionDirection = direction;

    // Reset transition direction after animation to prevent sticking
    // We use a timeout slightly longer than CSS transition (300ms)
    setTimeout(() => {
      this._transitionDirection = 'none';
      this._prevSelectedTabIndex = index; // Ensure we don't keep old tab in DOM forever
    }, 350);

    this._saveTabToMemory(index);
    if (userInitiated) {
      this._triggerHaptic();
    }
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) return html``;

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
      '--simple-tabs-inactive-title-display': this._config.hide_inactive_tab_titles ? 'none' : 'inline',
      '--simple-tabs-gap': this._config.tabs_gap,
      '--simple-tabs-button-padding': this._config.button_padding,
      // Note: --simple-tabs-margin-bottom is NOT here anymore, it's in updated()
    };

    if (this._config.margin) {
      styles.margin = this._config.margin;
    }

    const alignmentClass = `align-${this._config.alignment || 'center'}`;

    // Logic for Fade Effect (using masks now)
    const showFade = this._config.show_fade ?? true;
    const fadeClass = showFade ? 'enable-fade' : '';
    const positionClass = this._config.tab_position === 'bottom' ? 'position-bottom' : 'position-top';

    const tabsSection = html`
      <div class="tabs-container ${alignmentClass} ${fadeClass}">
        <div class="tabs" role="tablist" @scroll=${this._updateOverflowState} @mousedown=${this._handleDragStart}>
          ${this._visibleIndices.map(originalIndex => html`
            <button
              class="tab-button ${originalIndex === this._selectedTabIndex ? 'active' : ''}"
              @click=${() => this._selectTab(originalIndex, true)}
            >
              ${this._renderedIcons[originalIndex] ? html`<ha-icon .icon=${this._renderedIcons[originalIndex]}></ha-icon>` : ''}
              ${this._renderedTitles[originalIndex] ? html`<span>${this._renderedTitles[originalIndex]}</span>` : ''}
              ${this._renderedBadges[originalIndex] ? html`<span class="badge"></span>` : ''}
            </button>`
    )}
        </div>
      </div>
    `;

    const animateClass = this._config.swipe_animation ? 'animate' : '';
    const transitioningClass =
      this._config.swipe_animation && this._transitionDirection !== 'none'
        ? 'is-transitioning'
        : '';

    const contentSection = html`
      <div 
        class="content-container ${animateClass} ${transitioningClass}" 
        @touchstart=${this._handleTouchStart}
        @touchmove=${this._handleTouchMove}
        @touchend=${this._handleTouchEnd}
      >
         ${this._cards.map((card, index) => {
      const isSelected = index === this._selectedTabIndex;
      const isPrevious = index === this._prevSelectedTabIndex && this._transitionDirection !== 'none';
      const isHidden = !isSelected && !isPrevious;

      let className = 'tab-panel';
      if (isSelected) className += ' active';
      if (isPrevious) className += ' previous';
      if (this._transitionDirection !== 'none') {
        className += ` slide-${this._transitionDirection}`;
      }

      return html`
               <div class="${className}" ?hidden=${isHidden}>
                  ${isSelected || isPrevious ? card : ''}
               </div>
             `;
    })}
      </div>
    `;

    return html`
      <div class="card-container ${positionClass}" style=${styleMap(styles)}>
        ${this._config.tab_position === 'bottom' ? html`${contentSection}${tabsSection}` : html`${tabsSection}${contentSection}`}
      </div>
    `;
  }

  static styles = css`
    :host { 
      display: block; 
      /* Use 'style' containment only - 'content' or 'layout' containment breaks
         nested cards (e.g. simple-swipe-card) that rely on ResizeObserver/auto-height */
      contain: style; 
      margin-bottom: var(--simple-tabs-margin-bottom);
    }
    .card-container {
      position: relative;
      isolation: isolate;
      background: var(--simple-tabs-container-bg, none);
      padding: var(--simple-tabs-container-padding, 0 0 12px 0);
      border-radius: var(--simple-tabs-container-rounding, 0);
      min-height: 50px; 
      /* overflow: visible allows nested cards (e.g. simple-swipe-card) to
         expand to their natural height without being clipped */
      overflow: visible;
    }


    .tabs-container {
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
      width: 100%;
      padding: 0px 2px;
      transform: translate3d(0,0,0);
      
      /* MASKING LOGIC FOR FADE EFFECT */
      /* Default: No mask (fully visible) */
      -webkit-mask-image: none;
      mask-image: none;
      transition: -webkit-mask-image 0.3s ease, mask-image 0.3s ease;
    }

    /* Only apply masks if fade is enabled and scroll is needed */
    .tabs-container.enable-fade.can-scroll-left {
      -webkit-mask-image: linear-gradient(to right, transparent, black 100px);
      mask-image: linear-gradient(to right, transparent, black 100px);
    }

    .tabs-container.enable-fade.can-scroll-right {
      -webkit-mask-image: linear-gradient(to left, transparent, black 100px);
      mask-image: linear-gradient(to left, transparent, black 100px);
    }

    .tabs-container.enable-fade.can-scroll-left.can-scroll-right {
      -webkit-mask-image: linear-gradient(to right, transparent, black 100px, black calc(100% - 100px), transparent);
      mask-image: linear-gradient(to right, transparent, black 100px, black calc(100% - 100px), transparent);
    }    
    
    .tabs { 
      display: flex; 
      flex-wrap: nowrap; 
      gap: var(--simple-tabs-gap, 6px); 
      overflow-x: auto;
      overflow-y: hidden;
      padding: 1px;
      background: transparent;
      border-radius: 0;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -ms-overflow-style: none;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      width: fit-content; 
      max-width: 100%;
    }
    
    .tabs.dragging { cursor: grabbing; }
    .tabs.dragging .tab-button { pointer-events: none; }
    .tabs::-webkit-scrollbar { display: none; }
    
    /* Alignment for tabs within the wide container */
    .tabs-container.align-start .tabs { 
      justify-content: flex-start; 
    }
    .tabs-container.align-center .tabs { 
      margin: 0 auto; 
    }
    .tabs-container.align-end {
      display: flex;
      justify-content: flex-end;
    }
    .tabs-container.align-end .tabs { 
      justify-content: flex-end;
    }
    
    .tab-button { 
      box-sizing: border-box; 
      background: var(--simple-tabs-bg-color, none); 
      outline: 1px solid var(--simple-tabs-border-color, var(--divider-color)); 
      border: none; 
      cursor: pointer; 
      padding: var(--simple-tabs-button-padding, 8px 16px);
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

    .tab-button:not(.active) span:not(.badge) {
        display: var(--simple-tabs-inactive-title-display, inline);
    }
    
    .badge {
        position: absolute;
        top: -1px;
        right: 0px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: var(--error-color, #db4437);
        pointer-events: none;
    }

    .tab-button:hover { 
      color: var(--simple-tabs-hover-color, var(--primary-text-color));
      outline-color: var(--simple-tabs-hover-color, var(--primary-text-color));
    }
    .tab-button.active { 
      color: var(--simple-tabs-active-text-color, var(--text-primary-color)); 
      background: var(--simple-tabs-active-bg, var(--primary-color)); 
      outline-color: transparent; 
    }
    
    /* Content Container Styles */
    .content-container { 
      padding-top: 12px;
      position: relative;
      /* overflow: visible allows nested cards (e.g. simple-swipe-card) to 
         expand to their natural height without being clipped */
      overflow: visible;
      min-width: 0;
      touch-action: pan-y; /* Allow vertical scrolling, we handle horizontal */
    }
    
    .position-bottom .content-container {
      padding-top: 0;
      padding-bottom: 12px;
    }
    
    .tab-panel { 
      position: relative;
    }
    
    .tab-panel[hidden] { 
      display: none; 
    }

    /* ANIMATIONS */
    .content-container.animate {
        display: grid;
        grid-template-areas: "content";
        /* Keep overflow visible in resting state to avoid clipping wide nested cards
           (e.g. map-card/simple-swipe-card in Sections one-column layouts). */
        overflow: visible;
    }

    .content-container.animate.is-transitioning {
        /* Only clip horizontal overflow while tab panels actively slide. */
        overflow-x: hidden;
        overflow-y: visible;
    }

    .content-container.animate .tab-panel {
        grid-area: content;
        width: 100%;
        min-width: 0;
        display: block; /* Override hidden behavior for transition */
    }
    
    .content-container.animate .tab-panel[hidden] {
        display: none;
    }
    
    /* Ensure previous tabs allow display during animation even if hidden attr isn't removed yet (though logic handles it) */
    .content-container.animate .tab-panel.previous {
        display: block;
        visibility: visible;
        pointer-events: none; /* Prevent clicks on outgoing tab */
    }

    /* SLIDE ANIMATIONS */
    /* Moving to a tab on the RIGHT (Index increases): content slides LEFT */
    .tab-panel.active.slide-right {
        animation: slide-in-from-right 0.3s ease-in-out forwards;
    }
    .tab-panel.previous.slide-right {
        animation: slide-out-to-left 0.3s ease-in-out forwards;
    }

    /* Moving to a tab on the LEFT (Index decreases): content slides RIGHT */
    .tab-panel.active.slide-left {
        animation: slide-in-from-left 0.3s ease-in-out forwards;
    }
    .tab-panel.previous.slide-left {
        animation: slide-out-to-right 0.3s ease-in-out forwards;
    }
    
    @keyframes slide-in-from-right {
        0% { transform: translateX(100%); opacity: 0; }
        100% { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slide-out-to-left {
        0% { transform: translateX(0); opacity: 1; }
        100% { transform: translateX(-100%); opacity: 0; }
    }
    
    @keyframes slide-in-from-left {
        0% { transform: translateX(-100%); opacity: 0; }
        100% { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slide-out-to-right {
        0% { transform: translateX(0); opacity: 1; }
        100% { transform: translateX(100%); opacity: 0; }
    }
    
    @media (prefers-reduced-motion) {
        .tab-panel.active.slide-right,
        .tab-panel.previous.slide-right,
        .tab-panel.active.slide-left,
        .tab-panel.previous.slide-left {
            animation: none;
            transform: none;
            opacity: 1;
        }
    }
  `;
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "simple-tabs",
  name: "Simple Tabs",
  preview: true,
  description: "A card to display multiple cards in a tabbed interface."
});
