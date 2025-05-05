import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { ConcurrencyService } from '@/services/concurrency.service';
import { ConflictError } from '@/core/errors';

type MockConcurrencyService = {
  acquireLock: jest.MockedFunction<ConcurrencyService['acquireLock']>;
  releaseLock: jest.MockedFunction<ConcurrencyService['releaseLock']>;
  executeWithLock: jest.MockedFunction<ConcurrencyService['executeWithLock']>;
  cleanupExpiredLocks: jest.MockedFunction<ConcurrencyService['cleanupExpiredLocks']>;
}

describe('ConcurrencyService', () => {
  let concurrencyService: ConcurrencyService;
  
  beforeEach(() => {
    // Create a fresh instance for each test to avoid state leakage
    concurrencyService = new ConcurrencyService();
    
    // Mock console methods to prevent logging during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('generateLockKey', () => {
    it('should generate correct lock key format', () => {
      const key = concurrencyService.generateLockKey('appointment', 'appt-123');
      expect(key).toBe('lock:appointment:appt-123');
    });
    
    it('should handle multiple parts', () => {
      const key = concurrencyService.generateLockKey('provider', 'prov-123', 'slot', '2025-06-15T10:00Z');
      expect(key).toBe('lock:provider:prov-123:slot:2025-06-15T10:00Z');
    });
  });
  
  describe('acquireLock', () => {
    it('should successfully acquire a lock when none exists', async () => {
      const lockKey = 'lock:test:resource-1';
      const result = await concurrencyService.acquireLock(lockKey, 1000);
      expect(result).toBe(true);
    });
    
    it('should fail to acquire a lock when one already exists', async () => {
      const lockKey = 'lock:test:resource-2';
      // First acquire the lock
      await concurrencyService.acquireLock(lockKey, 1000);
      // Then try to acquire it again
      const result = await concurrencyService.acquireLock(lockKey, 1000);
      expect(result).toBe(false);
    });
    
    it('should acquire a lock after previous one expires', async () => {
      const lockKey = 'lock:test:resource-3';
      // Acquire lock with short TTL
      await concurrencyService.acquireLock(lockKey, 10);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Should be able to acquire again
      const result = await concurrencyService.acquireLock(lockKey, 1000);
      expect(result).toBe(true);
    });
  });
  
  describe('releaseLock', () => {
    it('should successfully release a lock', async () => {
      const lockKey = 'lock:test:resource-4';
      
      // First acquire the lock
      await concurrencyService.acquireLock(lockKey, 1000);
      
      // Then release it
      await concurrencyService.releaseLock(lockKey);
      
      // Should be able to acquire it again immediately
      const result = await concurrencyService.acquireLock(lockKey, 1000);
      expect(result).toBe(true);
    });
    
    it('should do nothing when releasing a non-existent lock', async () => {
      const lockKey = 'lock:test:does-not-exist';
      
      // Just assert it doesn't throw
      await expect(concurrencyService.releaseLock(lockKey)).resolves.toBeUndefined();
    });
  });
  
  describe('executeWithLock', () => {
    it('should execute the provided task while holding the lock', async () => {
      const lockKey = 'lock:test:resource-5';
      const task = jest.fn<() => Promise<unknown>>().mockResolvedValue('task-result');
      
      const result = await concurrencyService.executeWithLock(lockKey, 1000, task);
      
      expect(task).toHaveBeenCalledTimes(1);
      expect(result).toBe('task-result');
    });
    
    it('should release the lock after task completes successfully', async () => {
      const lockKey = 'lock:test:resource-6';
      const task = jest.fn<() => Promise<unknown>>().mockResolvedValue('task-result');
      
      await concurrencyService.executeWithLock(lockKey, 1000, task);
      
      // Should be able to acquire again immediately
      const lockResult = await concurrencyService.acquireLock(lockKey, 1000);
      expect(lockResult).toBe(true);
    });
    
    it('should release the lock even if task throws error', async () => {
      const lockKey = 'lock:test:resource-7';
      const error = new Error('Task failed');
      const task = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);
      
      // Task should fail, but lock should be released
      await expect(concurrencyService.executeWithLock(lockKey, 1000, task))
        .rejects.toThrow(error);
      
      // Should be able to acquire again
      const lockResult = await concurrencyService.acquireLock(lockKey, 1000);
      expect(lockResult).toBe(true);
    });
    
    it('should throw ConflictError if lock cannot be acquired', async () => {
      const lockKey = 'lock:test:resource-8';
      const task = jest.fn<() => Promise<unknown>>().mockResolvedValue('task-result');
      
      // Mock acquireLock to return false (lock acquisition failed)
      jest.spyOn(concurrencyService, 'acquireLock').mockResolvedValue(false);
      
      await expect(concurrencyService.executeWithLock(lockKey, 1000, task))
        .rejects.toThrow(ConflictError);
      
      // Task should not have been executed
      expect(task).not.toHaveBeenCalled();
    });
  });
  
  describe('cleanupExpiredLocks', () => {
    it('should remove expired locks during cleanup', async () => {
      // This test accesses a private method
      const lockKey = 'lock:test:resource-9';
      
      // Add a lock with very short TTL
      await concurrencyService.acquireLock(lockKey, 10);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Directly invoke the private method using any
      (concurrencyService as any).cleanupExpiredLocks();
      
      // Now check if the lock was removed by trying to acquire it
      const result = await concurrencyService.acquireLock(lockKey, 1000);
      expect(result).toBe(true);
    });
  });
});