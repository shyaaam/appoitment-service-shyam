"use strict";

import { z } from "zod";
import { isValidIANATimezone } from "@/lib/dateTimeUtils";
import { IANATimezone } from "@/types";

const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/; // HH:mm format

const dailyScheduleSchema = z
	.object({
		start: z.string().regex(timeRegex, "Invalid start time format (HH:mm)"),
		end: z.string().regex(timeRegex, "Invalid end time format (HH:mm)"),
	})
	.refine((data) => data.start < data.end, {
		// Basic check: end time must be after start time
		message: "End time must be after start time for a day's schedule",
		// path: ['end'], // You can specify the path for the error
	});

const daysOfWeek = z.enum([
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
]);

export const upsertScheduleSchema = z.object({
	// Partial allows days to be optional, but if provided, they must match the schema
	weeklySchedule: z
		.record(daysOfWeek, dailyScheduleSchema)
		.refine((val) => Object.keys(val).length > 0, {
			message: "Weekly schedule cannot be empty",
		}),
	appointmentDuration: z
		.number()
		.int()
		.positive("Appointment duration must be a positive integer")
		.min(15, "Appointment duration must be at least 15 minutes"),
	timezone: z
		.string()
		.refine(isValidIANATimezone, {
			message: "Invalid or unrecognized IANA timezone identifier.",
		})
		.transform((val) => val as IANATimezone), // Transform the validated string into a valid TZ
});

export const getAvailabilitySchema = z
	.object({
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
			.optional(),
		startDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date format (YYYY-MM-DD)")
			.optional(),
		endDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date format (YYYY-MM-DD)")
			.optional(),
	})
	.refine((data) => data.date || (data.startDate && data.endDate), {
		message: 'Either "date" or both "startDate" and "endDate" must be provided',
	})
	.refine((data) => !(data.date && (data.startDate || data.endDate)), {
		message: 'Cannot provide both "date" and "startDate"/"endDate"',
	});

export type UpsertScheduleDto = z.infer<typeof upsertScheduleSchema>;
export type GetAvailabilityDto = z.infer<typeof getAvailabilitySchema>;
