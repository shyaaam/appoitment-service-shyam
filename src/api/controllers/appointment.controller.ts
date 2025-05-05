import {
	type CreateAppointmentDto,
	type RescheduleAppointmentDto,
	createAppointmentSchema,
	rescheduleAppointmentSchema,
} from "@/api/validators/appointment.validator";
import {
	Controller,
	Delete,
	Get,
	Post,
	Put,
	ValidateBody,
} from "@/core/decorators";
import { container } from "@/core/diContainer";
import type { AppointmentService } from "@/services/appointment.service";
import type { IController } from "@/types";
import type { Request, Response } from "express";

@Controller("/api/appointments")
export class AppointmentController implements IController {
	#appointmentService: AppointmentService;

	constructor() {
		this.#appointmentService =
			container.resolve<AppointmentService>("AppointmentService");
	}

	@Post("/")
	@ValidateBody(createAppointmentSchema)
	async createAppointment(
		req: Request<Record<string, unknown>, CreateAppointmentDto>,
		res: Response,
	): Promise<void> {
		const { patientId, providerId, startTime } = req.body;

		const newAppointment = await this.#appointmentService.bookAppointment(
			patientId,
			providerId,
			startTime,
		);

		// Format response to match example
		res.status(201).json({
			appointmentId: newAppointment.id,
			status: newAppointment.status,
			patientId: newAppointment.patientId,
			providerId: newAppointment.providerId,
			startTime: newAppointment.startTime.toISOString(),
			endTime: newAppointment.endTime.toISOString(),
		});
	}

	@Put("/:appointmentId")
	@ValidateBody(rescheduleAppointmentSchema)
	async rescheduleAppointment(
		req: Request<{ appointmentId: string }, RescheduleAppointmentDto>,
		res: Response,
	): Promise<void> {
		const { appointmentId } = req.params;
		const { startTime } = req.body;

		const updatedAppointment =
			await this.#appointmentService.rescheduleAppointment(
				appointmentId,
				startTime,
			);

		res.status(200).json({
			appointmentId: updatedAppointment.id,
			status: updatedAppointment.status,
			patientId: updatedAppointment.patientId,
			providerId: updatedAppointment.providerId,
			startTime: updatedAppointment.startTime.toISOString(),
			endTime: updatedAppointment.endTime.toISOString(),
		});
	}

	@Delete("/:appointmentId")
	async cancelAppointment(
		req: Request<{ appointmentId: string }>,
		res: Response,
	): Promise<void> {
		const { appointmentId } = req.params;
		// Optional: Allow reason from query or body
		const reason = (req.query.reason as string) || "CLIENT_REQUEST";

		await this.#appointmentService.cancelAppointment(appointmentId, reason);

		res.status(200).json({ message: "Appointment cancelled successfully." });
		// Or return 204 No Content
		// res.status(204).send();
	}

	@Get("/:appointmentId")
	async getAppointment(
		req: Request<{ appointmentId: string }>,
		res: Response,
	): Promise<void> {
		const { appointmentId } = req.params;
		const appointment =
			await this.#appointmentService.getAppointmentById(appointmentId);

		res.status(200).json({
			appointmentId: appointment.id,
			status: appointment.status,
			patientId: appointment.patientId,
			providerId: appointment.providerId,
			startTime: appointment.startTime.toISOString(),
			endTime: appointment.endTime.toISOString(),
			createdAt: appointment.createdAt.toISOString(),
			updatedAt: appointment.updatedAt.toISOString(),
		});
	}
}
