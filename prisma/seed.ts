import { addMinutes, setMinutes, getDay, addDays, isWithinInterval } from 'date-fns';
import { PrismaClient, AppointmentStatus } from '@prisma/client';
import { IANATimezone, ProviderWithSchedules } from '@/types';
import { assertIsValidIANATimezone, getUTCDateTimeLocal } from '@/lib/dateTimeUtils';
import { faker } from '@faker-js/faker';
import { config } from '@/config';

const prisma = new PrismaClient();

// --- Configuration ---
const NUM_PROVIDERS = 10;
const APPOINTMENTS_PER_PROVIDER_PER_DAY = 5; // Average number of appointments to create per working day
const SEED_DATE_RANGE_DAYS = 14; // Seed appointments for the next X days

const DEFAULT_TIMEZONE_STRING = config.defaultTimezoneString ?? 'Europe/Berlin';
assertIsValidIANATimezone(DEFAULT_TIMEZONE_STRING); // Assert it once
const DEFAULT_TIMEZONE: IANATimezone = DEFAULT_TIMEZONE_STRING; // Example timezone

const appointmentDurations = [15, 30, 45]; // Possible durations

// Helper to generate a plausible weekly schedule
function generateWeeklySchedule(): { dayOfWeek: string, startTime: string, endTime: string }[] {
  const schedule: { dayOfWeek: string, startTime: string, endTime: string }[] = [];
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']; // Maybe add SATURDAY/SUNDAY sometimes
  const workDays = faker.helpers.arrayElements(days, faker.number.int({ min: 3, max: 5 }));

  for (const day of workDays) {
    const startHour = faker.number.int({ min: 8, max: 10 });
    const endHour = faker.number.int({ min: 16, max: 18 });
    if (endHour > startHour) {
      schedule.push({
        dayOfWeek: day,
        startTime: `${String(startHour).padStart(2, '0')}:00`,
        endTime: `${String(endHour).padStart(2, '0')}:00`,
      });
    }
  }
  // Maybe add a weekend day sometimes
   if (faker.datatype.boolean(0.2)) { // 20% chance
      const startHour = faker.number.int({ min: 9, max: 11 });
      const endHour = faker.number.int({ min: 13, max: 15 });
       schedule.push({
           dayOfWeek: 'SATURDAY',
           startTime: `${String(startHour).padStart(2, '0')}:00`,
           endTime: `${String(endHour).padStart(2, '0')}:00`,
       });
   }

  return schedule;
}

async function main() {
  console.log('Starting seeding process...');

  // Clean existing data (optional, but recommended for repeatable seeds)
  console.log('Clearing existing data...');
  // Order matters due to foreign key constraints
  await prisma.appointment.deleteMany();
  await prisma.providerSchedule.deleteMany();
  await prisma.provider.deleteMany();
  console.log('Existing data cleared.');


  // Create Providers and Schedules
  const providers: ProviderWithSchedules[] = [];

  console.log(`Creating ${NUM_PROVIDERS} providers...`);
  for (let i = 0; i < NUM_PROVIDERS; i++) {
    const duration = faker.helpers.arrayElement(appointmentDurations);
    const provider = await prisma.provider.create({
      data: {
        timezone: DEFAULT_TIMEZONE,
        appointmentDuration: duration,
        schedules: {
          create: generateWeeklySchedule(),
        },
      },
      include: { schedules: true }, // Include schedules for appointment generation
    });

    providers.push(provider);
    process.stdout.write(`Provider ${i + 1}/${NUM_PROVIDERS} created.\r`);
  }
  console.log(`\n${NUM_PROVIDERS} providers created successfully.`);


  // Create Appointments
  console.log('Creating appointments...');
  const today = new Date();
  const appointmentCreates: any[] = []; // Use any[] temporarily for Prisma createMany input type flexibility

  for (const provider of providers) {
    let appointmentsForProvider = 0;
    const providerSchedules = provider.schedules; // Schedules are already included
    
    // Provider timezone from DB is string, assert before use
    const timezoneStr = provider.timezone;
    assertIsValidIANATimezone(timezoneStr);
    const timezone: IANATimezone = timezoneStr; // Use the typed version now
    const duration = provider.appointmentDuration;

    // Iterate through the date range for seeding
    for (let dayOffset = -SEED_DATE_RANGE_DAYS / 2; dayOffset < SEED_DATE_RANGE_DAYS / 2 ; dayOffset++) {
        const currentDate = addDays(today, dayOffset);
        const dayOfWeekIndex = getDay(currentDate); // 0 = Sunday, 1 = Monday...
        const dayOfWeekString = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][dayOfWeekIndex];

        const dailySchedule = providerSchedules?.find(s => s.dayOfWeek === dayOfWeekString);

        if (dailySchedule) { // If the provider works on this day
            const [startH, startM] = dailySchedule.startTime.split(':').map(Number);
            const [endH, endM] = dailySchedule.endTime.split(':').map(Number);

            const workStartUTC = getUTCDateTimeLocal(currentDate, startH, startM, timezone);
            const workEndUTC = getUTCDateTimeLocal(currentDate, endH, endM, timezone);
            const lastPossibleSlotStartUTC = setMinutes(workEndUTC, duration);

            // Generate potential slots and randomly book some
            let currentSlotStartUTC = workStartUTC;
            const todaysAppointments: Date[] = []; // Track booked slots for today to avoid overlap during seeding

            while (currentSlotStartUTC <= lastPossibleSlotStartUTC) {
                const slotEndUTC = addMinutes(currentSlotStartUTC, duration);
                const isAlreadyBooked = todaysAppointments.some(bookedStart =>
                    isWithinInterval(currentSlotStartUTC, { start: bookedStart, end: new Date(addMinutes(bookedStart, duration).getTime() - 1) }) || // Starts during existing
                    isWithinInterval(new Date(slotEndUTC.getTime() - 1), { start: bookedStart, end: addMinutes(bookedStart, duration) }) // Ends during existing (exclusive end for interval)
                );

                // Randomly decide whether to book this slot
                if (!isAlreadyBooked && faker.datatype.boolean(0.6)) { // 60% chance to book an available slot
                    appointmentCreates.push({
                        patientId: `PAT_${faker.string.alphanumeric(10)}`,
                        providerId: provider.id,
                        startTime: currentSlotStartUTC,
                        endTime: slotEndUTC,
                        status: AppointmentStatus.CONFIRMED,
                    });
                    todaysAppointments.push(currentSlotStartUTC);
                    appointmentsForProvider++;
                    if (appointmentsForProvider > APPOINTMENTS_PER_PROVIDER_PER_DAY * SEED_DATE_RANGE_DAYS * 0.8) break; // Limit total appointments
                }
                currentSlotStartUTC = addMinutes(currentSlotStartUTC, duration); // Move to next potential slot start
            }
        }
        if (appointmentsForProvider > APPOINTMENTS_PER_PROVIDER_PER_DAY * SEED_DATE_RANGE_DAYS * 0.8) break; // Limit total appointments
    }
     process.stdout.write(`Generated ${appointmentsForProvider} appointments for Provider ${provider.id.substring(0, 8)}...\r`);
  }


  // Bulk insert appointments
  if (appointmentCreates.length > 0) {
      console.log(`\nBulk inserting ${appointmentCreates.length} appointments...`);
      // Using createMany for efficiency. skipDuplicates might be useful if logic could create exact duplicates.
      const result = await prisma.appointment.createMany({
          data: appointmentCreates,
          skipDuplicates: true, // Skip if providerId+startTime constraint is violated (just in case seed logic has overlap)
      });
      console.log(`Successfully inserted ${result.count} appointments.`);
  } else {
      console.log('\nNo appointments generated based on provider schedules and date range.');
  }

  console.log('Seeding finished.');
}

main()
  .catch(async (e) => {
    console.error('Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });