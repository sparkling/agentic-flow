/**
 * Rate Limiting Security Module
 * Prevents DoS attacks (VUL-010)
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (context: any) => string;
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be allowed
   */
  async consume(key: string = 'default'): Promise<RateLimitInfo> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create request history for this key
    let history = this.requests.get(key) || [];

    // Remove expired requests
    history = history.filter((timestamp) => timestamp > windowStart);

    // Check if limit exceeded
    if (history.length >= this.config.maxRequests) {
      const oldestRequest = Math.min(...history);
      const retryAfter = Math.ceil((oldestRequest + this.config.windowMs - now) / 1000);

      throw new RateLimitError(
        `Rate limit exceeded: max ${this.config.maxRequests} requests per ${this.config.windowMs / 1000}s`,
        {
          remaining: 0,
          resetTime: oldestRequest + this.config.windowMs,
          retryAfter,
        }
      );
    }

    // Add current request
    history.push(now);
    this.requests.set(key, history);

    return {
      remaining: this.config.maxRequests - history.length,
      resetTime: now + this.config.windowMs,
    };
  }

  /**
   * Get current limit status without consuming
   */
  getStatus(key: string = 'default'): RateLimitInfo {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const history = (this.requests.get(key) || []).filter(
      (timestamp) => timestamp > windowStart
    );

    return {
      remaining: this.config.maxRequests - history.length,
      resetTime: now + this.config.windowMs,
    };
  }

  /**
   * Reset limit for a specific key
   */
  reset(key: string = 'default'): void {
    this.requests.delete(key);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, history] of this.requests.entries()) {
      const validRequests = history.filter((timestamp) => timestamp > windowStart);

      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public info: RateLimitInfo
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Pre-configured rate limiters for different use cases
export const orchestrationLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000, // 10 requests per minute
});

export const memoryOperationLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 100 operations per minute
});

export const fileOperationLimiter = new RateLimiter({
  maxRequests: 50,
  windowMs: 60000, // 50 file ops per minute
});

/**
 * Max concurrent runs tracker
 */
export class ConcurrencyLimiter {
  private activeRuns: Set<string> = new Set();
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 100) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Acquire a run slot
   */
  acquire(runId: string): void {
    if (this.activeRuns.size >= this.maxConcurrent) {
      throw new Error(
        `Maximum concurrent runs (${this.maxConcurrent}) exceeded. Active: ${this.activeRuns.size}`
      );
    }

    this.activeRuns.add(runId);
  }

  /**
   * Release a run slot
   */
  release(runId: string): void {
    this.activeRuns.delete(runId);
  }

  /**
   * Get current status
   */
  getStatus(): { active: number; available: number; max: number } {
    return {
      active: this.activeRuns.size,
      available: this.maxConcurrent - this.activeRuns.size,
      max: this.maxConcurrent,
    };
  }
}

export const concurrencyLimiter = new ConcurrencyLimiter(100);
