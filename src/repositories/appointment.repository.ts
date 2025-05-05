import { ConflictError, NotFoundError } from "@/core/errors";
import prisma from "@/lib/prismaClient";
import {
	type Appointment,
	AppointmentStatus,
	type PrismaClient,
} from "@prisma/client";
import { Prisma } from "@prisma/client"; // Import Prisma namespace

export class AppointmentRepository {
	#prisma: PrismaClient;

	constructor(dbInstance: PrismaClient = prisma) {
		this.#prisma = dbInstance;
	}

	async findById(appointmentId: string): Promise<Appointment | null> {
		return this.#prisma.appointment.findUnique({
			where: { id: appointmentId },
		});
	}

	async findBookedSlots(
		providerId: string,
		rangeStartUTC: Date,
		rangeEndUTC: Date,
	): Promise<Pick<Appointment, "startTime" | "endTime">[]> {
		return this.#prisma.appointment.findMany({
			where: {
				providerId: providerId,
				status: AppointmentStatus.CONFIRMED, // Only consider confirmed appointments
				// Find appointments that *overlap* with the query range
				OR: [
					// Appointment starts within the range
					{ startTime: { gte: rangeStartUTC, lt: rangeEndUTC } },
					// Appointment ends within the range
					{ endTime: { gt: rangeStartUTC, lte: rangeEndUTC } },
					// Appointment spans the entire range
					{ startTime: { lte: rangeStartUTC }, endTime: { gte: rangeEndUTC } },
				],
			},
			select: {
				startTime: true,
				endTime: true,
			},
			orderBy: {
				startTime: "asc",
			},
		});
	}

	async create(data: {
		patientId: string;
		providerId: string;
		startTime: Date;
		endTime: Date;
	}): Promise<Appointment> {
		try {
			return await this.#prisma.appointment.create({
				data: {
					...data,
					status: AppointmentStatus.CONFIRMED, // Default status on creation
				},
			});
		} catch (error) {
			// Handle potential unique constraint violation (double booking)
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				// P2002 is the code for unique constraint violation
				// The unique constraint is on (providerId, startTime)
				throw new ConflictError(
					"Time slot is already booked (concurrent request).",
				);
			}
			// Re-throw other errors
			throw error;
		}
	}

	async updateTime(
		appointmentId: string,
		newStartTime: Date,
		newEndTime: Date,
	): Promise<Appointment> {
		try {
			return await this.#prisma.appointment.update({
				where: { id: appointmentId },
				data: {
					startTime: newStartTime,
					endTime: newEndTime,
					// status: AppointmentStatus.CONFIRMED, // Ensure it remains confirmed
					// You might want to add optimistic locking here using a version field if needed
					// data: { startTime: newStartTime, endTime: newEndTime, version: { increment: 1 } },
					// where: { id: appointmentId, version: currentVersion },
				},
			});
		} catch (error) {
			// Handle potential unique constraint violation if the *new* time conflicts
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new ConflictError("The new time slot is already booked.");
			}
			// Handle case where the record was not found (maybe deleted concurrently)
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2025"
			) {
				throw new NotFoundError("Appointment");
			}
			throw error;
		}
	}

	async updateStatus(
		appointmentId: string,
		status: AppointmentStatus,
	): Promise<Appointment> {
		try {
			return await this.#prisma.appointment.update({
				where: { id: appointmentId },
				data: { status },
			});
		} catch (error) {
			// Handle case where the record was not found
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2025"
			) {
				throw new NotFoundError("Appointment");
			}
			throw error;
		}
	}
}
