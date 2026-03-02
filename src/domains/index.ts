/**
 * Domain handler registry with lazy loading
 */

import type { DomainHandler, DomainName } from '../utils/types.js';

const domainCache = new Map<DomainName, DomainHandler>();

export async function getDomainHandler(domain: DomainName): Promise<DomainHandler> {
  const cached = domainCache.get(domain);
  if (cached) return cached;

  let handler: DomainHandler;

  switch (domain) {
    case 'messages': {
      const { messagesHandler } = await import('./messages.js');
      handler = messagesHandler;
      break;
    }
    case 'threats': {
      const { threatsHandler } = await import('./threats.js');
      handler = threatsHandler;
      break;
    }
    case 'queue': {
      const { queueHandler } = await import('./queue.js');
      handler = queueHandler;
      break;
    }
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }

  domainCache.set(domain, handler);
  return handler;
}

export function getAvailableDomains(): DomainName[] {
  return ['messages', 'threats', 'queue'];
}

export function clearDomainCache(): void {
  domainCache.clear();
}
