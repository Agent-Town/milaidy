/**
 * Apps View — browse and launch agent games and experiences.
 * Apps only, no plugin marketplace. Plugins have their own tab.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { client, type RegistryAppInfo } from "./api-client.js";

const CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  social: "Social",
  platform: "Platform",
  world: "World",
};

@customElement("apps-view")
export class AppsView extends LitElement {
  @state() private apps: RegistryAppInfo[] = [];
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private searchQuery = "";
  @state() private busyApp: string | null = null;

  static styles = css`
    :host {
      display: block;
    }

    .search-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .search-bar input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input-bg, var(--card));
      color: var(--text);
      font-size: 14px;
      outline: none;
    }

    .search-bar input:focus {
      border-color: var(--accent, #6366f1);
    }

    .apps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .app-card {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      background: var(--card);
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: border-color 0.15s;
    }

    .app-card:hover {
      border-color: var(--accent, #6366f1);
    }

    .app-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .app-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: var(--accent, #6366f1);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .app-icon img {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      object-fit: cover;
    }

    .app-title {
      font-weight: 600;
      font-size: 15px;
      color: var(--text-strong, var(--text));
    }

    .app-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      background: #ede9fe;
      color: #5b21b6;
    }

    .app-description {
      font-size: 13px;
      color: var(--text-muted, #64748b);
      line-height: 1.4;
      flex: 1;
    }

    .app-capabilities {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .capability-tag {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--tag-bg, #f8fafc);
      color: var(--tag-text, #64748b);
      border: 1px solid var(--border);
    }

    .app-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }

    .btn {
      padding: 6px 14px;
      border: 1px solid var(--accent, #6366f1);
      border-radius: 6px;
      background: var(--accent, #6366f1);
      color: white;
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn-secondary:hover {
      background: var(--hover, #f1f5f9);
    }

    .empty-state {
      text-align: center;
      padding: 48px 16px;
      color: var(--text-muted, #64748b);
    }

    .empty-state h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text);
    }

    .error-banner {
      padding: 12px 16px;
      border-radius: 8px;
      background: #fef2f2;
      color: #991b1b;
      margin-bottom: 16px;
      font-size: 13px;
    }

    .loading {
      text-align: center;
      padding: 48px;
      color: var(--text-muted, #64748b);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.loadApps();
  }

  private async loadApps() {
    this.loading = true;
    this.error = null;
    const result = await client.listApps().catch((err: Error) => {
      this.error = `Failed to load apps: ${err.message}`;
      return [] as RegistryAppInfo[];
    });
    this.apps = result;
    this.loading = false;
  }

  private async handleSearch(e: InputEvent) {
    const input = e.target as HTMLInputElement;
    this.searchQuery = input.value;
    if (!this.searchQuery.trim()) {
      await this.loadApps();
      return;
    }
    this.loading = true;
    this.apps = await client.searchApps(this.searchQuery).catch(() => [] as RegistryAppInfo[]);
    this.loading = false;
  }

  private async handleLaunch(name: string) {
    this.busyApp = name;
    this.error = null;

    const result = await client.launchApp(name).catch((err: Error) => {
      this.error = `Launch failed: ${err.message}`;
      return null;
    });

    if (result) {
      this.dispatchEvent(new CustomEvent("app-launched", {
        bubbles: true,
        composed: true,
        detail: {
          name,
          displayName: result.displayName,
          viewer: result.viewer,
          needsRestart: result.needsRestart,
        },
      }));
    }

    this.busyApp = null;
  }

  private renderAppCard(app: RegistryAppInfo) {
    const isBusy = this.busyApp === app.name;
    const initial = app.displayName.charAt(0).toUpperCase();

    return html`
      <div class="app-card">
        <div class="app-header">
          <div class="app-icon">
            ${app.icon ? html`<img src="${app.icon}" alt="${app.displayName}" />` : initial}
          </div>
          <div>
            <div class="app-title">${app.displayName}</div>
            <div class="app-meta">
              <span class="badge">${CATEGORY_LABELS[app.category] ?? app.category}</span>
            </div>
          </div>
        </div>
        <div class="app-description">${app.description || "No description."}</div>
        ${app.capabilities.length > 0 ? html`
          <div class="app-capabilities">
            ${app.capabilities.slice(0, 6).map((c) => html`<span class="capability-tag">${c}</span>`)}
          </div>
        ` : ""}
        <div class="app-footer">
          <button class="btn" ?disabled=${isBusy} @click=${() => this.handleLaunch(app.name)}>
            ${isBusy ? "Starting..." : "Play"}
          </button>
        </div>
      </div>
    `;
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">Loading apps...</div>`;
    }

    return html`
      ${this.error ? html`<div class="error-banner">${this.error}</div>` : ""}

      <div class="search-bar">
        <input
          type="text"
          placeholder="Search apps..."
          .value=${this.searchQuery}
          @input=${this.handleSearch}
        />
        <button class="btn-secondary" @click=${() => this.loadApps()}>Refresh</button>
      </div>

      ${this.apps.length === 0 ? html`
        <div class="empty-state">
          <h3>No apps found</h3>
          <p>${this.searchQuery ? "Try a different search." : "Apps will appear here once registered."}</p>
        </div>
      ` : html`
        <div class="apps-grid">
          ${this.apps.map((app) => this.renderAppCard(app))}
        </div>
      `}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "apps-view": AppsView;
  }
}
