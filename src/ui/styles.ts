export const styles = `
:host {
  --bc-bg: #ffffff;
  --bc-text: #1a1a2e;
  --bc-text-secondary: #6b7280;
  --bc-border: #e5e7eb;
  --bc-primary: #f7931a;
  --bc-primary-hover: #e8850f;
  --bc-primary-text: #ffffff;
  --bc-success: #22c55e;
  --bc-success-bg: #f0fdf4;
  --bc-error: #ef4444;
  --bc-error-bg: #fef2f2;
  --bc-radius: 8px;
  --bc-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  display: block;
  font-family: var(--bc-font);
  color: var(--bc-text);
}

@media (prefers-color-scheme: dark) {
  :host(.bc-theme-auto) {
    --bc-bg: #1a1a2e;
    --bc-text: #e5e7eb;
    --bc-text-secondary: #9ca3af;
    --bc-border: #374151;
    --bc-success-bg: #052e16;
    --bc-error-bg: #450a0a;
  }
}

:host(.bc-theme-dark) {
  --bc-bg: #1a1a2e;
  --bc-text: #e5e7eb;
  --bc-text-secondary: #9ca3af;
  --bc-border: #374151;
  --bc-success-bg: #052e16;
  --bc-error-bg: #450a0a;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.bc-container {
  background: var(--bc-bg);
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius);
  padding: 16px;
  max-width: 320px;
  text-align: center;
}

.bc-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--bc-primary);
  color: var(--bc-primary-text);
  border: none;
  border-radius: var(--bc-radius);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--bc-font);
  cursor: pointer;
  transition: background 0.15s ease;
  width: 100%;
}

.bc-button:hover {
  background: var(--bc-primary-hover);
}

.bc-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.bc-invoice-section {
  margin-top: 12px;
}

.bc-qr-container {
  display: flex;
  justify-content: center;
  margin: 12px 0;
}

.bc-qr-container canvas {
  border-radius: 4px;
}

.bc-invoice-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.bc-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  color: var(--bc-text-secondary);
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius);
  padding: 6px 12px;
  font-size: 12px;
  font-family: var(--bc-font);
  cursor: pointer;
  flex: 1;
  justify-content: center;
}

.bc-copy-btn:hover {
  color: var(--bc-text);
  border-color: var(--bc-text-secondary);
}

.bc-status {
  font-size: 12px;
  color: var(--bc-text-secondary);
  margin-top: 8px;
}

.bc-verified {
  background: var(--bc-success-bg);
  border-color: var(--bc-success);
  padding: 12px 16px;
}

.bc-verified-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--bc-success);
  font-weight: 600;
  font-size: 14px;
}

.bc-error-state {
  background: var(--bc-error-bg);
  border-color: var(--bc-error);
}

.bc-error-msg {
  color: var(--bc-error);
  font-size: 12px;
  margin-bottom: 8px;
}

.bc-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  color: var(--bc-error);
  border: 1px solid var(--bc-error);
  border-radius: var(--bc-radius);
  padding: 6px 12px;
  font-size: 12px;
  font-family: var(--bc-font);
  cursor: pointer;
}

.bc-amount {
  font-size: 12px;
  color: var(--bc-text-secondary);
  margin-bottom: 8px;
}

@keyframes bc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.bc-spin {
  animation: bc-spin 1s linear infinite;
}

:host(.bc-compact) .bc-container {
  padding: 8px 12px;
  max-width: none;
  display: inline-block;
}

:host(.bc-compact) .bc-button {
  padding: 6px 14px;
  font-size: 13px;
  width: auto;
}
`;
