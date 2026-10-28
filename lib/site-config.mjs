export function validateSiteConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'credits,schema,title' ||
      value.schema !== 1 || typeof value.title !== 'string' ||
      !value.title.trim() || value.title.length > 120 ||
      !Array.isArray(value.credits) || value.credits.length < 1 || value.credits.length > 30) {
    throw new Error('Invalid site-config schema');
  }
  for (const part of value.credits) {
    if (!part || typeof part !== 'object' || Array.isArray(part) ||
        typeof part.text !== 'string' || !part.text || part.text.length > 500 ||
        Object.keys(part).some(key => !['text', 'href'].includes(key))) {
      throw new Error('Invalid credit segment');
    }
    if (part.href !== undefined) {
      if (typeof part.href !== 'string') throw new Error('Invalid credit URL');
      let url;
      try { url = new URL(part.href); } catch { throw new Error('Invalid credit URL'); }
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
        throw new Error('Credit URLs must be HTTPS without credentials');
      }
    }
  }
  return value;
}
