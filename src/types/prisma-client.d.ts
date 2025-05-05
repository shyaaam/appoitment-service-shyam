import type { Prisma } from "@prisma/client";

// Extend the Prisma namespace to include custom types for Provider modal, mainly to be used in seed and test
export type ProviderWithSchedules = Prisma.ProviderGetPayload<{
	include: { schedules: true };
}>;
