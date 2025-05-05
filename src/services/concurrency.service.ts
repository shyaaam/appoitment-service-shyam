import { ConflictError } from "@/core/errors";

// Interface for a lock handle, allowing explicit release if needed (though executeWithLock is preferred)
// interface LockHandle {
//   key: string;
//   release: () => Promise<void>;
// }

/**
 * Provides mechanisms for handling concurrency, initially mocked in-memory.
 * NOTE: The in-memory implementation is NOT suitable for production environments
 * with multiple service instances. It should be replaced with a distributed
 * lock manager like Redis or Zookeeper for production use.
 */
export class ConcurrencyService {
	// In-memory store for locks: Map<lockKey, expiryTimestamp>
	#locks: Map<string, number>;

	constructor() {
		this.#locks = new Map<string, number>();
		// Optional: Start a simple interval to clean up expired locks from the map periodically
		// This is mainly for the in-memory version to prevent unbounded growth if release fails.
		// Redis handles TTL automatically.
		setInterval(() => this.cleanupExpiredLocks(), 60 * 1000); // Run every minute
	}

	/**
	 * Generates a standardized lock key.
	 * @param type - The type of resource being locked (e.g., 'appointment', 'provider').
	 * @param parts - Unique identifiers for the specific resource instance.
	 * @returns A formatted lock key string.
	 */
	generateLockKey(type: string, ...parts: string[]): string {
		return `lock:${type}:${parts.join(":")}`;
	}

	/**
	 * Attempts to acquire a lock for the given key with a specified TTL.
	 * @param key - The unique lock key.
	 * @param ttlMilliseconds - Time-to-live for the lock in milliseconds.
	 * @returns True if the lock was acquired, false otherwise.
	 */
	async acquireLock(key: string, ttlMilliseconds: number): Promise<boolean> {
		const now = Date.now();
		const expiry = now + ttlMilliseconds;

		// --- In-Memory Mock Implementation ---
		const existingLockExpiry = this.#locks.get(key);

		if (existingLockExpiry && existingLockExpiry > now) {
			// Lock exists and is not expired
			console.warn(`Lock Failed: Key "${key}" is already held.`);
			return false;
		}

		// Lock does not exist or has expired, attempt to acquire
		this.#locks.set(key, expiry);
		console.log(`Lock Acquired: Key "${key}", TTL: ${ttlMilliseconds}ms`);
		return true;
	}

	/**
	 * Releases the lock associated with the key.
	 * @param key - The unique lock key.
	 */
	async releaseLock(key: string): Promise<void> {
		// --- In-Memory Mock Implementation ---
		const deleted = this.#locks.delete(key);
		if (deleted) {
			console.log(`Lock Released: Key "${key}"`);
		}
	}

	/**
	 * Acquires a lock, executes a task, and releases the lock.
	 * Ensures the lock is released even if the task throws an error.
	 * @param key - The unique lock key.
	 * @param ttlMilliseconds - Time-to-live for the lock.
	 * @param task - The asynchronous function to execute while holding the lock.
	 * @throws {ConflictError} If the lock cannot be acquired initially.
	 * @returns The result of the task.
	 */
	async executeWithLock<T>(
		key: string,
		ttlMilliseconds: number,
		task: () => Promise<T>,
	): Promise<T> {
		const acquired = await this.acquireLock(key, ttlMilliseconds);

		if (!acquired) {
			// Could introduce a specific LockAcquisitionFailedError
			throw new ConflictError(
				`Failed to acquire lock for resource: ${key}. It might be locked by another operation.`,
			);
		}

		try {
			// Execute the critical section task
			const result = await task();
			return result;
		} catch (error) {
			// Re-throw the error from the task after attempting release
			console.error(
				`Error during locked task execution for key "${key}":`,
				error,
			);
			throw error;
		} finally {
			// Ensure lock is released, regardless of task success or failure
			await this.releaseLock(key);
		}
	}

	/**
	 * Simple cleanup for the in-memory lock store. Not needed for Redis.
	 */
	private cleanupExpiredLocks(): void {
		const now = Date.now();
		let cleanedCount = 0;
		for (const [key, expiry] of this.#locks.entries()) {
			if (expiry <= now) {
				this.#locks.delete(key);
				cleanedCount++;
			}
		}
		if (cleanedCount > 0) {
			console.log(
				`[ConcurrencyService] Cleaned up ${cleanedCount} expired in-memory locks.`,
			);
		}
	}
}

// Export a singleton instance for easy access via DI
export const concurrencyService = new ConcurrencyService();
