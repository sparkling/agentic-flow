/**
 * Session Tools Integration Tests
 *
 * Tests the SessionService singleton for session lifecycle management:
 * start, restore, end, status, list, and metrics recording.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionService } from '../../agentic-flow/src/services/session-service';

describe('Session Tools Integration', () => {
  beforeEach(() => {
    SessionService.resetInstance();
  });

  describe('session_start', () => {
    it('starts a session with a name', () => {
      const svc = SessionService.getInstance();
      const session = svc.startSession('test-session');
      expect(session.id).toBeTruthy();
      expect(session.name).toBe('test-session');
      expect(session.status).toBe('active');
      expect(session.startedAt).toBeTruthy();
    });

    it('starts a session without a name', () => {
      const svc = SessionService.getInstance();
      const session = svc.startSession();
      expect(session.id).toBeTruthy();
      expect(session.status).toBe('active');
    });
  });

  describe('session_restore', () => {
    it('restores an existing session by ID', () => {
      const svc = SessionService.getInstance();
      const created = svc.startSession('restorable');
      const restored = svc.restoreSession(created.id);
      expect(restored).not.toBeNull();
      expect(restored!.id).toBe(created.id);
      expect(restored!.name).toBe('restorable');
    });

    it('returns null for non-existent session', () => {
      const svc = SessionService.getInstance();
      const result = svc.restoreSession('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('session_end', () => {
    it('ends an active session', () => {
      const svc = SessionService.getInstance();
      svc.startSession('to-end');
      const ended = svc.endSession();
      expect(ended).not.toBeNull();
      expect(ended!.status).toBe('ended');
      expect(ended!.endedAt).toBeTruthy();
    });

    it('returns null when no active session', () => {
      const svc = SessionService.getInstance();
      const result = svc.endSession();
      expect(result).toBeNull();
    });
  });

  describe('session_status', () => {
    it('returns current session info', () => {
      const svc = SessionService.getInstance();
      svc.startSession('status-check');
      const status = svc.getStatus();
      expect(status).not.toBeNull();
      expect(status!.name).toBe('status-check');
    });

    it('returns null when no active session', () => {
      const svc = SessionService.getInstance();
      expect(svc.getStatus()).toBeNull();
    });
  });

  describe('session_list', () => {
    it('lists all sessions', () => {
      const svc = SessionService.getInstance();
      svc.startSession('list-1');
      svc.endSession();
      svc.startSession('list-2');
      const sessions = svc.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('session_metric', () => {
    it('records a metric to active session', () => {
      const svc = SessionService.getInstance();
      svc.startSession('metrics-test');
      const recorded = svc.recordMetric('latency', 42);
      expect(recorded).toBe(true);
      const status = svc.getStatus();
      expect(status!.metrics['latency']).toBe(42);
    });

    it('returns false when no active session', () => {
      const svc = SessionService.getInstance();
      expect(svc.recordMetric('key', 1)).toBe(false);
    });

    it('overwrites existing metric value', () => {
      const svc = SessionService.getInstance();
      svc.startSession('overwrite-test');
      svc.recordMetric('count', 1);
      svc.recordMetric('count', 5);
      expect(svc.getStatus()!.metrics['count']).toBe(5);
    });
  });
});
