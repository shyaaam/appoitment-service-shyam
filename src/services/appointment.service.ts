import {
	AppError,
	BadRequestError,
	ConflictError,
	NotFoundError,
} from "@/core/errors";
import {
	assertIsValidIANATimezone,
	formatUTCDateOnly,
	formatUTCTime,
} from "@/lib/dateTimeUtils";
import type { AppointmentRepository } from "@/repositories/appointment.repository";
import { type Appointment, AppointmentStatus } from "@prisma/client";
import { addMinutes, isEqual, parseISO } from "date-fns"; // Import isEqual
import type { ConcurrencyService } from "./concurrency.service";
import type { IEventService } from "./event.service";
import type { ProviderService } from "./provider.service";

const APPOINTMENT_LOCK_TTL_MS = 10000; // Lock TTL: 10 seconds (adjust as needed)

export class AppointmentService {
	constructor(
		private appointmentRepository: AppointmentRepository,
		private providerService: ProviderService,
		private eventService: IEventService,
		private concurrencyService: ConcurrencyService,
	) {}

	async bookAppointment(
		patientId: string,
		providerId: string,
		requestedTimeStr: string, // ISO 8601 format string
	): Promise<Appointment> {
		const requestedTimeUTC = parseISO(requestedTimeStr);

		// Generate a unique lock key for this specific time slot
		const lockKey = this.concurrencyService.generateLockKey(
			"appointment",
			providerId,
			requestedTimeUTC.toISOString(), // Use ISO string for uniqueness
		);

		// Execute the booking logic within the acquired lock
		return this.concurrencyService.executeWithLock(
			lockKey,
			APPOINTMENT_LOCK_TTL_MS,
			async () => {
				// --- Critical Section Start ---

				// 1. Get Provider Info (needed for duration and timezone)
				// (Can potentially be fetched outside the lock if provider info is stable,
				// but keeping it inside simplifies the critical section logic)
				const provider =
					await this.providerService.getProviderSchedule(providerId);
				const { timezone, appointmentDuration } = provider;

				assertIsValidIANATimezone(timezone); // Ensure timezone is valid (also to satisfy type-safety)

				// 2. Check Availability (inside the lock)
				const dateStr = formatUTCDateOnly(requestedTimeUTC, timezone);
				const availableSlots =
					await this.providerService.getAvailableSlotsForDate(
						providerId,
						dateStr,
						provider,
					);
				const requestedTimeFormatted = formatUTCTime(
					requestedTimeUTC,
					timezone,
				);

				if (!availableSlots.includes(requestedTimeFormatted)) {
					// Availability check failed even within the lock (e.g., schedule changed)
					throw new ConflictError(
						`Time slot ${requestedTimeFormatted} on ${dateStr} is not available for provider ${providerId}.`,
					);
				}

				// 3. Calculate End Time
				const endTimeUTC = addMinutes(requestedTimeUTC, appointmentDuration);

				// 4. Create Appointment in Repository
				// We rely on the lock to prevent the race condition, so the specific P2002 catch is less critical here,
				// but keep general error handling. The lock should ideally prevent P2002.
				let newAppointment: Appointment;
				try {
					newAppointment = await this.appointmentRepository.create({
						patientId,
						providerId,
						startTime: requestedTimeUTC,
						endTime: endTimeUTC,
					});
				} catch (error) {
					// If P2002 still occurs, it might indicate a lock failure or very long operation
					if (error instanceof ConflictError) {
						// Catch ConflictError from Repo if it still happens
						console.error(
							`DB Conflict Error occurred even WITH lock for key ${lockKey}. Check TTL or lock implementation.`,
						);
						throw error;
					}
					console.error(
						`Error creating appointment within lock for key ${lockKey}:`,
						error,
					);
					throw new AppError(
						"Failed to create appointment due to a database issue.",
						500,
						"DB_CREATE_ERROR",
					);
				}

				// 5. Emit Confirmation Event (only after successful persistence)
				await this.eventService.emitEvent("APPOINTMENT_CONFIRMED", {
					appointmentId: newAppointment.id,
					patientId: newAppointment.patientId,
					providerId: newAppointment.providerId,
					appointmentTime: newAppointment.startTime.toISOString(),
				});

				return newAppointment;
				// --- Critical Section End ---
			},
		); // End executeWithLock
	}

	async rescheduleAppointment(
		appointmentId: string,
		newTimeStr: string, // ISO 8601 format string
	): Promise<Appointment> {
		const newStartTimeUTC = parseISO(newTimeStr);

		// 1. Get Existing Appointment (outside lock is fine for read-only)
		const existingAppointment = await this.findAppointmentOrFail(appointmentId);
		const {
			providerId,
			patientId,
			startTime: previousStartTime,
		} = existingAppointment;

		// Check if appointment is in a modifiable state
		if (existingAppointment.status === AppointmentStatus.CANCELLED) {
			throw new BadRequestError("Cannot reschedule a cancelled appointment.");
		}
		// Check if new time is same as old time
		if (isEqual(newStartTimeUTC, previousStartTime)) {
			return existingAppointment;
		}

		// Generate lock key for the *new* target time slot
		const lockKey = this.concurrencyService.generateLockKey(
			"appointment",
			providerId,
			newStartTimeUTC.toISOString(), // Lock the target slot
		);

		// Execute reschedule logic within the lock for the new time slot
		return this.concurrencyService.executeWithLock(
			lockKey,
			APPOINTMENT_LOCK_TTL_MS,
			async () => {
				// --- Critical Section Start ---

				// 2. Get Provider Info (inside lock, as duration might be needed)
				const provider =
					await this.providerService.getProviderSchedule(providerId);
				const { timezone, appointmentDuration } = provider;

				assertIsValidIANATimezone(timezone); // Ensure timezone is valid (also to satisfy type-safety)

				// 3. Check Availability of the *New* Slot (inside lock)
				const newDateStr = formatUTCDateOnly(newStartTimeUTC, timezone);
				const availableSlots =
					await this.providerService.getAvailableSlotsForDate(
						providerId,
						newDateStr,
						provider,
					);
				const newTimeFormatted = formatUTCTime(newStartTimeUTC, timezone);

				if (!availableSlots.includes(newTimeFormatted)) {
					throw new ConflictError(
						`New time slot ${newTimeFormatted} on ${newDateStr} is no longer available.`,
					);
				}

				// 4. Calculate New End Time
				const newEndTimeUTC = addMinutes(newStartTimeUTC, appointmentDuration);

				// 5. Update Appointment Time in Repository
				// Again, the lock should prevent P2002 conflicts on the new time slot.
				let updatedAppointment: Appointment;
				try {
					updatedAppointment = await this.appointmentRepository.updateTime(
						appointmentId,
						newStartTimeUTC,
						newEndTimeUTC,
					);
				} catch (error) {
					if (
						error instanceof ConflictError ||
						error instanceof NotFoundError
					) {
						console.error(
							`DB Conflict/Not Found occurred even WITH lock for key ${lockKey} during reschedule.`,
						);
						throw error; // Re-throw specific errors from repository
					}
					console.error(
						`Error rescheduling appointment within lock for key ${lockKey}:`,
						error,
					);
					throw new AppError(
						"Failed to reschedule appointment due to a database issue.",
						500,
						"DB_UPDATE_ERROR",
					);
				}

				// 6. Emit Rescheduled Event
				await this.eventService.emitEvent("APPOINTMENT_RESCHEDULED", {
					appointmentId: updatedAppointment.id,
					patientId: patientId,
					providerId: providerId,
					newAppointmentTime: updatedAppointment.startTime.toISOString(),
					previousAppointmentTime: previousStartTime.toISOString(),
				});

				return updatedAppointment;
				// --- Critical Section End ---
			},
		); // End executeWithLock
	}

	// cancelAppointment and getAppointmentById likely don't need this level of locking,
	// unless cancellation had complex side effects needing atomicity.
	// Simple status updates are often atomic enough at the DB level.
	async cancelAppointment(
		appointmentId: string,
		reason = "UNKNOWN",
	): Promise<Appointment> {
		// 1. Get Existing Appointment
		const existingAppointment = await this.findAppointmentOrFail(appointmentId);

		// Check if already cancelled
		if (existingAppointment.status === AppointmentStatus.CANCELLED) {
			console.warn(
				`Attempted to cancel an already cancelled appointment: ${appointmentId}`,
			);
			return existingAppointment; // Idempotent cancellation
		}

		// 2. Update Status in Repository
		let cancelledAppointment: Appointment;
		try {
			cancelledAppointment = await this.appointmentRepository.updateStatus(
				appointmentId,
				AppointmentStatus.CANCELLED,
			);
		} catch (error) {
			if (error instanceof NotFoundError) {
				throw error; // Re-throw specific error from repository
			}
			console.error("Error cancelling appointment:", error);
			throw new AppError(
				"Failed to cancel appointment due to a database issue.",
				500,
				"DB_UPDATE_ERROR",
			);
		}

		// 3. Emit Cancelled Event
		await this.eventService.emitEvent("APPOINTMENT_CANCELLED", {
			appointmentId: cancelledAppointment.id,
			reason: reason,
		});

		return cancelledAppointment;
	}

	async getAppointmentById(appointmentId: string): Promise<Appointment> {
		return this.findAppointmentOrFail(appointmentId);
	}

	private async findAppointmentOrFail(
		appointmentId: string,
	): Promise<Appointment> {
		const appointment =
			await this.appointmentRepository.findById(appointmentId);
		if (!appointment) {
			throw new NotFoundError("Appointment");
		}
		return appointment;
	}
}
