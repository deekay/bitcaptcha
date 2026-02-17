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

@keyframes bc-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes bc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes bc-check-pop {
  0% { transform: scale(0); }
  70% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.bc-container {
  background: var(--bc-bg);
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius);
  padding: 20px;
  max-width: 320px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
}

.bc-container > * {
  animation: bc-fade-in 0.2s ease-out;
}

.bc-amount {
  font-size: 18px;
  font-weight: 700;
  color: var(--bc-text);
  letter-spacing: -0.01em;
  margin-bottom: 8px;
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
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--bc-font);
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
  width: 100%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.15);
}

.bc-button:hover {
  background: var(--bc-primary-hover);
  box-shadow: 0 2px 6px rgba(247,147,26,0.3);
}

.bc-button:active {
  transform: scale(0.985);
}

.bc-button:focus-visible {
  outline: 2px solid var(--bc-primary);
  outline-offset: 2px;
}

.bc-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.bc-button:disabled:hover {
  box-shadow: none;
}

.bc-invoice-section {
  margin-top: 12px;
}

.bc-qr-container {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}

.bc-qr-container canvas {
  border-radius: 8px;
  border: 1px solid var(--bc-border);
  padding: 8px;
  background: #fff;
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
  transition: color 0.15s ease, border-color 0.15s ease;
}

.bc-copy-btn:hover {
  color: var(--bc-text);
  border-color: var(--bc-text-secondary);
}

.bc-copy-btn:focus-visible {
  outline: 2px solid var(--bc-primary);
  outline-offset: 2px;
}

.bc-status {
  font-size: 12px;
  color: var(--bc-text-secondary);
  margin-top: 8px;
  animation: bc-pulse 2s ease-in-out infinite;
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
  font-weight: 700;
  font-size: 16px;
}

.bc-verified-inner svg {
  animation: bc-check-pop 0.35s ease-out;
}

.bc-verified-sub {
  font-size: 12px;
  color: var(--bc-success);
  opacity: 0.75;
  margin-top: 4px;
}

.bc-error-state {
  background: var(--bc-error-bg);
  border-color: var(--bc-error);
}

.bc-error-msg {
  color: var(--bc-error);
  font-size: 13px;
  font-weight: 500;
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
  transition: background 0.15s ease, color 0.15s ease;
}

.bc-retry-btn:hover {
  background: var(--bc-error);
  color: white;
}

.bc-retry-btn:focus-visible {
  outline: 2px solid var(--bc-error);
  outline-offset: 2px;
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
