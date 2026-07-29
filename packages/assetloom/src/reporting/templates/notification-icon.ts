import type { NotificationIconResource } from '../../domain/types.js';
import { escapeAttribute, findOutput, outputImage } from '../html.js';
import type { ReportResource } from '../model.js';
import { renderResource } from './shared.js';

export function renderNotificationIcon(resource: ReportResource): string {
  const config = resource.config as NotificationIconResource;
  const output = findOutput(resource.outputs, ':android:', 'android');
  const color = config.android.color ?? '#172033';
  const showcase = `
    <div class="showcase">
      <div class="showcase-heading">
        <div>
          <p class="eyebrow">Appearance review</p>
          <h3>Android system notification</h3>
        </div>
        <p>Collapsed standard-template preview using the generated small icon and configured notification color.</p>
      </div>
      <div class="android-notification-preview" data-context-target="android">
        <div class="android-notification-shade">
          <div class="android-system-bar">
            <div class="android-system-left">
              <strong>9:41</strong>
              <span class="android-status-small-icon">
                ${outputImage(output, 'notification-status-image')}
              </span>
            </div>
            <div class="android-system-icons" aria-hidden="true">
              <span class="android-signal">▮▮▮</span>
              <span class="android-wifi">◒</span>
              <span class="android-battery"><span></span></span>
            </div>
          </div>
          <div class="android-shade-heading">
            <strong>Tue, Jul 29</strong>
            <span aria-hidden="true">⚙</span>
          </div>
          <article class="android-notification-card">
            <div class="android-notification-small-icon" style="background:${escapeAttribute(color)}">
              ${outputImage(output, 'notification-image')}
            </div>
            <div class="android-notification-copy">
              <div class="android-notification-app">
                <strong>Assetloom Demo</strong>
                <span>• now</span>
              </div>
              <strong class="android-notification-title">Native assets are ready</strong>
              <span class="android-notification-text">Generated Android resources passed verification</span>
            </div>
            <span class="android-notification-expand" aria-hidden="true">⌄</span>
          </article>
          <div class="android-shade-footer">
            <span>Notification settings</span>
            <span>Clear all</span>
          </div>
        </div>
        <p class="android-notification-caption">Android 12+ standard collapsed template · device theme and OEM rendering may vary</p>
      </div>
    </div>`;
  return renderResource(resource, showcase);
}
