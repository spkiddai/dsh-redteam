export const DASHBOARD_STYLES = `
.dsh-redteam-dashboard,
.dsh-redteam-dashboard *,
.dsh-redteam-dashboard__rail,
.dsh-redteam-dashboard__rail * {
  box-sizing: border-box;
}

.dsh-redteam-dashboard {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 80;
  width: 100%;
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

.dsh-redteam-dashboard[data-fullscreen='true'] {
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 160;
  width: 100%;
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
  flex-direction: column;
  min-width: 0;
  align-items: stretch;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 9px;
  background: var(--dsw-alias-bg-base, #fff);
  cursor: pointer;
}

.dsh-redteam-dashboard__tool-choice > label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dsh-redteam-dashboard__permission-review {
  max-height: 280px;
  overflow: auto;
  overflow-wrap: anywhere;
  font-size: 11px;
  cursor: auto;
}

.dsh-redteam-dashboard__permission-review p {
  white-space: normal;
  margin: 8px 0;
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

.dsh-redteam-dashboard__definition-list dt { flex-shrink: 0; }
.dsh-redteam-dashboard__definition-list > div { min-width: 0; }

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

.prism-app { height: 100dvh; display: flex; flex-direction: column; background: #f7f9fc; color: #1b2435; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.prism-app * { box-sizing: border-box; }
.prism-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-height: 64px; padding: 12px 24px; border-bottom: 1px solid #e3e8f0; background: white; }
.prism-wordmark { font-weight: 750; letter-spacing: 2px; margin-right: 14px; }
.prism-wordmark span { color: #718096; font-weight: 400; letter-spacing: 0; margin-left: 8px; }
.prism-toolbar button, .prism-toolbar select, .prism-dialog button, .prism-empty button { border: 1px solid #d9e0ea; border-radius: 8px; padding: 7px 12px; background: white; color: #24364f; cursor: pointer; font: inherit; }
.prism-toolbar select { max-width: 260px; }
.prism-account { margin-left: auto; color: #68778d; }
.prism-workspace { position: relative; flex: 1; min-height: 0; }
.prism-empty { padding: 64px; text-align: center; }
.prism-dialog-backdrop { position: fixed; inset: 0; z-index: 500; background: #16233755; display: grid; place-items: center; padding: 20px; }
.prism-dialog { background: white; border-radius: 16px; padding: 28px; width: min(620px, 100%); max-height: 85dvh; overflow: auto; box-shadow: 0 24px 80px #14284033; }
.prism-dialog h2 { font-size: 20px; margin: 0 0 16px; }
.prism-dialog label { display: block; margin: 14px 0; }
.prism-dialog input:not([type=radio]):not([type=checkbox]), .prism-dialog textarea { display: block; width: 100%; margin-top: 8px; padding: 10px; border: 1px solid #ccd6e5; border-radius: 8px; font: inherit; }
.prism-dialog fieldset { border: 0; padding: 0; margin: 0 0 24px; }
.prism-dialog legend { font-weight: 600; }
.prism-dialog pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.6; background: #f6f8fb; padding: 12px; }
.prism-dialog .prism-question-option { display: flex; gap: 10px; }
.prism-question-option small { display: block; color: #718096; margin-top: 4px; }
.prism-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.prism-actions button:last-child { background: #315fd0; border-color: #315fd0; color: white; }
.prism-app button:disabled { opacity: .5; cursor: default; }
.prism-error { padding: 10px 24px; background: #fff1ed; color: #a33d27; z-index: 600; }
.prism-error button { float: right; background: transparent; border: 0; cursor: pointer; }
.prism-password-note { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 24px; background: #fff8e8; color: #6b531f; font-size: 13px; }
.prism-password-note span { flex: 1; min-width: 180px; }
.prism-password-note a { color: inherit; text-decoration: underline; }
.prism-password-note button { border: 0; padding: 5px 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
@media (max-width: 719px) { .prism-toolbar { padding: 10px 14px; gap: 8px; } .prism-wordmark span { display: none; } .prism-toolbar select { max-width: 180px; } }

/* PRISM console: permanent navigation and independent management pages. */
.prism-app { display:grid; grid-template-columns:220px minmax(0,1fr); height:100dvh; min-height:0; background:#f6f7fb; color:#20283d; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
.prism-sidebar { display:flex; flex-direction:column; padding:22px 16px 18px; background:#151d30; color:#c6ccda; min-height:0; overflow-y:auto; }
.prism-brand { display:flex; align-items:center; gap:12px; padding:0 12px 32px; color:#fff; text-decoration:none; font-size:21px; font-weight:650; letter-spacing:2px; }
.prism-brand small { display:block; margin-top:3px; color:#818da7; font-size:10px; letter-spacing:3px; font-weight:500; }
.prism-brand-icon { display:grid; place-items:center; width:38px; height:38px; border-radius:11px; color:#c7c6ff; background:#353654; }
.prism-brand-icon svg { width:24px;height:24px; }
.prism-nav-label { margin:0 14px 10px; font-size:10px; letter-spacing:2px; color:#738099; }
.prism-sidebar nav { display:grid; gap:3px; margin-bottom:18px; }
.prism-sidebar nav button { display:flex; align-items:center; gap:12px; width:100%; border:0; border-radius:9px; padding:10px 14px; color:#aeb9cf; background:transparent; text-align:left; font:inherit; cursor:pointer; }
.prism-sidebar nav button svg { width:19px; height:19px; opacity:.8; }
.prism-sidebar nav button:hover { background:#202b42; color:#fff; }
.prism-sidebar nav button[aria-current=page] { background:#353652; color:#d7d4ff; font-weight:600; }
.prism-security-module { border-top:1px solid #2a3347; border-bottom:1px solid #2a3347; padding:12px 0; }
.prism-sidebar nav .prism-nav-group.active { color:#d7d4ff; }
.prism-nav-chevron { margin-left:auto; font-size:21px; line-height:18px; transition:transform .15s; }
.prism-nav-group[aria-expanded=true] .prism-nav-chevron { transform:rotate(90deg); }
.prism-subnav { display:grid; gap:3px; margin:2px 0 6px 23px; padding-left:9px; border-left:1px solid #353c52; }
.prism-subnav[hidden] { display:none; }
.prism-sidebar nav .prism-subnav button { padding:9px 10px; font-size:12px; }
.prism-sidebar nav .prism-subnav button svg { width:15px; height:15px; }
.prism-sidebar-bottom { margin-top:auto; border-top:1px solid #2a3347; padding:20px 10px 0; }
.prism-sidebar-account { display:flex; align-items:center; gap:11px; }
.prism-sidebar-account strong,.prism-sidebar-account small { display:block; }
.prism-sidebar-account strong { font-weight:550; color:#e8edf7; }
.prism-sidebar-account small { margin-top:5px; color:#7f8da6; font-size:11px; }
.prism-account-actions { display:flex; justify-content:space-between; margin-top:18px; }
.prism-account-actions a,.prism-account-actions button { color:#91a0ba; border:0; background:transparent; text-decoration:none; font:inherit; font-size:11px; cursor:pointer; padding:0; }
.prism-main { display:flex; flex-direction:column; min-width:0; min-height:0; }
.prism-topbar { display:flex; justify-content:space-between; align-items:center; flex-shrink:0; height:64px; padding:0 38px; background:#fff; border-bottom:1px solid #eaedf3; font-size:12px; color:#8993a7; }
.prism-topbar strong { color:#39445b; font-weight:500; }
.prism-topbar span>span { margin:0 12px; color:#c1c7d3; }
.prism-topbar-caption { font-size:11px; letter-spacing:.4px; }
.prism-content { flex:1; min-height:0; overflow:auto; }
.prism-scanner { max-width:1600px; }
.prism-scan-kind { border:0; border-bottom:1px solid #eff1f6; padding:0 0 20px; margin:0 0 20px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; min-width:0; }
.prism-scan-kind legend { font-size:12px; color:#7c879b; margin-bottom:12px; }
.prism-scan-form .prism-scan-kind label { flex-direction:row; align-items:flex-start; gap:10px; margin:0; padding:16px 12px; border:1px solid #e6e8f0; border-radius:8px; cursor:pointer; }
.prism-scan-kind label:has(input:checked) { background:#f6f3ff; border-color:#a89be5; }
.prism-scan-kind strong { display:block; font-size:12px; font-weight:600; line-height:1.5; }
.prism-scan-kind small { display:block; font-size:10px; color:#8b93a6; line-height:1.7; margin-top:7px; }
@media(max-width:900px) { .prism-scan-kind { grid-template-columns:1fr; } }
.prism-scan-kind input { accent-color:#7965e5; }
.prism-port-presets { display:flex; gap:8px; }
.prism-port-presets button,.prism-port-pagination button { border:1px solid #e6e8f0; border-radius:5px; background:#fff; color:#7462bc; padding:5px 10px; font-size:11px; }
.prism-port-counts { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:12px 22px; }
.prism-port-counts>div { border-radius:7px; padding:12px; background:#f8f9fd; }
.prism-port-counts small { display:block; font-size:11px; color:#8892a8; }
.prism-port-counts strong { display:block; margin-top:9px; font-size:23px; font-weight:500; color:#45516e; }
.prism-port-state { white-space:nowrap; color:#8590a6; font-size:11px; }
.prism-port-state.open { color:#498e7b; }
.prism-port-state.filtered,.prism-port-state.error { color:#b98845; }
.prism-port-pagination { display:flex; justify-content:flex-end; align-items:center; gap:12px; padding:18px 22px; font-size:11px; color:#8d96aa; }
.prism-port-pagination span { margin-right:auto; }
.prism-port-batch { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin:16px 22px; padding:14px; border:1px solid #e4e0f4; border-radius:8px; background:#f8f6ff; color:#655a88; font-size:11px; }
.prism-port-batch label { display:flex; align-items:center; gap:8px; margin-left:auto; }
.prism-port-batch button { padding:8px 10px; border:1px solid #ded9ed; border-radius:6px; background:#fff; color:#6755a8; }
.prism-port-batch small { width:100%; color:#8c849f; line-height:1.7; }
.prism-port-batch select { padding:7px; }
.prism-history-filters { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:15px; border-bottom:1px solid #eff1f6; }
.prism-history-filters input,.prism-history-filters small { grid-column:1/-1; }
.prism-history-filters small { color:#929bae; font-size:10px; }
.prism-scan-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; margin-bottom:26px; }
.prism-scan-summary>div { display:flex; flex-direction:column; gap:14px; padding:22px 24px; border-radius:12px; background:#fff; border:1px solid #e7eaf2; }
.prism-scan-summary small { font-size:12px; color:#7c879b; }
.prism-scan-summary strong { font-size:28px; font-weight:600; color:#2e3552; }
.prism-scan-summary .protocol { font-size:21px; padding-top:6px; }
.prism-scan-toolbar { display:flex; gap:18px; justify-content:space-between; align-items:center; margin-bottom:20px; }
.prism-scan-toolbar [role=tablist] { display:flex; gap:8px; }
.prism-scan-toolbar [role=tab] { border:0; background:transparent; padding:12px 17px; color:#7c879b; border-bottom:2px solid transparent; cursor:pointer; }
.prism-scan-toolbar [aria-selected=true] { color:#6654cf; border-color:#7965e5; font-weight:600; }
.prism-scanner input:not([type=checkbox]):not([type=radio]),.prism-scanner select,.prism-scanner textarea { box-sizing:border-box; border:1px solid #dde2ef; background:#fff; border-radius:7px; color:#35405b; padding:10px 12px; font:inherit; font-size:12px; min-width:0; }
.prism-scanner input:focus-visible,.prism-scanner select:focus-visible,.prism-scanner textarea:focus-visible { outline:2px solid #ab9cf0; outline-offset:2px; }
.prism-scanner button { cursor:pointer; }
.prism-scanner button:disabled { cursor:default; opacity:.45; }
.prism-scan-form { padding:24px; margin-bottom:24px; }
.prism-scan-section-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:22px; }
.prism-scan-form label,.prism-scan-detail label { display:flex; flex-direction:column; gap:9px; color:#5d6880; font-size:12px; margin-bottom:18px; }
.prism-scan-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
.prism-scan-form p,.prism-scan-form details { font-size:12px; line-height:1.8; }
.prism-scan-form details[open] .prism-scan-form-grid { margin-top:18px; }
.prism-scan-form-footer { display:flex; justify-content:space-between; gap:20px; align-items:center; border-top:1px solid #eff1f6; padding-top:20px; margin-top:22px; }
.prism-scan-form-footer span { color:#8a92a7; font-size:11px; }
.prism-text-button { background:transparent; border:0; color:#6755bc; padding:0; text-align:left; font:inherit; }
.prism-rule-picker { display:grid; grid-template-columns:repeat(3,1fr); padding:16px; gap:12px; background:#f8f7fc; border-radius:8px; margin:16px 0; }
.prism-rule-picker label { flex-direction:row; align-items:center; margin:0; }
.prism-scan-layout { display:grid; grid-template-columns:270px minmax(0,1fr); gap:22px; align-items:start; }
.prism-scan-history-row { display:flex; flex-wrap:wrap; gap:10px; width:100%; text-align:left; border:0; border-bottom:1px solid #eff1f6; border-left:3px solid transparent; padding:20px 17px; background:#fff; color:#4a5571; }
.prism-scan-history-row.selected { background:#f6f3ff; border-left-color:#8b77db; }
.prism-scan-history-row>span:first-child { flex:1; min-width:80px; }
.prism-scan-history-row strong { display:block; font-size:12px; overflow-wrap:anywhere; }
.prism-scan-history-row small { display:block; font-size:10px; color:#949db0; margin-top:7px; }
.prism-scan-history-row>small { width:100%; margin:0; }
.prism-scan-status { font-size:10px; color:#7e8496; align-self:flex-start; padding:3px 7px; border-radius:4px; background:#f1f3f7; }
.prism-scan-status.running,.prism-scan-status.queued { background:#eee8ff; color:#7a60c6; }
.prism-scan-status.completed { background:#edf7f4; color:#438f78; }
.prism-scan-status.failed,.prism-scan-status.partial { color:#af7a37; background:#fff3df; }
.prism-scan-results>progress { display:block; width:100%; height:4px; border:0; accent-color:#8b77db; }
.prism-scan-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.prism-scan-actions button { padding:6px 9px; background:#fff; border:1px solid #e6e8f0; border-radius:5px; color:#65708b; font-size:11px; }
.prism-scan-message { font-size:11px; color:#8992a7; padding:0 22px; line-height:1.8; }
.prism-scan-filters { display:flex; gap:12px; padding:16px 22px; }
.prism-scan-filters input { flex:1; }
.prism-scan-table-wrap { overflow:auto; }
.prism-scan-table { width:100%; border-collapse:collapse; font-size:12px; }
.prism-scan-table th { background:#fafbfe; padding:14px 22px; text-align:left; font-size:10px; color:#929bae; font-weight:500; white-space:nowrap; }
.prism-scan-table td { padding:19px 22px; border-bottom:1px solid #f0f2f7; color:#626e86; vertical-align:top; }
.prism-scan-table small { display:block; color:#99a1b2; font-size:10px; margin-top:7px; overflow-wrap:anywhere; }
.prism-severity { display:inline-block; padding:4px 8px; border-radius:4px; font-size:10px; white-space:nowrap; background:#edf0f6; color:#7c8ba6; }
.prism-severity.critical,.prism-severity.high { background:#fcecee; color:#ca6776; }
.prism-severity.medium { background:#fff3e5; color:#bf904e; }
.prism-severity.low { background:#eef1ff; color:#7d8fc7; }
.prism-scan-empty { padding:40px 24px; text-align:center; color:#98a1b4; font-size:12px; line-height:2; }
.prism-scan-empty h2 { color:#69748f; margin:14px 0; }
.prism-scan-empty-symbol { display:block; font-size:40px; color:#b0a0e3; margin:20px 0; }
.prism-scan-coverage,.prism-scan-compare,.prism-scan-rule-import { padding:22px; border-top:1px solid #eff1f6; font-size:12px; color:#7a849a; }
.prism-scanner summary { cursor:pointer; }
.prism-scan-coverage>div { padding:14px 0; border-bottom:1px solid #eff1f6; font-size:11px; }
.prism-scan-coverage small { display:block; margin-top:6px; overflow-wrap:anywhere; }
.prism-scan-compare select { display:block; width:100%; margin-top:10px; }
.prism-scan-rule-library pre { white-space:pre-wrap; max-height:300px; overflow:auto; background:#f9f8fd; padding:14px; font-size:11px; }
.prism-scan-rule-import textarea { display:block; width:100%; margin:16px 0; font-family:monospace; }
.prism-scan-detail { box-sizing:border-box; width:560px; max-width:calc(100vw - 30px); max-height:90vh; overflow:auto; background:#fff; padding:30px; border-radius:14px; color:#4b5671; box-shadow:0 24px 80px #1d183b30; }
.prism-scan-detail p { font-size:13px; line-height:1.8; overflow-wrap:anywhere; }
.prism-scan-detail h2 { font-size:20px; }
.prism-scan-detail h3 { font-size:13px; margin-top:24px; }
@media(max-width:1100px) { .prism-scan-layout { grid-template-columns:220px minmax(0,1fr); gap:14px; } .prism-scan-results .prism-surface-heading { flex-wrap:wrap; gap:15px; } .prism-scan-summary { gap:10px; } }
@media(max-width:760px) { .prism-scan-layout { grid-template-columns:1fr; } .prism-scan-summary { grid-template-columns:1fr 1fr; } .prism-scan-form-grid,.prism-rule-picker { grid-template-columns:1fr; } .prism-scan-toolbar { flex-wrap:wrap; } .prism-scan-form-footer { align-items:start; } .prism-scan-history { max-height:300px; overflow:auto; } }
.prism-page { max-width:1500px; margin:auto; padding:36px 38px 48px; }
.prism-page-heading { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-bottom:30px; }
.prism-eyebrow { color:#8a8ea5; font-size:10px; font-weight:600; letter-spacing:2px; }
.prism-page-heading h1 { font-size:27px; line-height:1.4; margin:7px 0 10px; font-weight:650; letter-spacing:-.6px; }
.prism-page-heading p { margin:0; color:#8791a5; font-size:12px; line-height:1.8; }
.prism-button { display:inline-flex; justify-content:center; align-items:center; gap:7px; min-height:36px; padding:9px 15px; border:1px solid #e0e4ef; border-radius:8px; background:#fff; color:#4e5870; font:inherit; font-size:12px; font-weight:500; cursor:pointer; white-space:nowrap; }
.prism-button svg { width:16px; height:16px; }
.prism-button.primary { color:#fff; border-color:#6968df; background:#6968df; box-shadow:0 3px 7px #6968df18; }
.prism-button.primary:hover { background:#5a59cb; }
.prism-text-button { display:inline-flex; align-items:center; gap:5px; background:none; border:0; padding:4px 0; font:inherit; font-size:12px; color:#7472d6; cursor:pointer; }
.prism-text-button svg { width:14px; height:14px; }
.prism-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; margin-bottom:28px; }
.prism-stat { padding:24px; border:1px solid #e7eaf2; border-radius:12px; background:#fff; }
.prism-stat>span { display:flex; align-items:center; gap:8px; color:#69758b; font-size:12px; }
.prism-stat svg { width:17px; height:17px; color:#9793d5; }
.prism-stat strong { display:block; margin:20px 0 12px; font-size:32px; font-weight:600; letter-spacing:-1px; }
.prism-stat small { font-size:12px; color:#98a1b4; font-weight:400; margin-left:8px; letter-spacing:0; }
.prism-stat p { font-size:11px; color:#99a3b5; margin:0; }
.prism-surface { background:#fff; border:1px solid #e7eaf2; border-radius:12px; overflow:hidden; }
.prism-surface h2 { font-size:15px; font-weight:600; margin:0; }
.prism-surface h3 { font-size:13px; font-weight:600; }
.prism-surface-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:24px; border-bottom:1px solid #eff1f6; }
.prism-surface-heading p { color:#98a1b3; font-size:11px; margin:7px 0 0; line-height:1.7; }
.prism-overview-grid { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(260px,1fr); gap:24px; }
.prism-quick-panel { padding:24px; }
.prism-quick-panel>p { color:#97a0b3; font-size:11px; line-height:1.8; margin-bottom:22px; }
.prism-quick-panel>button { display:flex; align-items:center; gap:12px; padding:16px 0; border:0; border-bottom:1px solid #eef0f6; background:transparent; width:100%; text-align:left; cursor:pointer; color:#707a90; }
.prism-quick-panel>button>svg { width:19px; height:19px; color:#8f8bd5; }
.prism-quick-panel button>span { flex:1; }
.prism-quick-panel strong { color:#39455c; font-size:12px; font-weight:550; }
.prism-quick-panel small { display:block; margin-top:5px; font-size:11px; color:#98a1b3; }
.prism-info-note { margin-top:22px; padding:16px; background:#f6f7fc; color:#8790a6; border-radius:8px; font-size:11px; line-height:1.9; }
.prism-info-note p { margin:5px 0 0; }
.prism-empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; min-height:260px; text-align:center; padding:38px 24px; }
.prism-empty-state>svg { width:35px;height:35px;color:#b2b1d0; margin-bottom:6px; }
.prism-empty-state h3 { font-size:14px; font-weight:550; margin:3px 0; color:#5f6a81; }
.prism-empty-state p { font-size:12px; color:#98a1b3; line-height:1.8; max-width:350px; margin:0 0 12px; }
.prism-project-list { padding:0 24px; }
.prism-project-list>button { display:flex; align-items:center; gap:14px; width:100%; padding:20px 0; border:0; border-bottom:1px solid #eef1f6; text-align:left; cursor:pointer; background:transparent; }
.prism-project-list>button>span:nth-child(2) { flex:1; }
.prism-project-list strong { display:block; color:#3a465b; font-size:13px; font-weight:550; }
.prism-project-list small { display:block; margin-top:6px; color:#98a3b6; font-size:11px; }
.prism-project-list>button>svg { width:16px;height:16px;color:#a7adc1; }
.prism-resource-icon { width:38px; height:38px; border-radius:10px; display:inline-grid; place-items:center; background:#f0effc; color:#8c85d7; }
.prism-resource-icon svg { width:20px; height:20px; }
.prism-list-toolbar { display:flex; align-items:center; gap:14px; padding:20px 24px; }
.prism-page>.prism-list-toolbar { padding:0 0 20px; }
.prism-list-toolbar>.prism-muted { margin-left:auto; font-size:11px; }
.prism-search { display:flex; align-items:center; gap:8px; width:280px; max-width:100%; padding:8px 11px; border:1px solid #e5e8f0; border-radius:7px; background:#fff; }
.prism-search svg { width:16px;height:16px;color:#a2a9ba;flex-shrink:0; }
.prism-search input { border:0; outline:none; width:100%; font:inherit; color:#46516a; background:transparent; font-size:12px; }
.prism-search input::placeholder { color:#abb2c1; }
.prism-select,.prism-role-editor input:not([type=checkbox]),.prism-role-editor select,.prism-access-subject select { border:1px solid #e3e7ef; border-radius:7px; padding:9px 11px; background:#fff; color:#566078; font:inherit; font-size:12px; min-height:35px; }
.prism-project-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }
.prism-project-card { border:1px solid #e5e9f2; border-radius:12px; padding:22px; background:#fff; }
.prism-project-card>div { display:flex; align-items:center; justify-content:space-between; }
.prism-project-card h2 { font-size:16px; font-weight:600; margin:23px 0 9px; overflow-wrap:anywhere; }
.prism-project-card>p { color:#98a1b3; font-size:12px; }
.prism-project-card footer { display:flex; align-items:center; justify-content:space-between; border-top:1px solid #edf0f5; padding-top:16px; margin-top:24px; gap:10px; }
.prism-project-card footer>span { font-size:10px; color:#98a1b3; }
.prism-table-scroll { overflow-x:auto; }
.prism-table { border-collapse:collapse; width:100%; text-align:left; font-size:12px; }
.prism-table th { padding:13px 24px; color:#929caf; font-size:11px; font-weight:500; background:#fafbfe; border-bottom:1px solid #edf0f5; white-space:nowrap; }
.prism-table td { padding:19px 24px; border-bottom:1px solid #eff1f6; color:#667189; }
.prism-table tr:last-child td { border-bottom:0; }
.prism-table tbody tr:hover { background:#fcfcff; }
.prism-user-cell { display:flex; align-items:center; gap:12px; }
.prism-user-cell strong { display:block; font-size:12px; font-weight:550; color:#38435a; }
.prism-user-cell small { display:block; margin-top:5px; color:#abb2c3; font-size:10px; }
.prism-avatar { display:inline-grid; place-items:center; flex-shrink:0; width:34px; height:34px; border-radius:10px; background:#eae8fb; color:#8179c7; font-size:12px; font-weight:600; }
.prism-tags { display:flex; gap:6px; flex-wrap:wrap; }
.prism-tag { display:inline-block; padding:4px 8px; border:1px solid #e9edf5; border-radius:5px; color:#8390a4; background:#f7f9fc; font-size:10px; white-space:nowrap; }
.prism-tag-violet { color:#8a80cb; background:#f3f0fc; border-color:#eae5f8; }
.prism-tag-red { color:#c66f7a; background:#fff3f4; border-color:#f6e0e3; }
.prism-status { display:inline-flex; align-items:center; gap:5px; font-size:11px; white-space:nowrap; }
.prism-status::before { content:''; width:5px; height:5px; border-radius:50%; background:currentColor; }
.prism-status.positive { color:#61a58c; }
.prism-status.muted,.prism-muted { color:#9ba4b6; }
.prism-row-actions { display:flex; gap:17px; white-space:nowrap; }
.prism-row-actions button { border:0; background:transparent; color:#8780ca; font:inherit; font-size:11px; padding:4px 0; cursor:pointer; }
.prism-form-dialog { width:min(460px,100%); border-radius:14px; padding:28px; }
.prism-form-dialog>p { font-size:12px; line-height:1.8; color:#98a1b3; }
.prism-dialog label { font-size:12px; color:#667189; }
.prism-form-dialog input { min-height:38px; }
.prism-check-label { display:flex!important; align-items:center; gap:8px; }
.prism-form-error { color:#c65365; font-size:12px; }
.prism-page-tabs { display:flex; gap:24px; border-bottom:1px solid #e3e7f0; margin-bottom:24px; }
.prism-page-tabs button { border:0; border-bottom:2px solid transparent; background:none; padding:0 0 14px; color:#969fb1; font:inherit; font-size:12px; cursor:pointer; }
.prism-page-tabs button[aria-selected=true] { color:#7770c9; border-bottom-color:#7770c9; font-weight:600; }
.prism-page-tabs button span { display:inline-block; margin-left:8px; padding:2px 6px; border-radius:4px; background:#eceaf9; font-size:10px; }
.prism-access-layout { display:grid; grid-template-columns:225px minmax(0,1fr); gap:22px; align-items:start; }
.prism-role-list { padding:20px 12px; }
.prism-role-list h2 { padding:0 12px 16px; font-size:12px; color:#929aaf; }
.prism-role-list>button { display:block; width:100%; padding:14px 12px; text-align:left; color:#647087; border:1px solid transparent; background:transparent; border-radius:8px; cursor:pointer; margin-bottom:5px; }
.prism-role-list strong { font-size:12px; font-weight:550; }
.prism-role-list small { display:block; margin-top:7px; color:#a3aabc; font-size:10px; }
.prism-role-list>button.active { background:#f5f3fc; border-color:#eeebf8; color:#877ac8; }
.prism-role-editor { padding:0 24px 24px; }
.prism-role-editor>.prism-surface-heading { padding:24px 0 20px; margin-bottom:22px; }
.prism-reset-fieldset { border:0; margin:0; padding:0; min-width:0; width:100%; }
.prism-form-grid { display:grid; grid-template-columns:1fr 1.4fr; gap:20px; }
.prism-form-grid label,.prism-grant-form label { display:flex; flex-direction:column; gap:8px; color:#7c879d; font-size:11px; }
.prism-permission-matrix h3 { margin:28px 0 14px; color:#69748b; }
.prism-permission-matrix>p { font-size:11px; line-height:1.8; }
.prism-permission-options { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.prism-permission-options label { display:flex; gap:9px; align-items:start; padding:13px 14px; border:1px solid #ebedf4; border-radius:8px; font-size:12px; color:#657087; }
.prism-permission-options input { margin:2px 0 0; }
.prism-permission-options small { display:block; margin-top:7px; color:#a4acbd; font-size:10px; }
.prism-app input[type=checkbox],.prism-app input[type=radio] { accent-color:#8177cd; }
.prism-editor-footer { display:flex; align-items:center; justify-content:space-between; padding-top:22px; margin-top:16px; border-top:1px solid #edf0f5; font-size:11px; color:#a0a8ba; }
.prism-user-access { display:grid; gap:22px; }
.prism-access-subject { display:flex; align-items:center; gap:24px; padding:22px 24px; }
.prism-access-subject label { display:flex; gap:14px; align-items:center; font-size:12px; color:#747f96; }
.prism-access-subject select { min-width:190px; }
.prism-access-subject p { font-size:11px; color:#a0a8b9; line-height:1.8; }
.prism-role-choice { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.prism-role-choice label { display:flex; gap:10px; border:1px solid #e8ecf3; border-radius:8px; padding:15px; }
.prism-role-choice strong { display:block; font-size:12px; font-weight:550; color:#626e86; }
.prism-role-choice small { display:block; margin-top:7px; color:#a2aabc; font-size:11px; line-height:1.7; }
.prism-grant-form { display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:14px; align-items:end; margin-bottom:24px; }
.prism-table-empty { font-size:12px; color:#a4acbd; text-align:center; padding:26px; }
.prism-effective-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px 24px; }
.prism-effective-grid>div { display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid #f0f2f7; color:#7c879a; font-size:11px; }
.prism-inline-message { font-size:12px; padding:12px 16px; margin-bottom:20px; border-radius:8px; }
.prism-inline-message.error { background:#fff0f3; color:#bd6b7a; }
.prism-inline-message.success { background:#edf8f3; color:#6a9f88; }
.prism-loading { padding:60px; text-align:center; color:#9ca5b8; }
.prism-password-note { font-size:11px; padding:9px 38px; background:#fffbef; color:#a28d58; border-bottom:1px solid #f4eedc; }
.prism-password-note a { color:#a28d58; }
.prism-content-workspace { display:flex; flex-direction:column; overflow:hidden; }
.prism-session-toolbar { display:flex; align-items:end; justify-content:space-between; flex-wrap:wrap; gap:14px; padding:22px 26px; border-bottom:1px solid #e7eaf2; background:#fafbfe; flex-shrink:0; }
.prism-session-toolbar>div { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.prism-context-hint { max-width:240px; font-size:11px; line-height:1.7; color:#747f96; }
.prism-session-toolbar label { display:flex; flex-direction:column; gap:7px; font-size:10px; color:#9ca4b6; }
.prism-session-toolbar select { padding:8px 10px; border:1px solid #e1e5ed; border-radius:7px; background:#fff; color:#606c84; font:inherit; font-size:12px; max-width:260px; min-width:180px; }
.prism-workspace { min-height:0; flex:1; overflow:auto; padding:18px; }
.prism-workspace>.prism-reset-fieldset { height:100%; }
.prism-workspace .dsh-redteam-dashboard { border-radius:12px; border-color:#e7eaf2; box-shadow:none; }
.prism-app :focus-visible { outline:2px solid #9690e1; outline-offset:3px; }
@media(max-width:1150px) {
  .prism-app { grid-template-columns:190px minmax(0,1fr); }
  .prism-page { padding:28px 24px 40px; }
  .prism-topbar { padding:0 24px; }
  .prism-overview-grid { grid-template-columns:minmax(0,1fr); }
  .prism-project-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .prism-grant-form { grid-template-columns:1fr 1fr; }
  .prism-effective-grid { grid-template-columns:1fr 1fr; }
}
@media(max-width:760px) {
  .prism-app { grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(0,1fr); }
  .prism-sidebar { padding:12px 16px; display:grid; grid-template-columns:auto 1fr; gap:10px; }
  .prism-brand { padding:0; font-size:17px; }
  .prism-brand small,.prism-nav-label,.prism-sidebar-account { display:none; }
  .prism-brand-icon { width:30px; height:30px; }
  .prism-sidebar nav { display:flex; gap:4px; margin:0; overflow:auto; grid-column:1/-1; }
  .prism-sidebar nav button { width:auto; white-space:nowrap; padding:9px; font-size:11px; }
  .prism-sidebar nav button svg { width:16px;height:16px; }
  .prism-subnav { display:flex; margin:0; padding-left:5px; }
  .prism-sidebar-bottom { position:absolute; right:18px; top:19px; border:0; padding:0; margin:0; }
  .prism-account-actions { gap:16px; margin:0; }
  .prism-topbar { height:44px; padding:0 20px; }
  .prism-topbar-caption { display:none; }
  .prism-page { padding:24px 18px; }
  .prism-page-heading { gap:14px; align-items:start; }
  .prism-page-heading h1 { font-size:23px; }
  .prism-page-heading p { font-size:11px; }
  .prism-stats { gap:10px; }
  .prism-stat { padding:15px 11px; }
  .prism-stat strong { font-size:25px; }
  .prism-stat>span { font-size:10px; }
  .prism-stat p { font-size:9px; line-height:1.7; }
  .prism-access-layout,.prism-form-grid,.prism-project-grid { grid-template-columns:1fr; }
  .prism-role-list { display:flex; align-items:center; padding:10px; overflow:auto; }
  .prism-role-list h2 { display:none; }
  .prism-role-list>button { min-width:130px; margin:0; }
  .prism-access-subject { display:block; }
  .prism-role-editor { padding:0 16px 18px; }
  .prism-permission-options,.prism-role-choice { grid-template-columns:1fr; }
  .prism-list-toolbar { padding:15px; flex-wrap:wrap; }
  .prism-table th,.prism-table td { padding:14px 16px; }
  .prism-password-note { padding:9px 20px; }
}
`
