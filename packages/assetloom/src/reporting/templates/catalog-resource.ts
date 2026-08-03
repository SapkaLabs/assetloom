import type { ReportResource } from '../model.js';
import { renderResource } from './shared.js';

export function renderCatalogResource(resource: ReportResource): string {
  return renderResource(resource, '');
}
