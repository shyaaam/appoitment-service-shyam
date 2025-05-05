"use strict";

import { ZodError } from "zod";

// Base class for custom application errors
export class AppError extends Error {
	public readonly statusCode: number;
	public readonly code: string;
	public readonly details?: any;

	constructor(
		message: string,
		statusCode: number,
		code: string,
		details?: any,
	) {
		super(message);
		this.statusCode = statusCode;
		this.code = code;
		if (details !== undefined) {
			this.details = details;
		}

		// Maintains proper stack trace in V8. Reference: https://v8.dev/docs/stack-trace-api
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
		// Set the prototype explicitly.
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

// Specific error types
export class NotFoundError extends AppError {
	constructor(resource = "Resource") {
		super(`${resource} not found.`, 404, "NOT_FOUND");
	}
}

export class ConflictError extends AppError {
	constructor(message = "Conflict detected.") {
		super(message, 409, "CONFLICT");
	}
}

export class BadRequestError extends AppError {
	constructor(message = "Bad request.") {
		super(message, 400, "BAD_REQUEST");
	}
}

export class ValidationError extends AppError {
	// Specific error for validation failures from Zod
	constructor(errorDetails: ZodError) {
		super(
			"Validation failed",
			422,
			"VALIDATION_ERROR",
			ValidationError.formatErrors(errorDetails),
		);
	}

	// Custom method to format Zod errors
	private static formatErrors(
		errorDetails: ZodError,
	): Record<string, string[]> {
		const formattedErrors: Record<string, string[]> = {};

		// Iterate through the Zod error issues
		for (const issue of errorDetails.issues) {
			const path = issue.path.join("."); // Join nested paths with a dot (e.g., "weeklySchedule.start")
			if (!formattedErrors[path]) {
				formattedErrors[path] = [];
			}
			formattedErrors[path].push(issue.message); // Add the error message for the field
		}

		return formattedErrors;
	}
}

export class ForbiddenError extends AppError {
	constructor(message = "Forbidden") {
		super(message, 403, "FORBIDDEN");
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = "Unauthorized") {
		super(message, 401, "UNAUTHORIZED");
	}
}
