import { config } from '@/config';
import {
    getUTCDateTime,
    formatUTCTime,
    generateTimeSlots,
    getDayOfWeekString,
    isSlotBooked,
    formatUTCDateOnly,
    getStartOfDayUTC,
    assertIsValidIANATimezone,
  } from '@/lib/dateTimeUtils';
  import { describe, it, expect } from '@jest/globals';
  import { parseISO } from 'date-fns';
  
  
  describe('dateTimeUtils', () => {
    const timezone = config.defaultTimezoneString ?? 'Europe/Berlin'; // CET/CEST
    assertIsValidIANATimezone(timezone); // Ensure the timezone is valid

    const nyTimezone = 'America/New_York'; // EDT = UTC-4
    assertIsValidIANATimezone(nyTimezone); // Ensure the timezone is valid

    const dateStr = '2025-06-15'; // A Sunday in Berlin
  
    describe('getUTCDateTime', () => {
      it('should convert local date and time string to correct UTC Date', () => {
        const timeStr = '10:00'; // 10:00 AM Berlin time (CEST = UTC+2)
        const expectedUTC = new Date('2025-06-15T08:00:00.000Z'); // 10:00 - 2 hours
        const result = getUTCDateTime(dateStr, timeStr, timezone);
        expect(result).toEqual(expectedUTC);
      });
  
       it('should handle different timezones (e.g., America/New_York)', () => {
          const nyDateStr = '2025-07-20';
          const nyTimeStr = '14:00'; // 2 PM New York time
          const expectedUTC = new Date('2025-07-20T18:00:00.000Z'); // 14:00 + 4 hours
          const result = getUTCDateTime(nyDateStr, nyTimeStr, nyTimezone);
          expect(result).toEqual(expectedUTC);
      });
    });
  
    describe('formatUTCTime', () => {
      it('should format UTC Date object to local time string', () => {
        const utcDate = new Date('2025-06-15T08:00:00.000Z'); // 8 AM UTC
        const expectedTimeStr = '10:00'; // Should be 10:00 AM in Berlin (CEST = UTC+2)
        const result = formatUTCTime(utcDate, timezone);
        expect(result).toBe(expectedTimeStr);
      });
    });
  
     describe('formatUTCDateOnly', () => {
      it('should format UTC Date object to local date string', () => {
        // UTC date that is early morning, but still the same day in Berlin
        let utcDate = new Date('2025-06-15T01:00:00.000Z'); // 3 AM Berlin time
        let expectedDateStr = '2025-06-15';
        expect(formatUTCDateOnly(utcDate, timezone)).toBe(expectedDateStr);
  
         // UTC date that is late night, so it's the *next* day in Berlin
         utcDate = new Date('2025-06-15T23:00:00.000Z'); // 1 AM (June 16th) Berlin time
         expectedDateStr = '2025-06-16';
         expect(formatUTCDateOnly(utcDate, timezone)).toBe(expectedDateStr);
      });
    });
  
  
    describe('generateTimeSlots', () => {
      const duration = 30;
      const startTime = '09:00';
      const endTime = '11:00'; // Last slot should start at 10:30
  
      it('should generate correct UTC time slots', () => {
        const generator = generateTimeSlots(startTime, endTime, dateStr, duration, timezone);
        const slots = Array.from(generator);
  
        // 09:00 Berlin = 07:00 UTC
        // 09:30 Berlin = 07:30 UTC
        // 10:00 Berlin = 08:00 UTC
        // 10:30 Berlin = 08:30 UTC
        expect(slots).toHaveLength(4);
        expect(slots[0]).toEqual(new Date('2025-06-15T07:00:00.000Z'));
        expect(slots[1]).toEqual(new Date('2025-06-15T07:30:00.000Z'));
        expect(slots[2]).toEqual(new Date('2025-06-15T08:00:00.000Z'));
        expect(slots[3]).toEqual(new Date('2025-06-15T08:30:00.000Z'));
      });
  
      it('should handle end time correctly (exclusive)', () => {
           const endTimeShort = '09:30'; // Only 09:00 slot should generate
           const generator = generateTimeSlots(startTime, endTimeShort, dateStr, duration, timezone);
           const slots = Array.from(generator);
           expect(slots).toHaveLength(1);
           expect(slots[0]).toEqual(new Date('2025-06-15T07:00:00.000Z'));
      });
    });
  
    describe('getDayOfWeekString', () => {
      it('should return correct day string', () => {
         // Note: getDayOfWeekString uses the *local* day of the Date object, which depends on system TZ if not careful.
         // Let's test with UTC dates which are unambiguous day boundaries.
        expect(getDayOfWeekString(new Date('2025-06-15T12:00:00Z'))).toBe('SUNDAY'); // June 15 2025 is Sunday
        expect(getDayOfWeekString(new Date('2025-06-16T12:00:00Z'))).toBe('MONDAY');
      });
    });
  
     describe('isSlotBooked', () => {
      const duration = 30;
      const slotTimeUTC = parseISO('2025-06-15T10:00:00Z'); // 10:00 - 10:30 UTC
  
      const bookedAppointments = [
        // Exact match
        { startTime: parseISO('2025-06-15T10:00:00Z'), endTime: parseISO('2025-06-15T10:30:00Z') },
        // Overlap start
        { startTime: parseISO('2025-06-15T09:45:00Z'), endTime: parseISO('2025-06-15T10:15:00Z') },
        // Overlap end
        { startTime: parseISO('2025-06-15T10:15:00Z'), endTime: parseISO('2025-06-15T10:45:00Z') },
        // Slot inside booked appointment
        { startTime: parseISO('2025-06-15T09:30:00Z'), endTime: parseISO('2025-06-15T11:00:00Z') },
      ];
  
       const notOverlappingAppointments = [
         // Before
         { startTime: parseISO('2025-06-15T09:30:00Z'), endTime: parseISO('2025-06-15T10:00:00Z') },
         // After
         { startTime: parseISO('2025-06-15T10:30:00Z'), endTime: parseISO('2025-06-15T11:00:00Z') },
       ];
  
      it('should return true if slot is booked (exact match)', () => {
        expect(isSlotBooked(slotTimeUTC, [bookedAppointments[0]], duration)).toBe(true);
      });
       it('should return true if slot overlaps start', () => {
         expect(isSlotBooked(slotTimeUTC, [bookedAppointments[1]], duration)).toBe(true);
       });
        it('should return true if slot overlaps end', () => {
         expect(isSlotBooked(slotTimeUTC, [bookedAppointments[2]], duration)).toBe(true);
       });
        it('should return true if slot is contained within a booked appointment', () => {
         expect(isSlotBooked(slotTimeUTC, [bookedAppointments[3]], duration)).toBe(true);
       });
  
       it('should return false if slot is not booked (adjacent)', () => {
          expect(isSlotBooked(slotTimeUTC, notOverlappingAppointments, duration)).toBe(false);
       });
         it('should return false if booked appointments is empty', () => {
          expect(isSlotBooked(slotTimeUTC, [], duration)).toBe(false);
       });
    });
  
    describe('getStartOfDayUTC', () => {
        it('should return the correct start of day in UTC for the given date string and timezone', () => {
            const dateStr = '2025-06-15';
            // Start of day June 15 Berlin is June 14 22:00 UTC
            const expectedUTCStart = new Date('2025-06-14T22:00:00.000Z');
            expect(getStartOfDayUTC(dateStr, timezone)).toEqual(expectedUTCStart);
  
            // Start of day June 15 New York is June 15 04:00 UTC
             const expectedNYUTCStart = new Date('2025-06-15T04:00:00.000Z');
            expect(getStartOfDayUTC(dateStr, nyTimezone)).toEqual(expectedNYUTCStart);
        });
    });
  
  });