export * from "./prisma-client";

export type AppointmentEventType =
	| "APPOINTMENT_CONFIRMED"
	| "APPOINTMENT_CANCELLED"
	| "APPOINTMENT_RESCHEDULED";

/**
 * Represents a string that is validated as a proper IANA timezone identifier.
 * Uses a branded type for compile-time safety.
 */
export type IANATimezone = string & { readonly __brand: "IANATimezone" };

export type AvailabilityResult =
	| {
			providerId: string;
			date: string;
			availableSlots: string[];
	  }
	| Array<{
			date: string;
			availableSlots: string[];
	  }>
	| { [date: string]: string[] };

/**
 * Represents a prototype object with string keys and values of any type.
 * This defines Prototype as a type alias for the built-in object type, representing any non-primitive type (i.e., anything that's not number, string, boolean, etc.).
 * In method decorators: target parameter represents the prototype of the class containing the decorated method
 * For instance methods: target = class prototype (MyClass.prototype)
 * For static methods: target = constructor function (MyClass itself)
 */
export type Prototype = object;

// No specific methods are enforced here due to the decorator-based routing.
// If registration were manual, this might include a method like:
// registerRoutes(router: Router): void;
// But this interface is more about being a marker for DI or other purposes, and also allows for future extension as logic grows.
// An empty interface is used to indicate that this is a marker interface and can be written as an empty object.
export type IController = Prototype;
export type ControllerHandler = (
	req: Request,
	res: Response,
	next?: NextFunction,
) => Promise<void> | void;
