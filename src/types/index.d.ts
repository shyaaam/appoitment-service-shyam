export * from './prisma-client';

export type AppointmentEventType =
    | 'APPOINTMENT_CONFIRMED'
    | 'APPOINTMENT_CANCELLED'
    | 'APPOINTMENT_RESCHEDULED';
    
/**
 * Represents a string that is validated as a proper IANA timezone identifier.
 * Uses a branded type for compile-time safety.
 */
export type IANATimezone = string & { readonly __brand: 'IANATimezone' };