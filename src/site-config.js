import { validateSiteConfig } from '../lib/site-config.mjs';

export function applySiteConfig(raw, doc = document) {
  const config = validateSiteConfig(raw);
  const target = doc.querySelector('#notebook-menu .credits');
  if (!target) throw new Error('Game credits container missing');
  const span = doc.createElement('span');
  for (const part of config.credits) {
    if (part.href) {
      const anchor = doc.createElement('a');
      anchor.href = part.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = part.text;
      span.append(anchor);
    } else {
      span.append(doc.createTextNode(part.text));
    }
  }
  target.replaceChildren(span);
  doc.title = config.title;
}
