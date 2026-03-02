import { describe, it, expect } from 'vitest';
import { getAvailableDomains } from '../domains/index.js';
import { isDomainName } from '../utils/types.js';

describe('Navigation', () => {
  it('getAvailableDomains returns expected domains', () => {
    const domains = getAvailableDomains();
    expect(domains).toContain('messages');
    expect(domains).toContain('threats');
    expect(domains).toContain('queue');
    expect(domains).toHaveLength(3);
  });

  it('isDomainName validates correctly', () => {
    expect(isDomainName('messages')).toBe(true);
    expect(isDomainName('threats')).toBe(true);
    expect(isDomainName('queue')).toBe(true);
    expect(isDomainName('unknown')).toBe(false);
    expect(isDomainName('')).toBe(false);
  });
});
