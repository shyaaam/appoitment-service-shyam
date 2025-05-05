import "reflect-metadata";
import type { ControllerHandler, IController, Prototype } from "@/types";
import type { NextFunction, Request, Response, Router } from "express";
import { ZodError, type ZodSchema } from "zod";
import { AppError, BadRequestError, ValidationError } from "./errors"; // Import AppError

// --- Metadata Keys (using Symbols for uniqueness to prevent name collissions) ---
const ROUTE_METADATA_KEY = Symbol("routeMetadata");
const CONTROLLER_PATH_KEY = Symbol("controllerPath");
// *** Dedicated key for validation schema on the method itself ***
const VALIDATION_SCHEMA_KEY = Symbol("validationSchema");

// --- Types ---
interface RouteDefinition {
	path: string;
	method: "get" | "post" | "put" | "delete" | "patch";
	handlerName: string | symbol;
}

// --- Decorators ---

export function Controller(path: string): ClassDecorator {
	return (target: Prototype) => {
		Reflect.defineMetadata(CONTROLLER_PATH_KEY, path, target);
	};
}

const createRouteDecorator =
	(method: RouteDefinition["method"]) =>
	(path: string): MethodDecorator => {
		return <T extends Prototype>(
			target: T,
			propertyKey: keyof T | string | symbol,
			descriptor: PropertyDescriptor,
		) => {
			const routes: RouteDefinition[] =
				Reflect.getMetadata(ROUTE_METADATA_KEY, target.constructor) || [];
			// Add route definition *without* the schema here which is stored on the method itself
			// This allows us to keep the route metadata clean and separate from validation logic
			// NOTE: We could also use a more complex structure to store the schema here if needed
			// but for now, we keep it simple.
			routes.push({
				path,
				method,
				handlerName: propertyKey as string | symbol,
			});
			Reflect.defineMetadata(ROUTE_METADATA_KEY, routes, target.constructor);
		};
	};

export const Get = createRouteDecorator("get");
export const Post = createRouteDecorator("post");
export const Put = createRouteDecorator("put");
export const Delete = createRouteDecorator("delete");

/**
 * Method Decorator: Associates a Zod schema directly with the controller method
 * using dedicated metadata.
 * @param schema - The Zod schema for validating req.body
 */
export function ValidateBody(schema: ZodSchema<unknown>): MethodDecorator {
	return (
		target: Prototype,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		// Store the schema using the dedicated key on the method
		Reflect.defineMetadata(VALIDATION_SCHEMA_KEY, schema, target, propertyKey);
		console.log(
			`@ValidateBody: Attached schema metadata to method ${String(propertyKey)}`,
		);
	};
}

// --- Router Registration Logic ---

export function registerControllers(
	appOrRouter: Router,
	controllers: (new () => IController)[],
) {
	for (const controllerClass of controllers) {
		// Instantiate using 'new' assumes parameterless constructor or resolution happens elsewhere (like our simple DI)
		// If using a complex DI framework, you'd resolve the instance here.
		const instance = new controllerClass();

		const basePath = Reflect.getMetadata(CONTROLLER_PATH_KEY, controllerClass);
		const routes: RouteDefinition[] = Reflect.getMetadata(
			ROUTE_METADATA_KEY,
			controllerClass,
		);

		if (!basePath || !routes) {
			// console.warn(`Controller ${controllerClass.name} might be missing @Controller or route decorators.`);
			return; // Skip if no routes defined
		}

		for (const { path, method, handlerName } of routes) {
			const fullPath = basePath + path;

			const methodHandlerFunc = instance[handlerName as keyof IController];
			// Ensure the handler actually exists on the instance prototype
			if (typeof methodHandlerFunc !== "function") {
				console.error(
					`Handler ${String(handlerName)} not found on controller ${controllerClass.name}`,
				);
				return;
			}
			const handler = (methodHandlerFunc as ControllerHandler).bind(instance);

			// *** Explicitly retrieve the schema using the dedicated key from the method ***
			const validationSchema = Reflect.getMetadata(
				VALIDATION_SCHEMA_KEY,
				instance,
				handlerName,
			) as ZodSchema<unknown> | undefined;

			// Middleware for validation
			// For a prod app, middlewares should be more robust, potentially using a library like express-validator or similar
			// This is a simple example using Zod for validation
			// NOTE: This middleware will run before the route handler
			// and will validate the request body against the schema if it exists.
			const validationMiddleware = (
				req: Request,
				res: Response,
				next: NextFunction,
			) => {
				// Log entry into middleware and whether schema was found
				console.log(
					`Validation check for: ${req.method} ${req.originalUrl} - Schema Found: ${!!validationSchema}`,
				);

				if (!validationSchema) {
					return next(); // Skip if no schema attached to this method
				}

				try {
					console.log(
						`Attempting validation for ${req.method} ${req.originalUrl} with body:`,
						req.body,
					);
					req.body = validationSchema.parse(req.body); // Validate and potentially transform
					console.log(
						`Validation SUCCESS for ${req.method} ${req.originalUrl}`,
					);
					next();
				} catch (error) {
					console.error(
						`Validation FAILED for ${req.method} ${req.originalUrl}:`,
						error instanceof ZodError ? error.format() : error,
					);
					if (error instanceof ZodError) {
						// Pass structured validation errors
						next(new ValidationError(error));
					} else {
						// Pass other unexpected errors (e.g., programming errors in schema)
						next(
							error instanceof AppError
								? error
								: new BadRequestError("Invalid request body structure."),
						);
					}
				}
			};

			// Register the route with Express, ensuring validation middleware runs first
			console.log(
				`Registering route: ${method.toUpperCase()} ${fullPath} (Validation: ${!!validationSchema})`,
			);
			appOrRouter[method](
				fullPath,
				validationMiddleware,
				async (req: Request, res: Response, next: NextFunction) => {
					try {
						await handler(req, res, next);
					} catch (error) {
						next(error); // Pass errors from handler to global error handler
					}
				},
			);
		}
	}
}

// --- Simple Memoization Decorator ---
// NOTE: Basic in-memory memoization. Consider cache size, invalidation strategies.
const memoizationCache = new Map<string, { value: unknown; expiry: number }>();
const MEMOIZE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function Memoize(ttlMs: number = MEMOIZE_TTL_MS): MethodDecorator {
	return (
		target: unknown,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const originalMethod = descriptor.value;
		if (typeof originalMethod !== "function") {
			throw new Error("@Memoize can only be applied to methods.");
		}

		descriptor.value = function (...args: unknown[]) {
			// Simple key generation based on function name and stringified args.
			// Might not be robust for complex objects.
			const cacheKey = `memo_${String(propertyKey)}_${JSON.stringify(args)}`;
			const now = Date.now();
			const cached = memoizationCache.get(cacheKey);

			if (cached && cached.expiry > now) {
				console.log(`Cache hit for: ${cacheKey}`);
				return cached.value; // Return cached value
			}

			console.log(`Cache miss for: ${cacheKey}`);
			const result = originalMethod.apply(this, args);

			// Handle promises - cache the resolved value
			if (result instanceof Promise) {
				return result
					.then((resolvedValue) => {
						memoizationCache.set(cacheKey, {
							value: resolvedValue,
							expiry: now + ttlMs,
						});
						// Basic cache cleanup (similar to rate limit)
						if (Math.random() < 0.05) {
							for (const [k, v] of memoizationCache.entries()) {
								if (v.expiry <= now) {
									memoizationCache.delete(k);
								}
							}
						}
						return resolvedValue;
					})
					.catch((err) => {
						// Don't cache errors by default, or handle specific cacheable errors
						throw err;
					});
			}

			// Cache synchronous results
			memoizationCache.set(cacheKey, { value: result, expiry: now + ttlMs });
			if (Math.random() < 0.05) {
				/* ... cleanup ... */
			}
			return result;
		};
	};
}
