import { EventEmitter } from "node:events";
import type { AppointmentEventType } from "@/types";
import { v4 as uuidv4 } from "uuid";

export type AppointmentEventPayload = {
	appointmentId: string;
	patientId?: string;
	providerId?: string;
	appointmentTime?: string; // ISO String UTC
	newAppointmentTime?: string; // ISO String UTC
	previousAppointmentTime?: string; // ISO String UTC
	reason?: string;
};

// Interface matching the mocked dependency signature
export interface IEventService {
	emitEvent(
		eventType: AppointmentEventType,
		payload: AppointmentEventPayload,
	): Promise<void>;
}

/**
 * Simple Event Service using Node.js EventEmitter.
 * Designed to be easily replaceable with a production message queue client (Kafka, RabbitMQ, SQS).
 */
export class EventService implements IEventService {
	#emitter: EventEmitter;

	constructor() {
		this.#emitter = new EventEmitter();
		// Optional: Set up listeners for logging or other internal actions
		this.#emitter.on("appointmentEvent", (event) => {
			console.log(
				`[EVENT EMITTED] Type: ${event.eventType}, ID: ${event.eventId}, Timestamp: ${event.timestamp}`,
			);
			// console.log('[EVENT PAYLOAD]', event.payload);
		});
	}

	async emitEvent(
		eventType: AppointmentEventType,
		payload: AppointmentEventPayload,
	): Promise<void> {
		const event = {
			eventId: `evt_${uuidv4()}`, // Generate a unique event ID
			eventType: eventType,
			timestamp: new Date().toISOString(),
			payload: payload,
		};

		// In a real scenario, this is where you'd publish to Kafka/RabbitMQ/etc.
		// For example: await kafkaProducer.send({ topic: 'appointments', messages: [{ value: JSON.stringify(event) }] });
		// Or: channel.publish('appointment_exchange', eventType, Buffer.from(JSON.stringify(event)));

		// Using Node's EventEmitter for local simulation
		this.#emitter.emit("appointmentEvent", event);

		// Return immediately (async function simulates potential network call)
		return Promise.resolve();
	}

	// Method to allow other parts of the system to listen (e.g., for websockets, internal logging)
	// Use specific event names for clarity if needed
	addListener(
		eventName: string | symbol,
		listener: (...args: unknown[]) => void,
	): EventEmitter {
		return this.#emitter.addListener(eventName, listener);
	}

	removeListener(
		eventName: string | symbol,
		listener: (...args: unknown[]) => void,
	): EventEmitter {
		return this.#emitter.removeListener(eventName, listener);
	}
}

// Export a singleton instance for easy access via DI
export const eventService = new EventService();
