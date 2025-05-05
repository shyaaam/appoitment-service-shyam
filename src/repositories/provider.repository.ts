import prisma from "@/lib/prismaClient";
import type { IANATimezone } from "@/types";
import type { PrismaClient, Provider, ProviderSchedule } from "@prisma/client";

export type WeeklyScheduleInput = {
	[key: string]: { start: string; end: string } | undefined; // e.g., "monday": { start: "09:00", end: "17:00" }
};

export class ProviderRepository {
	#prisma: PrismaClient;

	constructor(dbInstance: PrismaClient = prisma) {
		// Allow injecting Prisma client for testability
		this.#prisma = dbInstance;
	}

	async findById(providerId: string): Promise<Provider | null> {
		return this.#prisma.provider.findUnique({
			where: { id: providerId },
		});
	}

	async findByIdWithSchedule(
		providerId: string,
	): Promise<(Provider & { schedules: ProviderSchedule[] }) | null> {
		return this.#prisma.provider.findUnique({
			where: { id: providerId },
			include: { schedules: true },
		});
	}

	async upsertSchedule(
		providerId: string,
		weeklySchedule: WeeklyScheduleInput,
		timezone: IANATimezone,
		appointmentDuration: number,
	): Promise<Provider> {
		const days = Object.keys(weeklySchedule).map((d) => d.toUpperCase()); // MONDAY, TUESDAY...

		return this.#prisma.$transaction(async (tx) => {
			// 1. Upsert the provider's core info
			const provider = await tx.provider.upsert({
				where: { id: providerId },
				update: { timezone, appointmentDuration },
				create: { id: providerId, timezone, appointmentDuration },
			});

			// 2. Delete existing schedules for days *not* included in the new input
			await tx.providerSchedule.deleteMany({
				where: {
					providerId: providerId,
					dayOfWeek: { notIn: days },
				},
			});

			// 3. Upsert schedules for the provided days
			for (const day of days) {
				const schedule = weeklySchedule[day.toLowerCase()]; // Get "09:00", "17:00"
				if (schedule) {
					await tx.providerSchedule.upsert({
						where: { providerId_dayOfWeek: { providerId, dayOfWeek: day } },
						update: { startTime: schedule.start, endTime: schedule.end },
						create: {
							providerId,
							dayOfWeek: day,
							startTime: schedule.start,
							endTime: schedule.end,
						},
					});
				}
			}

			// Fetch the updated provider with schedules to return
			const updatedProvider = await tx.provider.findUniqueOrThrow({
				where: { id: providerId },
				include: { schedules: true },
			});
			return updatedProvider;
		});
	}
}
