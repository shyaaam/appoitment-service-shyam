import { BadRequestError, NotFoundError } from "@/core/errors";
import type { AppointmentRepository } from "@/repositories/appointment.repository";
import type {
	ProviderRepository,
	WeeklyScheduleInput,
} from "@/repositories/provider.repository";
import type { IANATimezone } from "@/types";
import {
	addDays,
	endOfDay,
	format,
	isAfter,
	parse as parseDate,
	startOfDay,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { Memoize } from "../core/decorators"; // Import Memoize decorator
import {
	assertIsValidIANATimezone,
	formatUTCDateOnly,
	formatUTCTime,
	generateTimeSlots,
	getDayOfWeekString,
	getStartOfDayUTC,
	isSlotBooked,
} from "../lib/dateTimeUtils";

export interface AvailableSlot {
	startTime: string; // "HH:mm" format in provider's timezone
}

export class ProviderService {
	constructor(
		private providerRepository: ProviderRepository,
		private appointmentRepository: AppointmentRepository, // Inject AppointmentRepo
	) {}

	async setSchedule(
		providerId: string,
		weeklySchedule: WeeklyScheduleInput,
		timezone: IANATimezone,
		appointmentDuration: number,
	): Promise<void> {
		// Basic validation (more can be added in Zod schema)
		if (!timezone) throw new BadRequestError("Timezone is required.");
		if (!appointmentDuration || appointmentDuration <= 0)
			throw new BadRequestError(
				"Appointment duration value must be atleast 15.",
			);
		// TODO: Add validation for time formats ("HH:mm") and ensure end > start

		await this.providerRepository.upsertSchedule(
			providerId,
			weeklySchedule,
			timezone,
			appointmentDuration,
		);
	}

	@Memoize(60 * 1000) // Cache provider schedule for 60 seconds
	async getProviderSchedule(providerId: string) {
		const provider =
			await this.providerRepository.findByIdWithSchedule(providerId);
		if (!provider) {
			throw new NotFoundError("Provider");
		}
		return provider;
	}

	async listAvailableSlots(
		providerId: string,
		startDateStr: string, // "YYYY-MM-DD"
		endDateStr: string, // "YYYY-MM-DD"
	): Promise<{ [date: string]: string[] }> {
		// Return map of Date -> list of "HH:mm" slots
		const provider = await this.getProviderSchedule(providerId); // Uses memoized version

		// *** Assert timezone from DB before using ***
		assertIsValidIANATimezone(provider.timezone); // Ensures DB value is valid before passing down

		const startDate = parseDate(startDateStr, "yyyy-MM-dd", new Date());
		const endDate = parseDate(endDateStr, "yyyy-MM-dd", new Date());

		if (isAfter(startDate, endDate)) {
			throw new BadRequestError("Start date cannot be after end date.");
		}

		const availabilityMap: { [date: string]: string[] } = {};
		let currentDate = startDate;

		while (!isAfter(currentDate, endDate)) {
			const currentDateStr = format(currentDate, "yyyy-MM-dd");
			// Delegate to the single-day function
			const slots = await this.getAvailableSlotsForDate(
				providerId,
				currentDateStr,
				provider, // Pass the fetched provider data to avoid refetching
			);
			if (slots.length > 0) {
				availabilityMap[currentDateStr] = slots;
			}
			currentDate = addDays(currentDate, 1);
		}

		return availabilityMap;
	}

	// Helper function refactored for reuse by listAvailableSlots
	// Can be memoized itself if needed, but relies on booked slots which change frequently.
	// Consider caching booked slots separately if this becomes a bottleneck.
	async getAvailableSlotsForDate(
		providerId: string,
		dateStr: string, // "YYYY-MM-DD"
		providerData?: Awaited<ReturnType<typeof this.getProviderSchedule>>, // Optional pre-fetched data
	): Promise<string[]> {
		// Returns ["HH:mm"] in provider's timezone
		const provider =
			providerData ?? (await this.getProviderSchedule(providerId));

		// *** Assert timezone from DB before using ***
		assertIsValidIANATimezone(provider.timezone); // Type assertion for safety

		const { schedules, timezone, appointmentDuration } = provider;

		const targetDateUTC = getStartOfDayUTC(dateStr, timezone);
		const dayOfWeek = getDayOfWeekString(targetDateUTC); // Get day based on provider's TZ

		const dailySchedule = schedules.find((s) => s.dayOfWeek === dayOfWeek);
		if (!dailySchedule) {
			return []; // Provider doesn't work on this day
		}

		// --- Calculate Query Range in UTC ---
		// Important: Query booked appointments for the *entire day in UTC* that corresponds
		// to the provider's working day in their timezone.
		const dayStartUTC = fromZonedTime(
			startOfDay(toZonedTime(targetDateUTC, timezone)),
			timezone,
		);
		const dayEndUTC = fromZonedTime(
			endOfDay(toZonedTime(targetDateUTC, timezone)),
			timezone,
		);

		// --- Fetch Booked Slots for the day ---
		const bookedSlots = await this.appointmentRepository.findBookedSlots(
			providerId,
			dayStartUTC,
			dayEndUTC, // Query for the whole day UTC
		);

		const availableSlots: string[] = [];

		// --- Generate Potential Slots and Filter ---
		const potentialSlotsUTC = generateTimeSlots(
			dailySchedule.startTime, // "HH:mm"
			dailySchedule.endTime, // "HH:mm"
			dateStr, // "YYYY-MM-DD"
			appointmentDuration,
			timezone,
		);

		for (const slotStartUTC of potentialSlotsUTC) {
			// Check if this potential slot overlaps with any booked appointment
			if (!isSlotBooked(slotStartUTC, bookedSlots, appointmentDuration)) {
				// Convert the available UTC slot start time back to the provider's timezone HH:mm format
				availableSlots.push(formatInTimeZone(slotStartUTC, timezone, "HH:mm"));
			}
		}

		return availableSlots;
	}
}
