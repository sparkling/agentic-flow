import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { validateReadPath, validateWritePath, validateDirPath } from '../security/path-validator.js';

export interface SessionInfo {
  id: string;
  name?: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'ended' | 'archived';
  metrics: Record<string, number>;
}

export class SessionService {
  private static instance: SessionService | null = null;
  private sessionsDir: string;
  private currentSession: SessionInfo | null = null;

  private constructor() {
    this.sessionsDir = path.join(process.cwd(), '.claude-flow', 'sessions');
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  static resetInstance(): void {
    SessionService.instance = null;
  }

  startSession(name?: string): SessionInfo {
    const session: SessionInfo = {
      id: randomUUID(),
      name,
      startedAt: new Date().toISOString(),
      status: 'active',
      metrics: {},
    };
    this.currentSession = session;
    this.saveSession(session);
    return session;
  }

  restoreSession(id: string): SessionInfo | null {
    // CVE-2026-004 FIX: Validate path before reading
    const filePath = path.join(this.sessionsDir, `${id}.json`);

    try {
      const safePath = validateReadPath(filePath, this.sessionsDir);
      if (!fs.existsSync(safePath)) return null;
      const session = JSON.parse(fs.readFileSync(safePath, 'utf-8')) as SessionInfo;
      this.currentSession = session;
      return session;
    } catch (error) {
      // Path validation failed
      return null;
    }
  }

  endSession(): SessionInfo | null {
    if (!this.currentSession) return null;
    this.currentSession.endedAt = new Date().toISOString();
    this.currentSession.status = 'ended';
    this.saveSession(this.currentSession);
    const ended = { ...this.currentSession };
    this.currentSession = null;
    return ended;
  }

  getStatus(): SessionInfo | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  listSessions(): SessionInfo[] {
    if (!fs.existsSync(this.sessionsDir)) return [];
    const files = fs.readdirSync(this.sessionsDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(this.sessionsDir, f), 'utf-8')) as SessionInfo;
      } catch {
        return null;
      }
    }).filter((s): s is SessionInfo => s !== null);
  }

  recordMetric(key: string, value: number): boolean {
    if (!this.currentSession) return false;
    this.currentSession.metrics[key] = value;
    this.saveSession(this.currentSession);
    return true;
  }

  private saveSession(session: SessionInfo): void {
    // CVE-2026-004 FIX: Validate path before writing
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    const safePath = validateWritePath(filePath, this.sessionsDir);
    fs.writeFileSync(safePath, JSON.stringify(session, null, 2), 'utf-8');
  }
}
