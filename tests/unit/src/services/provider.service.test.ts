import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { ProviderService } from '@/services/provider.service';
import { ProviderRepository } from '@/repositories/provider.repository';
import { AppointmentRepository } from '@/repositories/appointment.repository';
import { NotFoundError, BadRequestError } from '@/core/errors';
import { Provider, ProviderSchedule } from '@prisma/client';
import { parseISO } from 'date-fns';
import { assertIsValidIANATimezone } from '@/lib/dateTimeUtils';
import { ProviderWithSchedules } from '@/types';
import { TypeOf } from 'zod';

type MockedProviderRepository = {
  upsertSchedule: jest.MockedFunction<ProviderRepository['upsertSchedule']>;
  findByIdWithSchedule: jest.MockedFunction<ProviderRepository['findByIdWithSchedule']>;
};

type MockedAppointmentRepository = {
  findBookedSlots: jest.MockedFunction<AppointmentRepository['findBookedSlots']>;
};

// Mock the repositories
jest.mock('@/repositories/provider.repository', () => {
  return {
    ProviderRepository: jest.fn().mockImplementation((): MockedProviderRepository => ({
      upsertSchedule: jest.fn(),
      findByIdWithSchedule: jest.fn(),
    }))
  };
});

jest.mock('@/repositories/appointment.repository', () => {
  return {
    AppointmentRepository: jest.fn().mockImplementation((): MockedAppointmentRepository => ({
      findBookedSlots: jest.fn()
    }))
  };
});

describe('ProviderService', () => {
  let providerService: ProviderService;
  let mockProviderRepository: jest.Mocked<ProviderRepository>;
  let mockAppointmentRepository: jest.Mocked<AppointmentRepository>;

  const timezone = 'America/New_York';
  assertIsValidIANATimezone(timezone); // Ensure the timezone is valid
  
  const testProvider: ProviderWithSchedules = {
    id: 'provider-1',
    timezone,
    appointmentDuration: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    schedules: [
      {
        id: 'schedule-1',
        providerId: 'provider-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '17:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'schedule-2',
        providerId: 'provider-1',
        dayOfWeek: 'WEDNESDAY',
        startTime: '10:00',
        endTime: '18:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ]
  };

  const weeklyScheduleInput = {
    monday: { start: '09:00', end: '17:00' },
    wednesday: { start: '10:00', end: '18:00' },
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Create fresh instance of the repositories and service
    mockProviderRepository = new ProviderRepository() as jest.Mocked<ProviderRepository>;
    mockAppointmentRepository = new AppointmentRepository() as jest.Mocked<AppointmentRepository>;
    providerService = new ProviderService(mockProviderRepository, mockAppointmentRepository);
  });

  describe('setSchedule', () => {
    it('should call repository to upsert schedule with correct parameters', async () => {
      // Setup mock
      mockProviderRepository.upsertSchedule = jest.fn<MockedProviderRepository['upsertSchedule']>().mockResolvedValue(testProvider);
      
      // Call the service method
      await providerService.setSchedule(
        'provider-1',
        weeklyScheduleInput,
        timezone,
        30
      );
      
      // Assert the repository was called with correct params
      expect(mockProviderRepository.upsertSchedule).toHaveBeenCalledWith(
        'provider-1',
        weeklyScheduleInput,
        timezone,
        30
      );
    });
    
    it('should throw BadRequestError if timezone is missing', async () => {
      await expect(providerService.setSchedule(
        'provider-1',
        weeklyScheduleInput,
        '' as any, // Empty timezone
        30
      )).rejects.toThrow(BadRequestError);
    });
    
    it('should throw BadRequestError if appointmentDuration is invalid', async () => {
      await expect(providerService.setSchedule(
        'provider-1',
        weeklyScheduleInput,
        timezone,
        0 // Invalid duration
      )).rejects.toThrow(BadRequestError);
      
      await expect(providerService.setSchedule(
        'provider-1',
        weeklyScheduleInput,
        timezone,
        -10 // Negative duration
      )).rejects.toThrow(BadRequestError);
    });
  });
  
  describe('getProviderSchedule', () => {
    it('should return provider with schedule from repository', async () => {
      // Setup mock
      mockProviderRepository.findByIdWithSchedule = jest.fn<MockedProviderRepository['findByIdWithSchedule']>().mockResolvedValue(testProvider);
      
      // Call the service method
      const result = await providerService.getProviderSchedule('provider-1');
      
      // Assert
      expect(mockProviderRepository.findByIdWithSchedule).toHaveBeenCalledWith('provider-1');
      expect(result).toEqual(testProvider);
    });
    
    it('should throw NotFoundError if provider does not exist', async () => {
      // Setup mock to return null (not found)
      mockProviderRepository.findByIdWithSchedule = jest.fn<MockedProviderRepository['findByIdWithSchedule']>().mockResolvedValue(null);
      
      // Assert that the method throws NotFoundError
      await expect(providerService.getProviderSchedule('non-existent-id'))
        .rejects.toThrow(NotFoundError);
    });

    it('should use memoized data for repeated calls within time window', async () => {
      // Setup mock
      mockProviderRepository.findByIdWithSchedule = jest.fn<MockedProviderRepository['findByIdWithSchedule']>().mockResolvedValue(testProvider);
      
      // Call the service method twice
      const result1 = await providerService.getProviderSchedule('provider-1');
      const result2 = await providerService.getProviderSchedule('provider-1');
      
      // Repository should only be called once due to memoization
      expect(mockProviderRepository.findByIdWithSchedule).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(testProvider);
      expect(result2).toEqual(testProvider);
    });
  });
  
  describe('listAvailableSlots', () => {
    beforeEach(() => {
      // Mock the getProviderSchedule and getAvailableSlotsForDate methods
      jest.spyOn(providerService, 'getProviderSchedule').mockResolvedValue(testProvider);
      
      const mockGetAvailableSlotsForDate = jest.fn() as jest.MockedFunction<ProviderService['getAvailableSlotsForDate']>;

      mockGetAvailableSlotsForDate.mockImplementation(async (providerId:string, dateStr: string): Promise<string[]> => {
        if (dateStr === '2025-06-16') { // Monday
          return ['09:00', '09:30', '10:00'];
        } else if (dateStr === '2025-06-18') { // Wednesday
          return ['10:00', '10:30'];
        }
        return []; // No availability for other days
      });

jest.spyOn(providerService, 'getAvailableSlotsForDate').mockImplementation(mockGetAvailableSlotsForDate);
    });
    
    it('should return availability map for date range', async () => {
      const result = await providerService.listAvailableSlots(
        'provider-1',
        '2025-06-16', // Monday
        '2025-06-18'  // Wednesday
      );
      
      expect(result).toEqual({
        '2025-06-16': ['09:00', '09:30', '10:00'],
        '2025-06-18': ['10:00', '10:30']
      });
      
      // Should call getAvailableSlotsForDate for each day in range
      expect(providerService.getAvailableSlotsForDate).toHaveBeenCalledTimes(3);
    });
    
    it('should throw BadRequestError if start date is after end date', async () => {
      await expect(providerService.listAvailableSlots(
        'provider-1',
        '2025-06-18', // Later date
        '2025-06-16'  // Earlier date
      )).rejects.toThrow(BadRequestError);
    });
    
    it('should return empty object if no available slots in date range', async () => {
      // Override mock for this test to return empty for all dates
      jest.spyOn(providerService, 'getAvailableSlotsForDate').mockResolvedValue([]);
      
      const result = await providerService.listAvailableSlots(
        'provider-1',
        '2025-06-20',
        '2025-06-22'
      );
      
      expect(result).toEqual({});
    });
  });
  
  describe('getAvailableSlotsForDate', () => {
    beforeEach(() => {
      // Mock the getProviderSchedule for this test group
      jest.spyOn(providerService, 'getProviderSchedule').mockResolvedValue(testProvider);
      
      // Mock the appointmentRepository to return booked slots
      mockAppointmentRepository.findBookedSlots = jest.fn<MockedAppointmentRepository['findBookedSlots']>().mockResolvedValue([]);
    });
    
    it('should return available slots for a working day', async () => {
      const dateStr = '2025-06-16'; // Monday
      const result = await providerService.getAvailableSlotsForDate('provider-1', dateStr);
      
      // Should have multiple slots since Monday is a working day
      expect(result.length).toBeGreaterThan(0);
      expect(mockAppointmentRepository.findBookedSlots).toHaveBeenCalled();
    });
    
    it('should return empty array for non-working day', async () => {
      const dateStr = '2025-06-17'; // Tuesday - not in test schedule
      const result = await providerService.getAvailableSlotsForDate('provider-1', dateStr);
      
      expect(result).toEqual([]);
      // Should not query appointments if there's no schedule for the day
      expect(mockAppointmentRepository.findBookedSlots).not.toHaveBeenCalled();
    });
    
    it('should filter out booked slots', async () => {
      // Mock booked slots for one specific time
      const dateStr = '2025-06-16'; // Monday
      const bookedSlots = [
        {
          startTime: parseISO('2025-06-16T13:00:00.000Z'), // 9:00 AM in NY (UTC-4)
          endTime: parseISO('2025-06-16T13:30:00.000Z')
        }
      ];
      
      mockAppointmentRepository.findBookedSlots = jest.fn<MockedAppointmentRepository['findBookedSlots']>().mockResolvedValue(bookedSlots);
      
      const result = await providerService.getAvailableSlotsForDate('provider-1', dateStr);
      
      // The 9:00 slot should be filtered out
      expect(result).not.toContain('09:00');
    });
    
    it('should use provided provider data without fetching again', async () => {
      // Spy on getProviderSchedule
      const getProviderSpy = jest.spyOn(providerService, 'getProviderSchedule');
      
      // Call with provider data already provided
      await providerService.getAvailableSlotsForDate('provider-1', '2025-06-16', testProvider);
      
      // Should not call getProviderSchedule again
      expect(getProviderSpy).not.toHaveBeenCalled();
    });
  });
});