/**
 * Rate Limiter Middleware for MCP Tools
 *
 * Implements token bucket algorithm to prevent DoS attacks on MCP endpoints.
 * Default: 100 requests per minute per client (identified by auth.userId or IP)
 *
 * Security Fix: Addresses HIGH-003 (Rate Limiting & DoS - INSUFFICIENT)
 */

interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   * @default 100
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs: number;

  /**
   * Whether to block or just warn on rate limit exceeded
   * @default true
   */
  blockOnExceed: boolean;

  /**
   * Custom message when rate limit is exceeded
   * @default "Rate limit exceeded. Please try again later."
   */
  message?: string;
}

interface ClientBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private buckets: Map<string, ClientBucket>;
  private readonly refillRate: number; // tokens per ms

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequests: config?.maxRequests ?? 100,
      windowMs: config?.windowMs ?? 60000,
      blockOnExceed: config?.blockOnExceed ?? true,
      message: config?.message ?? 'Rate limit exceeded. Please try again later.'
    };

    this.buckets = new Map();
    this.refillRate = this.config.maxRequests / this.config.windowMs;

    // Cleanup old buckets every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a request should be allowed
   * @param clientId Unique identifier for the client (userId or IP)
   * @returns Object with allowed status and remaining tokens
   */
  public checkLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      // New client - create bucket with full capacity
      bucket = {
        tokens: this.config.maxRequests,
        lastRefill: now
      };
      this.buckets.set(clientId, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    bucket.tokens = Math.min(this.config.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request can proceed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: now + ((this.config.maxRequests - bucket.tokens) / this.refillRate)
      };
    }

    // Rate limit exceeded
    const resetAt = now + ((1 - bucket.tokens) / this.refillRate);
    return {
      allowed: false,
      remaining: 0,
      resetAt: Math.ceil(resetAt)
    };
  }

  /**
   * Middleware function for MCP tool execution
   * @param clientId Unique identifier for the client
   * @param toolName Name of the tool being executed
   * @returns Promise that resolves if allowed, rejects if rate limited
   */
  public async middleware(
    clientId: string,
    toolName: string
  ): Promise<{ remaining: number; resetAt: number }> {
    const result = this.checkLimit(clientId);

    if (!result.allowed && this.config.blockOnExceed) {
      const error: any = new Error(this.config.message);
      error.code = 'RATE_LIMIT_EXCEEDED';
      error.remaining = result.remaining;
      error.resetAt = result.resetAt;
      error.toolName = toolName;
      error.clientId = clientId;
      throw error;
    }

    return {
      remaining: result.remaining,
      resetAt: result.resetAt
    };
  }

  /**
   * Get current rate limit status for a client
   * @param clientId Unique identifier for the client
   * @returns Current bucket state
   */
  public getStatus(clientId: string): { tokens: number; maxTokens: number; resetAt: number } {
    const now = Date.now();
    const bucket = this.buckets.get(clientId);

    if (!bucket) {
      return {
        tokens: this.config.maxRequests,
        maxTokens: this.config.maxRequests,
        resetAt: now
      };
    }

    // Calculate current tokens with refill
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    const currentTokens = Math.min(this.config.maxRequests, bucket.tokens + tokensToAdd);

    return {
      tokens: Math.floor(currentTokens),
      maxTokens: this.config.maxRequests,
      resetAt: now + ((this.config.maxRequests - currentTokens) / this.refillRate)
    };
  }

  /**
   * Reset rate limit for a specific client
   * @param clientId Unique identifier for the client
   */
  public reset(clientId: string): void {
    this.buckets.delete(clientId);
  }

  /**
   * Reset all rate limits (admin function)
   */
  public resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Cleanup old buckets that haven't been used in 10 minutes
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [clientId, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(clientId);
      }
    }
  }

  /**
   * Get statistics about rate limiter usage
   */
  public getStats(): {
    activeClients: number;
    totalBuckets: number;
    config: Required<RateLimitConfig>;
  } {
    return {
      activeClients: this.buckets.size,
      totalBuckets: this.buckets.size,
      config: this.config
    };
  }
}

// Export singleton instance with default config
export const defaultRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
  blockOnExceed: true,
  message: 'Rate limit exceeded. Please try again later.'
});

// Export per-tool rate limiters for critical operations
export const criticalRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  blockOnExceed: true,
  message: 'Rate limit exceeded for critical operation. Please try again later.'
});

/**
 * Helper to get client ID from auth context or IP
 */
export function getClientId(auth?: { userId?: string }, ip?: string): string {
  return auth?.userId ?? ip ?? 'anonymous';
}
