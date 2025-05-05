import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { EventService, AppointmentEventPayload } from '@/services/event.service';
import { EventEmitter } from 'events';
import { AppointmentEventType } from '@/types';

describe('EventService', () => {
  let eventService: EventService;
  
  beforeEach(() => {
    // Create fresh service instance for each test
    eventService = new EventService();
    
    // Mock console.log to avoid noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('emitEvent', () => {
    it('should emit an event with the correct structure', async () => {
      // Mock the internal EventEmitter.emit method
      const emitSpy = jest.spyOn(EventEmitter.prototype, 'emit');
      
      const eventType: AppointmentEventType = 'APPOINTMENT_CONFIRMED';
      const payload: AppointmentEventPayload = {
        appointmentId: 'appt-123',
        patientId: 'patient-456',
        providerId: 'provider-789',
        appointmentTime: '2025-06-15T14:30:00Z'
      };
      
      await eventService.emitEvent(eventType, payload);
      
      // Verify that emit was called with correct parameters
      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('appointmentEvent', expect.objectContaining({
        eventType,
        payload
      }));
      
      // Verify event structure
      const emittedEvent = emitSpy.mock.calls[0][1];
      expect(emittedEvent).toMatchObject({
        eventId: expect.stringMatching(/^evt_/), // Should start with evt_
        eventType,
        timestamp: expect.any(String), // ISO timestamp string
        payload
      });
    });
    
    it('should resolve the promise after emitting the event', async () => {
      const result = await eventService.emitEvent('APPOINTMENT_CANCELLED', {
        appointmentId: 'appt-123',
        reason: 'Patient request'
      });
      
      expect(result).toBeUndefined(); // Should resolve with no value
    });
  });
  
  describe('addListener', () => {
    it('should add a listener to the event emitter', () => {
      const listenerFn = jest.fn();
      const addListenerSpy = jest.spyOn(EventEmitter.prototype, 'addListener');
      
      eventService.addListener('appointmentEvent', listenerFn);
      
      expect(addListenerSpy).toHaveBeenCalledWith('appointmentEvent', listenerFn);
    });
    
    it('should invoke the listener when event is emitted', async () => {
      const listenerFn = jest.fn();
      eventService.addListener('appointmentEvent', listenerFn);
      
      const eventPayload = { appointmentId: 'appt-123' };
      await eventService.emitEvent('APPOINTMENT_RESCHEDULED', eventPayload);
      
      expect(listenerFn).toHaveBeenCalledTimes(1);
      expect(listenerFn).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'APPOINTMENT_RESCHEDULED',
        payload: eventPayload
      }));
    });
  });
  
  describe('removeListener', () => {
    it('should remove a listener from the event emitter', () => {
      const listenerFn = jest.fn();
      const removeListenerSpy = jest.spyOn(EventEmitter.prototype, 'removeListener');
      
      eventService.removeListener('appointmentEvent', listenerFn);
      
      expect(removeListenerSpy).toHaveBeenCalledWith('appointmentEvent', listenerFn);
    });
    
    it('should stop invoking the listener after removal', async () => {
      const listenerFn = jest.fn();
      
      // Add the listener
      eventService.addListener('appointmentEvent', listenerFn);
      
      // Emit first event
      await eventService.emitEvent('APPOINTMENT_CONFIRMED', { appointmentId: 'appt-123' });
      expect(listenerFn).toHaveBeenCalledTimes(1);
      
      // Remove the listener
      eventService.removeListener('appointmentEvent', listenerFn);
      
      // Emit second event
      await eventService.emitEvent('APPOINTMENT_CANCELLED', { appointmentId: 'appt-123' });
      
      // Listener should still have been called only once
      expect(listenerFn).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Event Types', () => {
    it('should handle APPOINTMENT_CONFIRMED events', async () => {
      const emitSpy = jest.spyOn(EventEmitter.prototype, 'emit');
      
      await eventService.emitEvent('APPOINTMENT_CONFIRMED', {
        appointmentId: 'appt-123',
        patientId: 'patient-456',
        providerId: 'provider-789',
        appointmentTime: '2025-06-15T14:30:00Z'
      });
      
      expect(emitSpy).toHaveBeenCalledWith('appointmentEvent', expect.objectContaining({
        eventType: 'APPOINTMENT_CONFIRMED'
      }));
    });
    
    it('should handle APPOINTMENT_CANCELLED events', async () => {
      const emitSpy = jest.spyOn(EventEmitter.prototype, 'emit');
      
      await eventService.emitEvent('APPOINTMENT_CANCELLED', {
        appointmentId: 'appt-123',
        reason: 'Patient request'
      });
      
      expect(emitSpy).toHaveBeenCalledWith('appointmentEvent', expect.objectContaining({
        eventType: 'APPOINTMENT_CANCELLED'
      }));
    });
    
    it('should handle APPOINTMENT_RESCHEDULED events', async () => {
      const emitSpy = jest.spyOn(EventEmitter.prototype, 'emit');
      
      await eventService.emitEvent('APPOINTMENT_RESCHEDULED', {
        appointmentId: 'appt-123',
        previousAppointmentTime: '2025-06-15T14:30:00Z',
        newAppointmentTime: '2025-06-16T10:00:00Z'
      });
      
      expect(emitSpy).toHaveBeenCalledWith('appointmentEvent', expect.objectContaining({
        eventType: 'APPOINTMENT_RESCHEDULED'
      }));
    });
  });
});