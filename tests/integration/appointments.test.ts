import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest'; // Use supertest for HTTP requests
import { Express } from 'express';
import { createApp } from '@/app';
import { AppointmentStatus, PrismaClient } from '@prisma/client';
import { Server } from 'http';
import { addMinutes, parseISO, format, getDay } from 'date-fns';
import { getUTCDateTimeLocal } from '@/lib/dateTimeUtils';
import { ProviderWithSchedules } from '@/types';

// --- Test Setup ---
let app: Express;
let server: Server;
let prisma: PrismaClient;
let testProvider: ProviderWithSchedules; // To store a provider fetched during tests

const BASE_URL = '/api/appointments';

beforeAll(async () => {
  // Initialize Prisma client for test cleanup/verification
  prisma = new PrismaClient();

  // Find a provider from the seeded data to use in tests
  // Ensure seed data creates predictable providers or query one
  testProvider = await prisma.provider.findFirstOrThrow({
      include: { schedules: true }
  });
  if (!testProvider) {
    throw new Error("Seeding failed or no provider found. Cannot run integration tests.");
  }

  // Create and start the Express app instance for testing
  app = createApp();
  server = app.listen(); // Listen on a random available port
});

afterAll(async () => {
  await prisma.$disconnect();
  server.close(); // Close the server instance
});

// Keep track of created appointments to clean up
const createdAppointmentIds: string[] = [];
afterEach(async () => {
   if (createdAppointmentIds.length > 0) {
      await prisma.appointment.deleteMany({
          where: { id: { in: createdAppointmentIds } }
      });
      createdAppointmentIds.length = 0; // Clear the array
   }
});

// --- Tests ---
describe(`Appointment API (${BASE_URL})`, () => {

  describe('POST /', () => {
    it('should create a new appointment for an available slot and return 201', async () => {
        // Find an available slot using the service logic (or pre-calculate from seed)
        // This is bit tricky without calling the service directly. Let's find a working day and time.
        const schedule = testProvider.schedules.find(s => {
            const dayIndex = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].indexOf(s.dayOfWeek);
            const todayIndex = getDay(new Date()); // Get today's day index (0 = Sunday, 1 = Monday, etc.)
            return dayIndex >= todayIndex; // Find the next available day starting from today
          }) || testProvider.schedules[0]; // Fallback to the first schedule if no future day is found
          
        console.log('Schedule:', schedule);
        expect(schedule).toBeDefined();
        const startTimeStr = schedule!.startTime; // e.g., "09:00"
        const testDate = new Date(); // Find next day
         while (getDay(testDate) !== 1) { testDate.setDate(testDate.getDate() + 1); }
        const dateStr = format(testDate, 'yyyy-MM-dd');

         // Construct UTC time based on provider's timezone
         const [hour, minute] = startTimeStr.split(':').map(Number);
         const startTimeUTC = getUTCDateTimeLocal(testDate, hour, minute, testProvider.timezone);

        const requestBody = {
            patientId: 'INTEGRATION_TEST_PATIENT',
            providerId: testProvider.id,
            startTime: startTimeUTC.toISOString(), // Must be ISO string
        };

        const response = await request(app)
            .post(BASE_URL)
            .send(requestBody)
            .expect(201) // Expect Created status
            .expect('Content-Type', /json/);

        expect(response.body).toHaveProperty('appointmentId');
        expect(response.body.status).toBe('CONFIRMED');
        expect(response.body.patientId).toBe(requestBody.patientId);
        expect(response.body.providerId).toBe(requestBody.providerId);
        expect(response.body.startTime).toBe(requestBody.startTime);

        // Add ID for cleanup
        createdAppointmentIds.push(response.body.appointmentId);

        // Verify in DB (optional but good)
        const dbAppt = await prisma.appointment.findUnique({ where: { id: response.body.appointmentId } });
        expect(dbAppt).not.toBeNull();
        expect(dbAppt?.startTime).toEqual(startTimeUTC);
    });

    it('should return 409 Conflict when trying to book an already booked slot', async () => {
         // 1. Book a slot first
         const schedule = testProvider.schedules.find(s => s.dayOfWeek === 'TUESDAY');
         expect(schedule).toBeDefined();
         const startTimeStr = schedule!.startTime; // e.g., "10:00"
         const testDate = new Date(); // Find next Tuesday
         while (getDay(testDate) !== 2) { testDate.setDate(testDate.getDate() + 1); }
         const [hour, minute] = startTimeStr.split(':').map(Number);
         const startTimeUTC = getUTCDateTimeLocal(testDate, hour, minute, testProvider.timezone);

         const requestBody = {
             patientId: 'INTEGRATION_TEST_PATIENT_CONFLICT_1',
             providerId: testProvider.id,
             startTime: startTimeUTC.toISOString(),
         };

         const firstResponse = await request(app).post(BASE_URL).send(requestBody).expect(201);
         createdAppointmentIds.push(firstResponse.body.appointmentId); // Ensure cleanup

         // 2. Try to book the *exact same* slot again
         const secondRequestBody = {
            ...requestBody,
            patientId: 'INTEGRATION_TEST_PATIENT_CONFLICT_2',
         };
         const response = await request(app)
            .post(BASE_URL)
            .send(secondRequestBody)
            .expect(409) // Expect Conflict status
            .expect('Content-Type', /json/);

         expect(response.body.error).toBeDefined();
         // Error message might depend on whether lock or availability check catches it first
         expect(response.body.error.code).toMatch(/CONFLICT|LOCK_ACQUISITION_FAILED/);
    });

     it('should return 422 Unprocessable Entity for invalid request body', async () => {
        const invalidRequestBody = {
            // Missing patientId
            providerId: testProvider.id,
            startTime: new Date().toISOString(),
        };
         const response = await request(app)
            .post(BASE_URL)
            .send(invalidRequestBody)
            .expect(422) // Expect Unprocessable Entity from Zod validation
            .expect('Content-Type', /json/);

         expect(response.body.error).toBeDefined();
         expect(response.body.error.code).toBe('VALIDATION_ERROR');
     });

       it('should return 409 Conflict if slot is unavailable (outside working hours)', async () => {
         // Try to book very early morning before schedule starts
         const testDate = new Date(); // Find next Monday
         while (getDay(testDate) !== 1) { testDate.setDate(testDate.getDate() + 1); }
         const startTimeUTC = getUTCDateTimeLocal(testDate, 6, 0, testProvider.timezone); // 6 AM

          const requestBody = {
            patientId: 'INTEGRATION_TEST_PATIENT_UNAVAILABLE',
            providerId: testProvider.id,
            startTime: startTimeUTC.toISOString(),
          };

          const response = await request(app)
             .post(BASE_URL)
             .send(requestBody)
             .expect(409) // Expect Conflict (as slot is not in available list)
             .expect('Content-Type', /json/);

           expect(response.body.error).toBeDefined();
           expect(response.body.error.code).toBe('CONFLICT');
           expect(response.body.error.message).toMatch(/not available|no longer available/); // Check message
       });
  });

  describe('PUT /:appointmentId', () => {
      let appointmentToReschedule: any; // Store created appointment details

      beforeAll(async () => {
          // Create an appointment to reschedule in tests
          const schedule = testProvider.schedules.find(s => s.dayOfWeek === 'THURSDAY');
          expect(schedule).toBeDefined();
          const startTimeStr = schedule!.startTime; // e.g., "09:00"
          const testDate = new Date(); // Find next Thursday
           while (getDay(testDate) !== 4) { testDate.setDate(testDate.getDate() + 1); }
          const [hour, minute] = startTimeStr.split(':').map(Number);
          const startTimeUTC = getUTCDateTimeLocal(testDate, hour, minute, testProvider.timezone);

          const requestBody = {
              patientId: 'INTEGRATION_TEST_PATIENT_RESCHEDULE',
              providerId: testProvider.id,
              startTime: startTimeUTC.toISOString(),
          };
          const response = await request(app).post(BASE_URL).send(requestBody).expect(201);
          appointmentToReschedule = response.body;
          createdAppointmentIds.push(appointmentToReschedule.appointmentId); // Ensure cleanup
      });

      it('should reschedule an existing appointment to an available time and return 200', async () => {
         // Find a new available time (e.g., one hour later on the same day)
         const newStartTimeUTC = addMinutes(parseISO(appointmentToReschedule.startTime), 60);
         const requestBody = {
            startTime: newStartTimeUTC.toISOString(),
         };

         const response = await request(app)
            .put(`${BASE_URL}/${appointmentToReschedule.appointmentId}`)
            .send(requestBody)
            .expect(200)
            .expect('Content-Type', /json/);

         expect(response.body.appointmentId).toBe(appointmentToReschedule.appointmentId);
         expect(response.body.startTime).toBe(requestBody.startTime);
         expect(response.body.status).toBe('CONFIRMED');

         // Verify DB
         const dbAppt = await prisma.appointment.findUnique({ where: { id: appointmentToReschedule.appointmentId } });
         expect(dbAppt?.startTime).toEqual(newStartTimeUTC);
      });

      it('should return 409 Conflict when rescheduling to an already booked time', async () => {
          // 1. Create a second appointment to conflict with
           const schedule = testProvider.schedules.find(s => s.dayOfWeek === 'THURSDAY');
           const conflictTimeUTC = addMinutes(parseISO(appointmentToReschedule.startTime), 120); // 2 hours after original
           const conflictBody = {
               patientId: 'INTEGRATION_TEST_PATIENT_CONFLICT_TARGET',
               providerId: testProvider.id,
               startTime: conflictTimeUTC.toISOString(),
           };
           const conflictResponse = await request(app).post(BASE_URL).send(conflictBody).expect(201);
           createdAppointmentIds.push(conflictResponse.body.appointmentId); // Cleanup this one too

           // 2. Try to reschedule the first appointment into the second one's slot
           const requestBody = {
              startTime: conflictTimeUTC.toISOString(),
           };
           const response = await request(app)
              .put(`${BASE_URL}/${appointmentToReschedule.appointmentId}`)
              .send(requestBody)
              .expect(409)
              .expect('Content-Type', /json/);

            expect(response.body.error).toBeDefined();
            expect(response.body.error.code).toMatch(/CONFLICT|LOCK_ACQUISITION_FAILED/);
      });

       it('should return 404 Not Found when rescheduling a non-existent appointment', async () => {
          const nonExistentId = 'appt_non_existent_000';
          const requestBody = {
             startTime: new Date().toISOString(),
          };
           await request(app)
              .put(`${BASE_URL}/${nonExistentId}`)
              .send(requestBody)
              .expect(404);
       });

       it('should return 422 Unprocessable Entity for invalid request body', async () => {
          const invalidRequestBody = { startTime: 'not-a-date' };
           await request(app)
              .put(`${BASE_URL}/${appointmentToReschedule.appointmentId}`)
              .send(invalidRequestBody)
              .expect(422);
       });
  });

  describe('DELETE /:appointmentId', () => {
     let appointmentToCancel: any;

      beforeAll(async () => {
          // Create an appointment to cancel
          const schedule = testProvider.schedules.find(s => s.dayOfWeek === 'FRIDAY');
          expect(schedule).toBeDefined();
          const startTimeStr = schedule!.startTime;
          const testDate = new Date(); // Find next Friday
           while (getDay(testDate) !== 5) { testDate.setDate(testDate.getDate() + 1); }
          const [hour, minute] = startTimeStr.split(':').map(Number);
          const startTimeUTC = getUTCDateTimeLocal(testDate, hour, minute, testProvider.timezone);

          const requestBody = {
              patientId: 'INTEGRATION_TEST_PATIENT_CANCEL',
              providerId: testProvider.id,
              startTime: startTimeUTC.toISOString(),
          };
          const response = await request(app).post(BASE_URL).send(requestBody).expect(201);
          appointmentToCancel = response.body;
          // Don't add to cleanup array immediately, as we want to verify its status after delete
      });

      afterAll(async () => {
           // Clean up the cancelled appointment manually if it still exists
            if (appointmentToCancel?.appointmentId) {
               await prisma.appointment.deleteMany({ where: { id: appointmentToCancel.appointmentId } });
           }
      });


      it('should cancel an existing appointment and return 200', async () => {
          const response = await request(app)
              .delete(`${BASE_URL}/${appointmentToCancel.appointmentId}`)
              .expect(200); // Or 204 if you prefer No Content

          expect(response.body.message).toMatch(/cancelled successfully/);

          // Verify DB status
           const dbAppt = await prisma.appointment.findUnique({ where: { id: appointmentToCancel.appointmentId } });
           expect(dbAppt).not.toBeNull();
           expect(dbAppt?.status).toBe(AppointmentStatus.CANCELLED);
      });

       it('should return 404 Not Found when cancelling a non-existent appointment', async () => {
           const nonExistentId = 'appt_non_existent_001';
           await request(app)
              .delete(`${BASE_URL}/${nonExistentId}`)
              .expect(404);
       });

       it('should return 200 (or be idempotent) when cancelling an already cancelled appointment', async () => {
            // First cancellation happens in the first test of this block
            // Try deleting again
           const response = await request(app)
              .delete(`${BASE_URL}/${appointmentToCancel.appointmentId}`)
              .expect(200); // Still returns success

           // Verify status hasn't changed back
           const dbAppt = await prisma.appointment.findUnique({ where: { id: appointmentToCancel.appointmentId } });
           expect(dbAppt?.status).toBe(AppointmentStatus.CANCELLED);
       });
  });

  // Add tests for GET /:appointmentId as well
  describe('GET /:appointmentId', () => {
    // ... create an appointment in beforeAll ...
    // ... test getting it, test 404 for non-existent ...
  });

});

// Add similar integration test files for provider API endpoints (tests/integration/providers.test.ts)