export const DASHBOARD_STYLES = `
:root {
  --dsh-redteam-dashboard-rail-width: 56px;
  --dsh-redteam-native-sidebar-width: 280px;
}

@media (min-width: 960px) {
  div[data-dsh-redteam-sidebar]:has(> [data-shell-overlay]) > :nth-child(2) {
    transition: margin-left var(--ds-transition-duration-slow, 150ms)
      var(--ds-ease-in-out, ease-in-out);
  }

  div[data-dsh-redteam-sidebar='collapsed']:has(> [data-shell-overlay]) > :nth-child(2) {
    margin-left: var(--dsh-redteam-dashboard-rail-width);
  }
}

.dsh-redteam-dashboard,
.dsh-redteam-dashboard *,
.dsh-redteam-dashboard__rail,
.dsh-redteam-dashboard__rail * {
  box-sizing: border-box;
}

.dsh-redteam-dashboard {
  position: fixed;
  top: 0;
  bottom: 0;
  left: var(--dsh-redteam-native-sidebar-width, 56px);
  z-index: 80;
  width: calc(100vw - var(--dsh-redteam-native-sidebar-width, 56px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #17191c);
  background: var(--dsw-alias-bg-base, #fff);
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  box-shadow: 14px 0 32px rgba(0, 0, 0, .06);
  font-family: inherit;
}

.dsh-redteam-dashboard__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 60px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dsh-redteam-dashboard__mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 7px;
  color: var(--dsw-alias-label-primary, #17191c);
  background: transparent;
}

.dsh-redteam-dashboard__heading {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 0 1 auto;
}

.dsh-redteam-dashboard__header-spacer {
  min-width: 8px;
  flex: 1;
}

.dsh-redteam-dashboard__title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  line-height: 20px;
}

.dsh-redteam-dashboard__brand-badge {
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
  background: #17191c;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  line-height: 14px;
}

.dsh-redteam-dashboard__mode-control {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  color: var(--dsw-alias-label-secondary, #55585e);
  font-size: 10px;
  font-weight: 600;
}

.dsh-redteam-dashboard__mode-control select {
  min-width: 118px;
  height: 32px;
  padding: 5px 28px 5px 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 8px;
  color: var(--dsw-alias-label-primary, #17191c);
  background: var(--dsw-alias-bg-base, #fff);
  font: inherit;
  font-size: 11px;
  outline: none;
}

.dsh-redteam-dashboard__mode-control select:focus {
  border-color: var(--dsw-alias-button-info-fill, #6b94ef);
  box-shadow: 0 0 0 3px rgba(107, 148, 239, .12);
}

.dsh-redteam-dashboard__mode-control[data-risk='true'] {
  color: #a82432;
}

.dsh-redteam-dashboard__mode-control[data-risk='true'] select {
  border-color: rgba(200, 49, 65, .55);
  color: #a82432;
  background: rgba(200, 49, 65, .08);
}

.dsh-redteam-dashboard__mode-control option[data-risk='true'] {
  color: #a82432;
}

.dsh-redteam-dashboard__status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 12px;
}

.dsh-redteam-dashboard__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #30a46c;
  box-shadow: 0 0 0 3px rgba(48, 164, 108, .12);
}

.dsh-redteam-dashboard__icon-button,
.dsh-redteam-dashboard__tab,
.dsh-redteam-dashboard__button,
.dsh-redteam-dashboard__rail-mark,
.dsh-redteam-dashboard__rail-button {
  font: inherit;
  cursor: pointer;
}

.dsh-redteam-dashboard__icon-button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  color: var(--dsw-alias-label-secondary, #55585e);
  background: transparent;
}

.dsh-redteam-dashboard__icon-button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
}

.dsh-redteam-dashboard__tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dsh-redteam-dashboard__tab {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  background: transparent;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

.dsh-redteam-dashboard__tab:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
}

.dsh-redteam-dashboard__tab[aria-selected='true'] {
  color: var(--dsw-alias-button-info-fill, #6b94ef);
  background: rgba(107, 148, 239, .1);
}

.dsh-redteam-dashboard__body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.dsh-redteam-dashboard__module-header {
  margin-bottom: 15px;
}

.dsh-redteam-dashboard__module-title {
  margin: 0 0 5px;
  font-size: 17px;
  font-weight: 650;
  line-height: 23px;
}

.dsh-redteam-dashboard__card {
  margin-bottom: 12px;
  padding: 13px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #fff);
}

.dsh-redteam-dashboard__card--guarded {
  border-color: rgba(211, 47, 62, .22);
  background: rgba(211, 47, 62, .045);
}

.dsh-redteam-dashboard__card-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.dsh-redteam-dashboard__card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.dsh-redteam-dashboard__card-heading .dsh-redteam-dashboard__card-title {
  margin: 0;
}

.dsh-redteam-dashboard__card-heading--status {
  justify-content: space-between;
}

.dsh-redteam-dashboard__badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  color: #8a5700;
  background: rgba(245, 158, 11, .13);
  font-size: 9px;
  font-weight: 600;
  line-height: 15px;
}

.dsh-redteam-dashboard__badge[data-kind='local'] {
  color: #226b46;
  background: rgba(48, 164, 108, .12);
}

.dsh-redteam-dashboard__empty {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 12px;
  line-height: 18px;
}

.dsh-redteam-dashboard__input,
.dsh-redteam-dashboard__select,
.dsh-redteam-dashboard__textarea {
  width: 100%;
  min-height: 36px;
  margin-top: 10px;
  padding: 7px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 8px;
  color: var(--dsw-alias-label-primary, #17191c);
  background: var(--dsw-alias-bg-base, #fff);
  font: inherit;
  font-size: 12px;
  outline: none;
}

.dsh-redteam-dashboard__input:focus,
.dsh-redteam-dashboard__select:focus,
.dsh-redteam-dashboard__textarea:focus {
  border-color: var(--dsw-alias-button-info-fill, #6b94ef);
  box-shadow: 0 0 0 3px rgba(107, 148, 239, .12);
}

.dsh-redteam-dashboard__path-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
}

.dsh-redteam-dashboard__path-field .dsh-redteam-dashboard__button {
  min-height: 36px;
  white-space: nowrap;
}

.dsh-redteam-dashboard__field-help {
  margin: 6px 0 0;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 9px;
  line-height: 14px;
}

.dsh-redteam-dashboard__textarea {
  min-height: 96px;
  line-height: 18px;
  resize: vertical;
}

.dsh-redteam-dashboard__service-status {
  margin: 8px 0 0;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 10px;
  line-height: 15px;
}

.dsh-redteam-dashboard__button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 11px;
}

.dsh-redteam-dashboard__button {
  min-height: 32px;
  padding: 6px 11px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 8px;
  color: var(--dsw-alias-label-primary, #17191c);
  background: var(--dsw-alias-button-floating-fill, #fff);
  font-size: 12px;
}

.dsh-redteam-dashboard__button:hover:not(:disabled) {
  background: var(--dsw-alias-button-floating-hover, #f5f6f7);
  border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, .16));
}

.dsh-redteam-dashboard__button--primary {
  border-color: var(--dsw-alias-button-info-fill, #6b94ef);
  color: #fff;
  background: var(--dsw-alias-button-info-fill, #6b94ef);
}

.dsh-redteam-dashboard__button--primary:hover:not(:disabled) {
  border-color: var(--dsw-alias-button-info-hover, #5a84de);
  background: var(--dsw-alias-button-info-hover, #5a84de);
}

.dsh-redteam-dashboard__button--danger {
  border-color: #c83141;
  color: #fff;
  background: #c83141;
}

.dsh-redteam-dashboard__button--danger:hover:not(:disabled) {
  border-color: #ad2635;
  background: #ad2635;
}

.dsh-redteam-dashboard__risk-dialog-backdrop {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 19, 23, .44);
  backdrop-filter: blur(2px);
}

.dsh-redteam-dashboard__risk-dialog {
  width: min(420px, 100%);
  padding: 20px;
  border: 1px solid rgba(200, 49, 65, .28);
  border-radius: 14px;
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .2);
}

.dsh-redteam-dashboard__risk-dialog-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  color: #a82432;
  background: rgba(200, 49, 65, .1);
}

.dsh-redteam-dashboard__risk-dialog h3 {
  margin: 14px 0 0;
  color: #8f1f2c;
  font-size: 17px;
  line-height: 23px;
}

.dsh-redteam-dashboard__risk-dialog p {
  margin: 8px 0 0;
  color: var(--dsw-alias-label-secondary, #55585e);
  font-size: 12px;
  line-height: 19px;
}

.dsh-redteam-dashboard__risk-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.dsh-redteam-dashboard__button:disabled {
  cursor: default;
  opacity: .52;
}

.dsh-redteam-dashboard__metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.dsh-redteam-dashboard__metric {
  padding: 11px 8px;
  text-align: center;
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, #f6f7f8);
}

.dsh-redteam-dashboard__metric-value {
  display: block;
  font-size: 18px;
  font-weight: 680;
  line-height: 22px;
}

.dsh-redteam-dashboard__metric-label {
  display: block;
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 10px;
}

.dsh-redteam-dashboard__workspace {
  margin-top: 9px;
  padding: 8px 9px;
  overflow: hidden;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, #55585e);
  background: var(--dsw-alias-bg-module-platform, #f6f7f8);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-redteam-dashboard__choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 11px;
}

.dsh-redteam-dashboard__choice {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  gap: 7px;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 9px;
  cursor: pointer;
  background: var(--dsw-alias-bg-layer-1, #fff);
}

.dsh-redteam-dashboard__choice:hover {
  border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, .16));
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .025));
}

.dsh-redteam-dashboard__choice[data-selected='true'] {
  border-color: rgba(107, 148, 239, .42);
  background: rgba(107, 148, 239, .08);
}

.dsh-redteam-dashboard__choice[data-disabled='true'] {
  cursor: default;
  opacity: .52;
}

.dsh-redteam-dashboard__choice input {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  margin: 0;
  accent-color: var(--dsw-alias-button-info-fill, #6b94ef);
}

.dsh-redteam-dashboard__choice span {
  min-width: 0;
}

.dsh-redteam-dashboard__choice strong {
  display: block;
  font-size: 11px;
  font-weight: 620;
  line-height: 15px;
}

.dsh-redteam-dashboard__topology {
  position: relative;
  height: 210px;
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 50%, rgba(107, 148, 239, .07), transparent 48%),
    var(--dsw-alias-bg-module-platform, #f7f8f9);
}

.dsh-redteam-dashboard__topology svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: #aeb2b8;
  stroke-width: 1.2;
  stroke-dasharray: 4 4;
}

.dsh-redteam-dashboard__topology-node {
  position: absolute;
  z-index: 1;
  display: grid;
  min-width: 72px;
  min-height: 30px;
  place-items: center;
  padding: 5px 7px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .12));
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, #55585e);
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 3px 9px rgba(0, 0, 0, .05);
  font-size: 10px;
  font-weight: 600;
  text-align: center;
}

.dsh-redteam-dashboard__topology-node--edge { left: 50%; top: 17%; }
.dsh-redteam-dashboard__topology-node--identity { left: 21%; top: 45%; }
.dsh-redteam-dashboard__topology-node--app {
  left: 50%;
  top: 50%;
  border-color: rgba(107, 148, 239, .42);
  color: #315d9e;
  background: #f5f8ff;
}
.dsh-redteam-dashboard__topology-node--data { left: 79%; top: 45%; }
.dsh-redteam-dashboard__topology-node--admin { left: 50%; top: 83%; }

.dsh-redteam-dashboard__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 13px;
  margin-top: 8px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 9px;
}

.dsh-redteam-dashboard__legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dsh-redteam-dashboard__legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #30a46c;
}

.dsh-redteam-dashboard__legend i[data-kind='pending'] {
  background: #d99b2b;
}

.dsh-redteam-dashboard__legend i[data-kind='vulnerable'] {
  background: #d33b4f;
}

.dsh-redteam-dashboard__format-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 11px;
}

.dsh-redteam-dashboard__format {
  min-width: 0;
  min-height: 52px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 9px;
  color: var(--dsw-alias-label-primary, #17191c);
  background: var(--dsw-alias-bg-layer-1, #fff);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.dsh-redteam-dashboard__format:hover:not(:disabled) {
  border-color: rgba(107, 148, 239, .42);
  background: rgba(107, 148, 239, .07);
}

.dsh-redteam-dashboard__format:disabled {
  cursor: default;
  opacity: .52;
}

.dsh-redteam-dashboard__format strong,
.dsh-redteam-dashboard__format span {
  display: block;
}

.dsh-redteam-dashboard__format strong {
  font-size: 12px;
  font-weight: 650;
  line-height: 16px;
}

.dsh-redteam-dashboard__format span {
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 9px;
  line-height: 13px;
}

.dsh-redteam-dashboard__finding {
  padding: 11px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dsh-redteam-dashboard__finding:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.dsh-redteam-dashboard__finding-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.dsh-redteam-dashboard__severity {
  flex: 0 0 auto;
  padding: 2px 5px;
  border-radius: 5px;
  color: #7d1d2d;
  background: rgba(211, 47, 62, .12);
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-transform: uppercase;
}

.dsh-redteam-dashboard__severity[data-severity='medium'] {
  color: #8a5700;
  background: rgba(245, 158, 11, .14);
}

.dsh-redteam-dashboard__severity[data-severity='low'] {
  color: #315d9e;
  background: rgba(59, 130, 246, .12);
}

.dsh-redteam-dashboard__finding-title {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.dsh-redteam-dashboard__finding-location {
  margin-top: 4px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-redteam-dashboard__notice {
  margin: 0 16px 14px;
  padding: 9px 10px;
  border-radius: 9px;
  color: #226b46;
  background: rgba(48, 164, 108, .11);
  font-size: 11px;
  line-height: 16px;
}

.dsh-redteam-dashboard__notice[data-error='true'] {
  color: #9f2334;
  background: rgba(211, 47, 62, .1);
}

.dsh-redteam-dashboard__rail {
  position: fixed;
  top: 0;
  bottom: 0;
  left: var(--dsh-redteam-native-sidebar-width, 56px);
  z-index: 80;
  width: var(--dsh-redteam-dashboard-rail-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary, #55585e);
  background: var(--dsw-alias-bg-base, #fff);
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  box-shadow: 8px 0 22px rgba(0, 0, 0, .035);
  font-family: inherit;
}

.dsh-redteam-dashboard__rail-header {
  width: 100%;
  min-height: 68px;
  display: grid;
  place-items: center;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dsh-redteam-dashboard__rail-mark,
.dsh-redteam-dashboard__rail-button {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
}

.dsh-redteam-dashboard__rail-mark {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: var(--dsw-alias-label-primary, #17191c);
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  box-shadow: none;
}

.dsh-redteam-dashboard__rail-mark:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .07));
}

.dsh-redteam-dashboard__rail-nav {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
}

.dsh-redteam-dashboard__rail-button {
  width: 40px;
  height: 40px;
  border-radius: 9px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  background: transparent;
}

.dsh-redteam-dashboard__rail-button:hover {
  color: var(--dsw-alias-label-primary, #17191c);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
}

.dsh-redteam-dashboard__rail-button[aria-current='page'] {
  color: var(--dsw-alias-button-info-fill, #6b94ef);
  background: rgba(107, 148, 239, .1);
}

@media (prefers-reduced-motion: no-preference) {
  .dsh-redteam-dashboard {
    animation: dsh-redteam-dashboard-in 160ms ease-out;
  }
}

@keyframes dsh-redteam-dashboard-in {
  from { opacity: .7; transform: translateX(-18px); }
  to { opacity: 1; transform: translateX(0); }
}

body[data-dsh-redteam-dashboard='fullscreen'] {
  overflow: hidden;
}

.dsh-redteam-dashboard[data-fullscreen='true'] {
  top: 0;
  right: 0;
  bottom: 0;
  left: var(--dsh-redteam-native-sidebar-width, 280px);
  z-index: 160;
  width: calc(100vw - var(--dsh-redteam-native-sidebar-width, 280px));
  max-width: none;
  box-shadow: none;
}

.dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__header {
  min-height: 60px;
  padding-right: 24px;
  padding-left: 24px;
}

.dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 24px;
}

.dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__tab {
  justify-content: center;
  padding: 10px 14px;
  font-size: 13px;
  text-align: center;
}

.dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__body {
  padding: 24px 32px 48px;
}

.dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__module-header {
  max-width: 1080px;
  margin-right: auto;
  margin-left: auto;
  text-align: center;
}

.dsh-redteam-dashboard__metrics--four {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dsh-redteam-dashboard__metrics--assets {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dsh-redteam-dashboard__detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.dsh-redteam-dashboard__detail-grid > .dsh-redteam-dashboard__card {
  min-width: 0;
  margin-bottom: 0;
}

.dsh-redteam-dashboard__card--wide {
  overflow: hidden;
}

.dsh-redteam-dashboard__graph-wrap {
  position: relative;
  margin-top: 10px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  border-radius: 12px;
  background:
    radial-gradient(circle at 50% 50%, rgba(107, 148, 239, .07), transparent 44%),
    linear-gradient(rgba(116, 119, 125, .045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(116, 119, 125, .045) 1px, transparent 1px),
    var(--dsw-alias-bg-module-platform, #f7f8f9);
  background-size: auto, 28px 28px, 28px 28px, auto;
}

.dsh-redteam-dashboard__graph-toolbar {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, rgba(255, 255, 255, .94));
  box-shadow: 0 4px 12px rgba(0, 0, 0, .07);
}

.dsh-redteam-dashboard__graph-toolbar button {
  min-width: 32px;
  height: 30px;
  padding: 0 7px;
  border: 0;
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  color: var(--dsw-alias-label-secondary, #55585e);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.dsh-redteam-dashboard__graph-toolbar button:last-child {
  border-right: 0;
}

.dsh-redteam-dashboard__graph-toolbar button:hover:not(:disabled) {
  color: var(--dsw-alias-button-info-fill, #6b94ef);
  background: rgba(107, 148, 239, .08);
}

.dsh-redteam-dashboard__graph-toolbar button:disabled {
  cursor: default;
  opacity: .38;
}

.dsh-redteam-dashboard__graph {
  display: block;
  width: 100%;
  min-height: 260px;
  max-height: 420px;
}

.dsh-redteam-dashboard__graph-edge {
  stroke: rgba(99, 102, 108, .3);
  stroke-width: 1.5;
  stroke-dasharray: 5 5;
}

.dsh-redteam-dashboard__graph-node circle {
  fill: #fff;
  stroke: #30a46c;
  stroke-width: 2;
  filter: drop-shadow(0 4px 7px rgba(0, 0, 0, .1));
}

.dsh-redteam-dashboard__graph-node[data-status='pending'] circle {
  fill: #fffaf0;
  stroke: #d99b2b;
  stroke-dasharray: 4 3;
}

.dsh-redteam-dashboard__graph-node[data-status='vulnerable'] circle {
  fill: #fff5f6;
  stroke: #d33b4f;
  stroke-width: 2.5;
}

.dsh-redteam-dashboard__graph-node--project circle {
  fill: #526b8f;
  stroke: rgba(78, 112, 163, .6);
  stroke-width: 3;
}

.dsh-redteam-dashboard__graph-node text {
  pointer-events: none;
}

.dsh-redteam-dashboard__graph-node-type {
  fill: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 10px;
  text-transform: uppercase;
}

.dsh-redteam-dashboard__graph-node-label {
  fill: var(--dsw-alias-label-primary, #17191c);
  font-size: 11px;
  font-weight: 650;
}

.dsh-redteam-dashboard__graph-node--project .dsh-redteam-dashboard__graph-node-type,
.dsh-redteam-dashboard__graph-node--project .dsh-redteam-dashboard__graph-node-label {
  fill: #fff;
}

.dsh-redteam-dashboard__graph-aggregate rect {
  fill: rgba(48, 164, 108, .12);
  stroke: rgba(48, 164, 108, .35);
}

.dsh-redteam-dashboard__graph-aggregate[data-status='pending'] rect {
  fill: rgba(217, 155, 43, .12);
  stroke: rgba(217, 155, 43, .4);
}

.dsh-redteam-dashboard__graph-aggregate text {
  fill: var(--dsw-alias-label-secondary, #55585e);
  font-size: 10px;
  font-weight: 600;
}

.dsh-redteam-dashboard__graph-wrap .dsh-redteam-dashboard__legend {
  min-height: auto;
  height: auto;
  margin: 0;
  padding: 9px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dsh-redteam-dashboard__definition-list {
  display: grid;
  gap: 7px;
  margin: 10px 0 0;
}

.dsh-redteam-dashboard__subheading {
  margin: 11px 0 0;
  color: var(--dsw-alias-label-secondary, #55585e);
  font-size: 11px;
  font-weight: 650;
}

.dsh-redteam-dashboard__project-primary-grid,
.dsh-redteam-dashboard__project-collection-grid,
.dsh-redteam-dashboard__project-action-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.dsh-redteam-dashboard__project-collection-grid,
.dsh-redteam-dashboard__project-action-grid {
  align-items: start;
}

.dsh-redteam-dashboard__project-primary-grid > .dsh-redteam-dashboard__card,
.dsh-redteam-dashboard__project-collection-grid > .dsh-redteam-dashboard__card,
.dsh-redteam-dashboard__project-action-grid > .dsh-redteam-dashboard__card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-bottom: 0;
}

.dsh-redteam-dashboard__project-action-grid > .dsh-redteam-dashboard__card {
  min-height: 150px;
}

.dsh-redteam-dashboard__scope-empty {
  display: grid;
  min-height: 210px;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  text-align: center;
}

.dsh-redteam-dashboard__scope-list {
  display: grid;
  max-height: 236px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
  overflow-y: auto;
  padding-right: 3px;
}

.dsh-redteam-dashboard__scope-list article {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 3px 8px;
  padding: 8px 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .07));
  border-radius: 9px;
  background: var(--dsw-alias-bg-module-platform, #f6f7f8);
}

.dsh-redteam-dashboard__scope-list article[data-selected='true'] {
  border-color: rgba(107, 148, 239, .42);
  background: rgba(107, 148, 239, .08);
}

.dsh-redteam-dashboard__scope-list article > input {
  grid-row: 1;
  grid-column: 1;
  margin: 0;
  accent-color: var(--dsw-alias-button-info-fill, #6b94ef);
}

.dsh-redteam-dashboard__scope-list article > div {
  min-width: 0;
  grid-row: 1;
  grid-column: 2;
}

.dsh-redteam-dashboard__scope-list article strong,
.dsh-redteam-dashboard__scope-list article div > span {
  display: block;
  min-width: 0;
}

.dsh-redteam-dashboard__scope-list article strong {
  overflow: hidden;
  font-size: 11px;
  font-weight: 620;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-redteam-dashboard__scope-list article div > span {
  margin-top: 1px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 9px;
  line-height: 13px;
}

.dsh-redteam-dashboard__scope-list article > select {
  width: 100%;
  min-width: 0;
  min-height: 28px;
  grid-row: 2;
  grid-column: 1 / -1;
  padding: 4px 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 7px;
  color: var(--dsw-alias-label-secondary, #55585e);
  background: var(--dsw-alias-bg-base, #fff);
  font: inherit;
  font-size: 10px;
}

.dsh-redteam-dashboard__scope-list article > select:disabled {
  opacity: .55;
}

.dsh-redteam-dashboard__progress-overview {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}

.dsh-redteam-dashboard__progress-overview strong {
  color: #226b46;
  font-size: 24px;
}

.dsh-redteam-dashboard__progress-overview span {
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 10px;
}

.dsh-redteam-dashboard__metrics--usage {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 10px;
  margin-bottom: 0;
}

.dsh-redteam-dashboard__model-select-field {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.dsh-redteam-dashboard__model-select-field > span {
  color: var(--dsw-alias-label-secondary, #55585e);
  font-size: 10px;
  font-weight: 600;
}

.dsh-redteam-dashboard__action-summary {
  min-height: 36px;
  margin: 8px 0 0;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 11px;
  line-height: 18px;
}

.dsh-redteam-dashboard__project-export {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dsh-redteam-dashboard__project-export > .dsh-redteam-dashboard__subheading {
  margin: 0 0 8px;
}

.dsh-redteam-dashboard__export-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
}

.dsh-redteam-dashboard__export-controls .dsh-redteam-dashboard__button {
  grid-column: 1 / -1;
}

.dsh-redteam-dashboard__tool-integration {
  margin-bottom: 12px;
}

.dsh-redteam-dashboard__tool-description {
  margin: 8px 0 0;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 11px;
  line-height: 18px;
}

.dsh-redteam-dashboard__tool-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 8px;
}

.dsh-redteam-dashboard__tool-choice {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 9px;
  background: var(--dsw-alias-bg-base, #fff);
  cursor: pointer;
}

.dsh-redteam-dashboard__tool-choice[data-selected='true'] {
  border-color: rgba(107, 148, 239, .5);
  background: rgba(107, 148, 239, .08);
}

.dsh-redteam-dashboard__tool-choice input {
  flex: 0 0 auto;
  accent-color: var(--dsw-alias-button-info-fill, #6b94ef);
}

.dsh-redteam-dashboard__tool-choice span,
.dsh-redteam-dashboard__tool-choice strong,
.dsh-redteam-dashboard__tool-choice small {
  display: block;
  min-width: 0;
}

.dsh-redteam-dashboard__tool-choice strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-redteam-dashboard__tool-choice .dsh-redteam-dashboard__tool-installation-warning {
  color: #c83245;
  font-weight: 600;
}

.dsh-redteam-dashboard__tool-choice small {
  margin-top: 2px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-redteam-dashboard__tool-selection-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 10px;
}

.dsh-redteam-dashboard__tool-selection-actions > span {
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 10px;
}

.dsh-redteam-dashboard__tool-selection-actions .dsh-redteam-dashboard__button {
  width: min(100%, 168px);
}

.dsh-redteam-dashboard__add-tool-panel {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, #f6f7f8);
}

.dsh-redteam-dashboard__add-tool-panel > .dsh-redteam-dashboard__subheading {
  margin-top: 0;
}

.dsh-redteam-dashboard__mcp-tool-form {
  display: grid;
  width: min(100%, 520px);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  margin-top: 14px;
}

.dsh-redteam-dashboard__mcp-tool-form .dsh-redteam-dashboard__input,
.dsh-redteam-dashboard__mcp-tool-form .dsh-redteam-dashboard__select {
  margin-top: 0;
}

.dsh-redteam-dashboard__mcp-tool-field {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.dsh-redteam-dashboard__mcp-tool-field > span {
  color: var(--dsw-alias-label-secondary, #55585e);
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
}

.dsh-redteam-dashboard__tool-result-log {
  display: flex;
  max-height: 320px;
  flex-direction: column;
  gap: 7px;
  margin-top: 8px;
  overscroll-behavior: contain;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.dsh-redteam-dashboard__tool-execution-details {
  min-width: 0;
  margin-bottom: 0;
}

.dsh-redteam-dashboard__tool-result {
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .07));
  border-radius: 9px;
  background: var(--dsw-alias-bg-module-platform, #f6f7f8);
}

.dsh-redteam-dashboard__tool-result > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dsh-redteam-dashboard__tool-result strong,
.dsh-redteam-dashboard__tool-result span {
  font-size: 10px;
}

.dsh-redteam-dashboard__tool-result span {
  color: #226b46;
}

.dsh-redteam-dashboard__tool-result[data-status='running'] span {
  color: #8a5700;
}

.dsh-redteam-dashboard__tool-result[data-status='error'] span {
  color: #a52032;
}

.dsh-redteam-dashboard__tool-result p {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 9px;
  line-height: 15px;
}

.dsh-redteam-dashboard__definition-list div,
.dsh-redteam-dashboard__progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dsh-redteam-dashboard__definition-list dt,
.dsh-redteam-dashboard__progress-row span {
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 11px;
}

.dsh-redteam-dashboard__definition-list dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-redteam-dashboard__progress-row {
  margin-top: 10px;
}

.dsh-redteam-dashboard__progress-row strong {
  font-size: 12px;
}

.dsh-redteam-dashboard__progress-bar {
  height: 7px;
  margin-top: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform, #f0f1f2);
}

.dsh-redteam-dashboard__progress-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #30a46c, #62c58c);
}

.dsh-redteam-dashboard__vulnerability-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.dsh-redteam-dashboard__vulnerability-layout > .dsh-redteam-dashboard__card {
  min-width: 0;
  min-height: 0;
  margin-bottom: 0;
}

.dsh-redteam-dashboard__vulnerability-overview {
  display: grid;
  grid-template-columns: minmax(230px, .9fr) minmax(0, 2.1fr);
  gap: 10px;
  align-items: stretch;
  margin-top: 10px;
}

.dsh-redteam-dashboard__vulnerability-total {
  display: grid;
  min-height: 92px;
  align-content: center;
  grid-template-columns: auto 1fr;
  column-gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, #f6f7f8);
}

.dsh-redteam-dashboard__vulnerability-total > span {
  grid-row: 1;
  grid-column: 2;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 11px;
}

.dsh-redteam-dashboard__vulnerability-total strong {
  grid-row: 1 / span 3;
  grid-column: 1;
  align-self: center;
  color: var(--dsw-alias-label-primary, #202124);
  font-size: 36px;
  line-height: 1;
}

.dsh-redteam-dashboard__vulnerability-total small {
  grid-row: 2;
  grid-column: 2;
  color: var(--dsw-alias-label-tertiary, #74777d);
  font-size: 10px;
  line-height: 16px;
}

.dsh-redteam-dashboard__vulnerability-total p {
  grid-row: 3;
  grid-column: 2;
  margin: 3px 0 0;
  color: var(--dsw-alias-label-secondary, #55585e);
  font-size: 10px;
  line-height: 15px;
}

.dsh-redteam-dashboard__severity-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.dsh-redteam-dashboard__severity-summary div {
  display: grid;
  min-height: 92px;
  place-content: center;
  padding: 10px 6px;
  border-radius: 10px;
  text-align: center;
  background: var(--dsw-alias-bg-module-platform, #f6f7f8);
}

.dsh-redteam-dashboard__severity-summary strong,
.dsh-redteam-dashboard__severity-summary span {
  display: block;
}

.dsh-redteam-dashboard__severity-summary strong {
  font-size: 20px;
}

.dsh-redteam-dashboard__severity-summary span {
  margin-top: 2px;
  font-size: 8px;
  text-transform: uppercase;
}

.dsh-redteam-dashboard__severity-summary [data-severity='critical'] { color: #8f1530; }
.dsh-redteam-dashboard__severity-summary [data-severity='high'] { color: #c62b3f; }
.dsh-redteam-dashboard__severity-summary [data-severity='medium'] { color: #a56a00; }
.dsh-redteam-dashboard__severity-summary [data-severity='low'] { color: #226b46; }

.dsh-redteam-dashboard__vulnerability-empty {
  display: grid;
  min-height: 160px;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: var(--dsw-alias-label-tertiary, #74777d);
  text-align: center;
}

@media (max-width: 900px) {
  .dsh-redteam-dashboard__vulnerability-overview {
    grid-template-columns: 1fr;
  }

  .dsh-redteam-dashboard__vulnerability-total {
    min-height: 100px;
  }

  .dsh-redteam-dashboard__severity-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard__mcp-tool-form .dsh-redteam-dashboard__button {
    min-height: 36px;
  }

  .dsh-redteam-dashboard__tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.dsh-redteam-dashboard__conversation {
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 540px;
  margin: 22px 0 4px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1, #fff);
}

.dsh-redteam-dashboard__conversation-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  padding: 16px 18px 18px;
}

.dsh-redteam-dashboard__conversation-main > .dsh-redteam-dashboard__card-heading,
.dsh-redteam-dashboard__conversation-history-heading,
.dsh-redteam-dashboard__conversation-history {
  width: 100%;
  max-width: none;
  margin-right: 0;
  margin-left: 0;
}

.dsh-redteam-dashboard__conversation-history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.dsh-redteam-dashboard__conversation-history-heading .dsh-redteam-dashboard__subheading {
  margin: 0;
}

.dsh-redteam-dashboard__conversation-history {
  display: flex;
  min-height: 260px;
  max-height: 430px;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  margin-top: 10px;
  overflow: auto;
  padding: 4px 4px 4px 0;
}

.dsh-redteam-dashboard__message {
  width: fit-content;
  max-width: 88%;
  padding: 0;
  color: var(--dsw-alias-label-primary, #17191c);
  background: transparent;
}

.dsh-redteam-dashboard__message[data-role='assistant'] {
  width: 100%;
  max-width: none;
}

.dsh-redteam-dashboard__message[data-role='user'] {
  align-self: flex-end;
  padding: 10px 16px;
  border-radius: 22px;
  background: var(--dsw-specific-bubble, var(--dsw-alias-bg-module-platform, #f5f6f7));
}

.dsh-redteam-dashboard__message[data-live='true'] {
  padding-left: 12px;
  border-left: 2px solid var(--dsw-alias-button-info-fill, #6b94ef);
}

.dsh-redteam-dashboard__message > p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 16px;
  line-height: 28px;
  white-space: pre-wrap;
}

.dsh-redteam-dashboard__message-markdown {
  min-width: 0;
  overflow-x: auto;
  font-size: 16px;
  line-height: 28px;
}

.dsh-redteam-dashboard__message[data-role='user'] > p {
  line-height: 24px;
}

.dsh-redteam-dashboard__conversation-composer {
  display: flex;
  width: 100%;
  max-width: none;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0 0;
  padding-top: 10px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(0, 0, 0, .1));
  border-radius: 22px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-base, #fff));
  box-shadow: var(--dsw-shadow-lv2, 0 8px 28px rgba(0, 0, 0, .1));
}

.dsh-redteam-dashboard__conversation-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  max-height: 336px;
  padding: 4px 12px 0 16px;
  overflow-y: auto;
  border: 0;
  outline: 0;
  color: var(--dsw-alias-label-primary, #17191c);
  background: transparent;
  font: inherit;
  font-size: 16px;
  line-height: 24px;
  resize: none;
}

.dsh-redteam-dashboard__conversation-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #74777d);
}

.dsh-redteam-dashboard__conversation-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 8px 6px;
}

.dsh-redteam-dashboard__conversation-add,
.dsh-redteam-dashboard__conversation-send {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
}

.dsh-redteam-dashboard__conversation-add {
  width: 28px;
  height: 28px;
  color: var(--dsw-alias-label-secondary, #55585e);
  background: var(--dsw-specific-selector, var(--dsw-alias-bg-module-platform, #f5f6f7));
}

.dsh-redteam-dashboard__conversation-send {
  width: 34px;
  height: 34px;
  color: #fff;
  background: var(--dsw-alias-button-info-fill, #6b94ef);
  cursor: pointer;
}

.dsh-redteam-dashboard__conversation-send:hover:not(:disabled) {
  background: var(--dsw-alias-button-info-hover, #5a84de);
}

.dsh-redteam-dashboard__conversation-send:disabled {
  cursor: default;
  opacity: .4;
}

@media (min-width: 720px) {
  .dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__metrics--four {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__metrics--assets {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__detail-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard[data-fullscreen='true']
    .dsh-redteam-dashboard__project-primary-grid,
  .dsh-redteam-dashboard[data-fullscreen='true']
    .dsh-redteam-dashboard__project-collection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard[data-fullscreen='true']
    .dsh-redteam-dashboard__project-action-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__card--span-two {
    grid-column: span 2;
  }

  .dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__choices {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard[data-fullscreen='true']
    .dsh-redteam-dashboard__project-action-grid
    .dsh-redteam-dashboard__choices {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

}

@media (max-width: 719px) {
  .dsh-redteam-dashboard__tool-selection-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .dsh-redteam-dashboard__tool-selection-actions .dsh-redteam-dashboard__button {
    width: 100%;
  }

  .dsh-redteam-dashboard__mcp-tool-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dsh-redteam-dashboard[data-fullscreen='true'] .dsh-redteam-dashboard__body {
    padding: 16px;
  }
}
`
