import { describe, it, expect } from '@jest/globals';
import { IANATimezone } from '@/types';
import { isValidIANATimezone } from '@/lib/dateTimeUtils';

describe('Path Resolution Test', () => {
  it('should correctly resolve @/ path aliases', () => {
    // If this test runs without errors, it means path resolution is working
    const testTimezone = 'Europe/Berlin' as IANATimezone;
    expect(isValidIANATimezone(testTimezone)).toBe(true);
    expect(isValidIANATimezone('Invalid/Timezone')).toBe(false);
  });
});