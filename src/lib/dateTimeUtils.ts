import type { IANATimezone } from "@/types";
import {
	addMinutes,
	format,
	getDay,
	isAfter,
	isBefore,
	isEqual,
	parse,
	setHours,
	setMinutes,
	startOfDay,
	subMinutes,
	toDate,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

const DAYS_OF_WEEK = [
	"SUNDAY",
	"MONDAY",
	"TUESDAY",
	"WEDNESDAY",
	"THURSDAY",
	"FRIDAY",
	"SATURDAY",
];

/**
 * Converts a date string ("YYYY-MM-DD") and time string ("HH:mm") in a specific timezone
 * into a UTC Date object.
 */
export function getUTCDateTime(
	dateStr: string,
	timeStr: string,
	timezone: IANATimezone,
): Date {
	const dateTimeStr = `${dateStr}T${timeStr}:00`; // Add seconds for robust parsing
	// 'toDate' interprets the dateTimeStr *as if* it's in the specified timezone
	// and returns the corresponding standard JS Date object (which is internally UTC).
	return fromZonedTime(dateTimeStr, timezone);
}

// Helper to get UTC Date from local time components in a specific timezone
export function getUTCDateTimeLocal(
	date: Date,
	hours: number,
	minutes: number,
	timezone: string,
): Date {
	const localDate = startOfDay(date); // Start with the date part
	const zonedDate = toZonedTime(localDate, timezone); // Interpret as start of day in target timezone
	const dtWithHours = setHours(zonedDate, hours);
	const dtWithMinutes = setMinutes(dtWithHours, minutes);
	return fromZonedTime(dtWithMinutes, timezone); // Convert back to UTC Date object
}

/**
 * Converts a UTC Date object back to a time string ("HH:mm") in a specific timezone.
 */
export function formatUTCTime(utcDate: Date, timezone: IANATimezone): string {
	// Directly format the UTC date into the target timezone's HH:mm representation
	return formatInTimeZone(utcDate, timezone, "HH:mm");
}

/**
 * Generates potential appointment slots within a time range for a specific day.
 * Uses Generators for potentially better memory efficiency if ranges were huge.
 */
export function* generateTimeSlots(
	dayStartTimeStr: string, // "HH:mm"
	dayEndTimeStr: string, // "HH:mm"
	targetDateStr: string, // "YYYY-MM-DD"
	durationMinutes: number,
	timezone: IANATimezone,
): Generator<Date, void, undefined> {
	const dayStartUTC = getUTCDateTime(targetDateStr, dayStartTimeStr, timezone);
	const dayEndUTC = getUTCDateTime(targetDateStr, dayEndTimeStr, timezone);
	// The end time represents the *start* time of the last possible slot
	const lastPossibleSlotStartUTC = subMinutes(dayEndUTC, durationMinutes);

	let currentSlotStartUTC = dayStartUTC;

	while (!isAfter(currentSlotStartUTC, lastPossibleSlotStartUTC)) {
		yield currentSlotStartUTC;
		currentSlotStartUTC = addMinutes(currentSlotStartUTC, durationMinutes);
	}
}

/**
 * Gets the day of the week string (e.g., "MONDAY") from a Date object.
 */
export function getDayOfWeekString(date: Date): string {
	const dayIndex = getDay(date); // 0 for Sunday, 1 for Monday, etc.
	return DAYS_OF_WEEK[dayIndex];
}

/**
 * Checks if a specific time slot (UTC) is booked among a list of appointments.
 */
export function isSlotBooked(
	slotTimeUTC: Date,
	bookedAppointments: { startTime: Date; endTime: Date }[],
	durationMinutes: number,
): boolean {
	const slotEndTimeUTC = addMinutes(slotTimeUTC, durationMinutes);
	for (const appt of bookedAppointments) {
		// Check for overlap logic remains the same
		const startsDuringAppt =
			isEqual(slotTimeUTC, appt.startTime) ||
			(isAfter(slotTimeUTC, appt.startTime) &&
				isBefore(slotTimeUTC, appt.endTime));
		const endsDuringAppt =
			isAfter(slotEndTimeUTC, appt.startTime) &&
			(isEqual(slotEndTimeUTC, appt.endTime) ||
				isBefore(slotEndTimeUTC, appt.endTime));
		const containsAppt =
			(isBefore(slotTimeUTC, appt.startTime) ||
				isEqual(slotTimeUTC, appt.startTime)) &&
			(isAfter(slotEndTimeUTC, appt.endTime) ||
				isEqual(slotEndTimeUTC, appt.endTime));

		if (startsDuringAppt || endsDuringAppt || containsAppt) {
			return true;
		}
	}
	return false;
}

/**
 * Converts a UTC Date to a date string "YYYY-MM-DD" in a given timezone.
 */
export function formatUTCDateOnly(
	utcDate: Date,
	timezone: IANATimezone,
): string {
	return formatInTimeZone(utcDate, timezone, "yyyy-MM-dd");
}

/**
 * Get the start of the day in UTC for a given date string and timezone.
 */
export function getStartOfDayUTC(
	dateStr: string,
	timezone: IANATimezone,
): Date {
	const dateTimeStr = `${dateStr}T00:00:00`;
	// Interpret midnight in the target timezone and get the corresponding UTC Date
	return fromZonedTime(dateTimeStr, timezone);
}

/**
 * Type guard to check if a string is a valid IANA timezone identifier
 * recognizable by the current Intl implementation.
 * @param tz - The string to check.
 * @returns True if the timezone string is valid, false otherwise.
 */
export function isValidIANATimezone(tz: string): tz is IANATimezone {
	if (!tz) return false; // Handle empty strings or null/undefined
	try {
		// The most reliable check: Intl will throw a RangeError if the timeZone is invalid.
		Intl.DateTimeFormat(undefined, { timeZone: tz });
		return true;
	} catch (e) {
		if (e instanceof RangeError) {
			return false; // Invalid timezone string
		}
		// Re-throw other unexpected errors
		throw e;
	}
}

/**
 * Asserts that a string is a valid IANA timezone identifier.
 * Throws an Error if the check fails. Useful for type narrowing after validation
 * or when dealing with data from less safe sources (like DB reads).
 * @param tz - The string to check.
 */
export function assertIsValidIANATimezone(
	tz: string,
): asserts tz is IANATimezone {
	if (!isValidIANATimezone(tz)) {
		// Provide a more specific error type if desired
		throw new Error(
			`Invalid or unrecognized IANA timezone identifier: "${tz}"`,
		);
	}
}
