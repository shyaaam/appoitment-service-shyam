import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '@/app';
import { PrismaClient } from '@prisma/client';
import { Server } from 'http';
import { format, addDays } from 'date-fns';

// --- Test Setup ---
let app: Express;
let server: Server;
let prisma: PrismaClient;
let testProviderId: string;

const BASE_URL = '/api/providers';

beforeAll(async () => {
  // Initialize Prisma client for test cleanup/verification
  prisma = new PrismaClient();

  // Create a test provider for our integration tests
  const testProvider = await prisma.provider.create({
    data: {
      timezone: 'Europe/Berlin',
      appointmentDuration: 30,
    }
  });
  testProviderId = testProvider.id;

  // Create and start the Express app instance for testing
  app = createApp();
  server = app.listen(); // Listen on a random available port
});

afterAll(async () => {
  // Clean up created provider
  if (testProviderId) {
    await prisma.providerSchedule.deleteMany({
      where: { providerId: testProviderId }
    });
    await prisma.provider.delete({
      where: { id: testProviderId }
    });
  }

  await prisma.$disconnect();
  server.close(); // Close the server instance
});

// Keep track of created schedule days to clean up
const createdScheduleDays: string[] = [];
afterEach(async () => {
  if (createdScheduleDays.length > 0) {
    await prisma.providerSchedule.deleteMany({
      where: {
        providerId: testProviderId,
        dayOfWeek: { in: createdScheduleDays },
      }
    });
    createdScheduleDays.length = 0; // Clear the array
  }
});

// --- Tests ---
describe(`Provider API (${BASE_URL})`, () => {

  describe('POST /:providerId/schedule', () => {
    it('should create a new schedule for a provider and return 200', async () => {
      const scheduleData = {
        weeklySchedule: {
          monday: { start: '09:00', end: '17:00' },
          wednesday: { start: '10:00', end: '18:00' },
        },
        timezone: 'Europe/Berlin',
        appointmentDuration: 30,
      };

      const response = await request(app)
        .post(`${BASE_URL}/${testProviderId}/schedule`)
        .send(scheduleData)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body.message).toBe('Provider schedule updated successfully.');

      // Track created days for cleanup
      createdScheduleDays.push('MONDAY', 'WEDNESDAY');

      // Verify in the database
      const schedules = await prisma.providerSchedule.findMany({
        where: { providerId: testProviderId }
      });

      expect(schedules).toHaveLength(2);
      
      const mondaySchedule = schedules.find(s => s.dayOfWeek === 'MONDAY');
      expect(mondaySchedule).toBeDefined();
      expect(mondaySchedule?.startTime).toBe('09:00');
      expect(mondaySchedule?.endTime).toBe('17:00');
      
      const wednesdaySchedule = schedules.find(s => s.dayOfWeek === 'WEDNESDAY');
      expect(wednesdaySchedule).toBeDefined();
      expect(wednesdaySchedule?.startTime).toBe('10:00');
      expect(wednesdaySchedule?.endTime).toBe('18:00');
    });

    it('should update an existing schedule for a provider and return 200', async () => {
      // First create a schedule
      await prisma.providerSchedule.create({
        data: {
          providerId: testProviderId,
          dayOfWeek: 'FRIDAY',
          startTime: '08:00',
          endTime: '16:00',
        }
      });
      createdScheduleDays.push('FRIDAY');

      // Now update it
      const updateData = {
        weeklySchedule: {
          friday: { start: '09:00', end: '17:00' }, // Updated hours
        },
        timezone: 'Europe/Berlin',
        appointmentDuration: 30,
      };

      const response = await request(app)
        .post(`${BASE_URL}/${testProviderId}/schedule`)
        .send(updateData)
        .expect(200);

      // Verify in the database
      const updatedSchedule = await prisma.providerSchedule.findUnique({
        where: {
          providerId_dayOfWeek: {
            providerId: testProviderId,
            dayOfWeek: 'FRIDAY',
          }
        }
      });

      expect(updatedSchedule).toBeDefined();
      expect(updatedSchedule?.startTime).toBe('09:00'); // Updated time
      expect(updatedSchedule?.endTime).toBe('17:00');
    });

    it('should return 422 Unprocessable Entity for invalid schedule data', async () => {
      const invalidData = {
        weeklySchedule: {
          monday: { start: '17:00', end: '09:00' }, // End before start - invalid
        },
        timezone: 'Europe/Berlin',
        appointmentDuration: 30,
      };

      const response = await request(app)
        .post(`${BASE_URL}/${testProviderId}/schedule`)
        .send(invalidData)
        .expect(422);

      expect(response.body.error).toBeDefined();
    });

    it('should return 422 Unprocessable Entity for invalid timezone', async () => {
      const invalidData = {
        weeklySchedule: {
          tuesday: { start: '09:00', end: '17:00' },
        },
        timezone: 'Invalid/Timezone',
        appointmentDuration: 30,
      };

      const response = await request(app)
        .post(`${BASE_URL}/${testProviderId}/schedule`)
        .send(invalidData)
        .expect(422);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /:providerId/availability', () => {
    beforeAll(async () => {
      // Set up test schedule for provider
      await prisma.providerSchedule.deleteMany({
        where: { providerId: testProviderId }
      });
      
      // Create schedules for Monday, Wednesday, Friday
      const schedules = [
        { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 'WEDNESDAY', startTime: '10:00', endTime: '18:00' },
        { dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '16:00' },
      ];
      
      for (const schedule of schedules) {
        await prisma.providerSchedule.create({
          data: {
            providerId: testProviderId,
            ...schedule
          }
        });
      }
      
      // Update provider timezone and appointment duration
      await prisma.provider.update({
        where: { id: testProviderId },
        data: {
          timezone: 'Europe/Berlin',
          appointmentDuration: 30,
        }
      });
    });
    
    it('should return available slots for a single date', async () => {
      // Find the next Monday for testing
      const today = new Date();
      let testDate = new Date(today);
      while (testDate.getDay() !== 1) { // 1 = Monday
        testDate.setDate(testDate.getDate() + 1);
      }
      const dateStr = format(testDate, 'yyyy-MM-dd');
      
      const response = await request(app)
        .get(`${BASE_URL}/${testProviderId}/availability?date=${dateStr}`)
        .expect(200)
        .expect('Content-Type', /json/);
      
      expect(response.body).toHaveProperty('providerId', testProviderId);
      expect(response.body).toHaveProperty('date', dateStr);
      expect(response.body).toHaveProperty('availableSlots');
      expect(Array.isArray(response.body.availableSlots)).toBe(true);
      
      // Since Monday is 9:00-17:00 with 30 min slots, should have multiple slots
      expect(response.body.availableSlots.length).toBeGreaterThan(0);
      
      // Verify format of slots (HH:mm)
      for (const slot of response.body.availableSlots) {
        expect(slot).toMatch(/^[0-2][0-9]:[0-5][0-9]$/);
      }
    });
    
    it('should return availability map for date range', async () => {
      // Find the next Monday for the start date
      const today = new Date();
      let startDate = new Date(today);
      while (startDate.getDay() !== 1) { // 1 = Monday
        startDate.setDate(startDate.getDate() + 1);
      }
      
      // End date is one week later
      const endDate = addDays(startDate, 7);
      
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      
      const response = await request(app)
        .get(`${BASE_URL}/${testProviderId}/availability?startDate=${startDateStr}&endDate=${endDateStr}`)
        .expect(200)
        .expect('Content-Type', /json/);
      
      // Response should have dates as keys
      expect(typeof response.body).toBe('object');
      
      // Should have availability for Monday, Wednesday, Friday in the range
      // Monday is already startDate, find next Wednesday and Friday
      const wednesdayStr = format(addDays(startDate, 2), 'yyyy-MM-dd'); // Monday + 2 = Wednesday
      const fridayStr = format(addDays(startDate, 4), 'yyyy-MM-dd'); // Monday + 4 = Friday
      
      // Check availability exists for the days with schedules
      expect(response.body[startDateStr]).toBeDefined(); // Monday
      expect(response.body[wednesdayStr]).toBeDefined(); // Wednesday
      expect(response.body[fridayStr]).toBeDefined(); // Friday
      
      // Each day should have slots
      expect(Array.isArray(response.body[startDateStr])).toBe(true);
      expect(response.body[startDateStr].length).toBeGreaterThan(0);
    });
    
    it('should return 422 Unprocessable Entity for invalid date format', async () => {
      const response = await request(app)
        .get(`${BASE_URL}/${testProviderId}/availability?date=invalid-date`)
        .expect(422);
      
      expect(response.body.error).toBeDefined();
    });
    
    it('should return 400 Bad Request if neither date nor date range is provided', async () => {
      const response = await request(app)
        .get(`${BASE_URL}/${testProviderId}/availability`)
        .expect(422);
      
      expect(response.body.error).toBeDefined();
    });
    
    it('should return empty slots array for days with no schedule', async () => {
      // Find the next Tuesday (provider has no schedule on Tuesday)
      const today = new Date();
      let testDate = new Date(today);
      while (testDate.getDay() !== 2) { // 2 = Tuesday
        testDate.setDate(testDate.getDate() + 1);
      }
      const dateStr = format(testDate, 'yyyy-MM-dd');
      
      const response = await request(app)
        .get(`${BASE_URL}/${testProviderId}/availability?date=${dateStr}`)
        .expect(200);
      
      expect(response.body.availableSlots).toEqual([]);
    });
  });
});