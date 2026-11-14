// Escape user-provided text before inserting it into an HTML template.
export function escapeHtml(value = '') {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

export function button(label, action, key = '', className = '') {
  return `<button type="button" class="${className}" data-action="${action}" data-key="${escapeHtml(key)}">${label}</button>`;
}

export function select(label, name, options) {
  return `<label>${label}<select name="${name}">${options}</select></label>`;
}

export function option(value, label = value, current) {
  const selected = value === current ? ' selected' : '';
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

export function options(values, current, label = (value) => value) {
  return values.map((value) => option(value, label(value), current)).join('');
}

export function field(label, name, value = '', type = 'text', attributes = '') {
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attributes}></label>`;
}

export const actions = (...items) => `<div class="actions">${items.join('')}</div>`;

export function pageHeading(title, description, controls = '') {
  return `<header class="heading"><div><h1>${title}</h1><p class="muted">${description}</p></div>${controls}</header>`;
}

export function sectionHeading(title, controls = '') {
  return `<div class="sect"><h2>${title}</h2>${controls}</div>`;
}

export function emptyState(title, description = '', controls = '') {
  return `<section class="empty-state"><h3>${title}</h3><p class="muted">${description}</p>${controls}</section>`;
}
