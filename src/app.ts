import express, {
	type Express,
	type Request,
	type Response,
	type NextFunction,
	Router,
} from "express";
import helmet from "helmet"; // Basic security headers
import { registerControllers } from "./core/decorators";
import { AppError, NotFoundError } from "./core/errors";

import { AppointmentController } from "./api/controllers/appointment.controller";
// --- Import Controllers ---
import { ProviderController } from "./api/controllers/provider.controller";

import { container } from "./core/diContainer";
// --- Import Services and Repositories for DI ---
import prisma, { disconnectPrisma } from "./lib/prismaClient";
import { AppointmentRepository } from "./repositories/appointment.repository";
import { ProviderRepository } from "./repositories/provider.repository";
import { AppointmentService } from "./services/appointment.service";
import {
	ConcurrencyService,
	concurrencyService,
} from "./services/concurrency.service";
import { EventService, eventService } from "./services/event.service"; // Use singleton instance
import { ProviderService } from "./services/provider.service";

export function createApp(): Express {
	const app: Express = express();

	// --- Dependency Injection Setup ---
	console.log("Registering dependencies...");
	const providerRepository = new ProviderRepository(prisma);
	const appointmentRepository = new AppointmentRepository(prisma);
	// EventService instance is already created (singleton)

	const providerService = new ProviderService(
		providerRepository,
		appointmentRepository,
	);
	const appointmentService = new AppointmentService(
		appointmentRepository,
		providerService,
		eventService,
		concurrencyService,
	);

	container.register("PrismaClient", prisma); // Register prisma if needed elsewhere
	container.register("ProviderRepository", providerRepository);
	container.register("AppointmentRepository", appointmentRepository);
	container.register("EventService", eventService);
	container.register("ConcurrencyService", concurrencyService);
	container.register("ProviderService", providerService);
	container.register("AppointmentService", appointmentService);
	console.log("Dependencies registered.");

	// --- Core Middleware ---
	app.use(helmet()); // Set various security HTTP headers
	app.use(express.json()); // Parse JSON bodies
	app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

	// --- API Routes ---
	console.log("Registering controllers...");
	const apiRouter = Router();
	registerControllers(apiRouter, [
		ProviderController,
		AppointmentController,
		// Add other controllers here
	]);
	app.use(apiRouter); // Mount the API routes
	console.log("Controllers registered.");

	// --- Health Check Endpoint ---
	app.get("/health", (req: Request, res: Response) => {
		res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
	});

	// --- 404 Handler ---
	// Catch-all for routes not handled above
	app.use((req: Request, res: Response, next: NextFunction) => {
		next(new NotFoundError(`Route: ${req.method} ${req.path}`));
	});

	// --- Global Error Handler ---
	// Must have 4 arguments to be recognized by Express as an error handler
	app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
		console.error("Unhandled Error:", err); // Log the error details

		if (err instanceof AppError) {
			// Handle known application errors (like NotFound, Conflict, Validation)
			const errorResponsePayload: {
				message: string;
				code: string;
				details?: unknown;
			} = {
				message: err.message,
				code: err.code,
			};

			// Check if the error has details and add them
			if (err.details !== undefined) {
				errorResponsePayload.details = err.details;
			}

			res.status(err.statusCode).json({
				error: errorResponsePayload, // Send the potentially augmented payload
			});
		} else {
			// Handle unexpected errors
			res.status(500).json({
				error: {
					message: "An internal server error occurred.",
					code: "INTERNAL_SERVER_ERROR",
				},
			});
		}
	});

	// --- Graceful Shutdown Logic ---
	process.on("SIGTERM", async () => {
		console.log(
			"SIGTERM signal received: closing HTTP server and DB connection.",
		);
		await disconnectPrisma();
		// Close server etc. (handled in server.ts)
		process.exit(0);
	});

	process.on("SIGINT", async () => {
		console.log(
			"SIGINT signal received: closing HTTP server and DB connection.",
		);
		await disconnectPrisma();
		process.exit(0);
	});

	return app;
}
