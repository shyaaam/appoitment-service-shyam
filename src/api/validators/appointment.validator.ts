import { z } from "zod";

// ISO 8601 DateTime string (basic check)
const isoDateTimeString = z.string().datetime({
	offset: true,
	message:
		"Invalid ISO 8601 datetime format (e.g., YYYY-MM-DDTHH:mm:ssZ or with offset)",
});

export const createAppointmentSchema = z.object({
	patientId: z.string().min(1, "Patient ID is required"),
	providerId: z.string().uuid("Provider ID must be a valid UUID"),
	startTime: isoDateTimeString,
});

export const rescheduleAppointmentSchema = z.object({
	startTime: isoDateTimeString,
});

export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;
export type RescheduleAppointmentDto = z.infer<
	typeof rescheduleAppointmentSchema
>;
