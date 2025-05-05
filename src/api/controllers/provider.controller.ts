import {
	type GetAvailabilityDto,
	type UpsertScheduleDto,
	getAvailabilitySchema,
	upsertScheduleSchema,
} from "@/api/validators/provider.validator";
import { Controller, Get, Post, ValidateBody } from "@/core/decorators";
import { container } from "@/core/diContainer";
import type { ProviderService } from "@/services/provider.service";
import type { AvailabilityResult, IController } from "@/types";
import type { Request, Response } from "express";

@Controller("/api/providers")
export class ProviderController implements IController {
	#providerService: ProviderService;

	constructor() {
		// Resolve dependencies from the container
		this.#providerService =
			container.resolve<ProviderService>("ProviderService");
	}

	@Post("/:providerId/schedule")
	@ValidateBody(upsertScheduleSchema)
	async upsertSchedule(
		req: Request<{ providerId: string }, UpsertScheduleDto>,
		res: Response,
	): Promise<void> {
		const { providerId } = req.params;
		const { weeklySchedule, timezone, appointmentDuration } = req.body;

		await this.#providerService.setSchedule(
			providerId,
			weeklySchedule,
			timezone,
			appointmentDuration,
		);

		res
			.status(200)
			.json({ message: "Provider schedule updated successfully." });
	}

	@Get("/:providerId/availability")
	async getAvailability(
		req: Request<{ providerId: string }, GetAvailabilityDto>,
		res: Response,
	): Promise<void> {
		// Basic validation of query params (more robust with Zod middleware if complex)
		const validationResult = getAvailabilitySchema.safeParse(req.query);
		if (!validationResult.success) {
			// Handle validation error - potentially throw BadRequestError or format response
			res.status(422).json({
				error: "Validation failed",
				details: validationResult.error.format(),
			});
			return;
		}
		const query = validationResult.data;
		const { providerId } = req.params;

		let result: AvailabilityResult;
		if (query.date) {
			const slots = await this.#providerService.getAvailableSlotsForDate(
				providerId,
				query.date,
			);
			result = {
				providerId,
				date: query.date,
				availableSlots: slots,
			};
		} else if (query.startDate && query.endDate) {
			result = await this.#providerService.listAvailableSlots(
				providerId,
				query.startDate,
				query.endDate,
			);
			// Structure for multi-date response could be adjusted based on desired format
			// result = { providerId, startDate: query.startDate, endDate: query.endDate, availability: multiDateResult };
		} else {
			// Should not happen due to Zod validation, but defensively handle
			res
				.status(400)
				.json({ error: "Invalid query parameters for availability." });
			return;
		}

		res.status(200).json(result);
	}
}
