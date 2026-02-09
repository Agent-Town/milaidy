/**
 * Game View — embeds a running app's game client in an iframe.
 *
 * Shows a toolbar with the app name, agent connection status, and stop button.
 * The iframe loads the game's viewer URL with embedded/spectator parameters.
 * Supports postMessage auth token passing for games that need it.
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { client } from "./api-client.js";

@customElement("game-view")
export class GameView extends LitElement {
  /** Name of the running app (e.g. "@elizaos/app-2004scape"). */
  @property({ type: String }) appName = "";

  /** Display name shown in the toolbar. */
  @property({ type: String }) displayName = "";

  /** The iframe src URL (already includes embed params). */
  @property({ type: String }) viewerUrl = "";

  /** iframe sandbox attribute. */
  @property({ type: String }) sandbox = "allow-scripts allow-same-origin allow-popups";

  /** Whether the game uses postMessage for auth. */
  @property({ type: Boolean }) postMessageAuth = false;

  /** Auth token to pass via postMessage (if postMessageAuth is true). */
  @property({ type: String }) authToken = "";

  @state() private iframeLoaded = false;
  @state() private stopping = false;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--card);
      flex-shrink: 0;
    }

    .app-name {
      font-weight: 600;
      font-size: 15px;
      color: var(--text-strong, var(--text));
    }

    .status {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 999px;
      background: #dcfce7;
      color: #166534;
    }

    .spacer {
      flex: 1;
    }

    .btn {
      padding: 5px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn:hover {
      background: var(--hover, #f1f5f9);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn.danger {
      color: #dc2626;
      border-color: #dc262644;
    }

    .btn.danger:hover {
      background: #fef2f2;
    }

    .btn.open {
      color: var(--accent, #6366f1);
      border-color: var(--accent, #6366f1);
    }

    .iframe-container {
      flex: 1;
      min-height: 0;
      position: relative;
      background: #000;
    }

    iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    .loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg, #111);
      color: var(--text-muted, #999);
      font-size: 14px;
    }
  `;

  private onIframeLoad = () => {
    this.iframeLoaded = true;

    if (this.postMessageAuth && this.authToken) {
      const iframe = this.shadowRoot?.querySelector("iframe");
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "HYPERSCAPE_AUTH", authToken: this.authToken },
          "*",
        );
      }
    }
  };

  private async handleStop() {
    this.stopping = true;
    await client.stopApp(this.appName).catch(() => {});
    this.dispatchEvent(new CustomEvent("app-stopped", { detail: { name: this.appName } }));
    this.stopping = false;
  }

  private handleOpenExternal() {
    window.open(this.viewerUrl, "_blank", "noopener,noreferrer");
  }

  render() {
    return html`
      <div class="toolbar">
        <span class="app-name">${this.displayName || this.appName}</span>
        <span class="status">Playing</span>
        <span class="spacer"></span>
        <button class="btn open" @click=${this.handleOpenExternal}>Open in Browser</button>
        <button class="btn danger" ?disabled=${this.stopping} @click=${this.handleStop}>
          ${this.stopping ? "Stopping..." : "Stop"}
        </button>
      </div>
      <div class="iframe-container">
        ${!this.iframeLoaded ? html`<div class="loading-overlay">Loading game...</div>` : ""}
        <iframe
          src=${this.viewerUrl}
          sandbox=${this.sandbox}
          allow="autoplay; fullscreen; gamepad"
          @load=${this.onIframeLoad}
        ></iframe>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "game-view": GameView;
  }
}
