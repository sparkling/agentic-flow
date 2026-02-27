/**
 * Input Validation Security Module
 * Centralized validation for all user inputs
 */

import validator from 'validator';

export interface ValidationOptions {
  maxLength?: number;
  minLength?: number;
  allowEmpty?: boolean;
  pattern?: RegExp;
  allowedValues?: string[];
}

export class InputValidator {
  /**
   * Validate string input
   */
  validateString(
    input: string,
    fieldName: string,
    options: ValidationOptions = {}
  ): string {
    // Type check
    if (typeof input !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    // Empty check
    if (!options.allowEmpty && input.trim().length === 0) {
      throw new Error(`${fieldName} cannot be empty`);
    }

    // Length checks
    if (options.minLength && input.length < options.minLength) {
      throw new Error(`${fieldName} must be at least ${options.minLength} characters`);
    }

    if (options.maxLength && input.length > options.maxLength) {
      throw new Error(`${fieldName} exceeds maximum length of ${options.maxLength}`);
    }

    // Pattern matching
    if (options.pattern && !options.pattern.test(input)) {
      throw new Error(`${fieldName} format is invalid`);
    }

    // Allowed values
    if (options.allowedValues && !options.allowedValues.includes(input)) {
      throw new Error(`${fieldName} must be one of: ${options.allowedValues.join(', ')}`);
    }

    // Remove null bytes
    if (input.includes('\0') || input.includes('\x00')) {
      throw new Error(`${fieldName} contains null bytes`);
    }

    // Remove control characters (except newline, tab)
    const sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized;
  }

  /**
   * Validate language identifier (for Agent Booster)
   */
  validateLanguage(language: string): string {
    const allowedLanguages = [
      'typescript',
      'javascript',
      'python',
      'rust',
      'go',
      'java',
      'c',
      'cpp',
      'csharp',
      'ruby',
      'php',
      'swift',
      'kotlin',
      'scala',
    ];

    return this.validateString(language, 'language', {
      allowedValues: allowedLanguages,
      maxLength: 20,
    });
  }

  /**
   * Validate run ID format
   */
  validateRunId(runId: string): string {
    return this.validateString(runId, 'runId', {
      pattern: /^[a-zA-Z0-9_-]+$/,
      minLength: 1,
      maxLength: 128,
    });
  }

  /**
   * Validate memory key format
   */
  validateMemoryKey(key: string): string {
    return this.validateString(key, 'memory key', {
      pattern: /^[a-zA-Z0-9_-]+$/,
      minLength: 1,
      maxLength: 256,
    });
  }

  /**
   * Sanitize HTML to prevent XSS
   */
  sanitizeHtml(input: string): string {
    return validator.escape(input);
  }

  /**
   * Validate and sanitize memory value
   */
  validateMemoryValue(value: any, maxSize: number = 100000): any {
    if (typeof value === 'string') {
      // Remove null bytes and control characters
      let sanitized = value.replace(/[\x00-\x1F\x7F]/g, '');

      // Escape HTML for UI safety
      sanitized = validator.escape(sanitized);

      // Check size
      if (sanitized.length > maxSize) {
        throw new Error(`Memory value exceeds maximum size of ${maxSize} bytes`);
      }

      return sanitized;
    }

    // For objects, check JSON size
    if (typeof value === 'object') {
      const jsonStr = JSON.stringify(value);
      if (jsonStr.length > maxSize) {
        throw new Error(`Memory value exceeds maximum size of ${maxSize} bytes`);
      }
      return value;
    }

    return value;
  }

  /**
   * Validate task description
   */
  validateTaskDescription(description: string): string {
    return this.validateString(description, 'task description', {
      minLength: 1,
      maxLength: 10000,
    });
  }

  /**
   * Validate number within range
   */
  validateNumber(
    input: number,
    fieldName: string,
    min?: number,
    max?: number
  ): number {
    if (typeof input !== 'number' || isNaN(input)) {
      throw new Error(`${fieldName} must be a valid number`);
    }

    if (min !== undefined && input < min) {
      throw new Error(`${fieldName} must be at least ${min}`);
    }

    if (max !== undefined && input > max) {
      throw new Error(`${fieldName} must be at most ${max}`);
    }

    return input;
  }

  /**
   * Validate array
   */
  validateArray<T>(
    input: T[],
    fieldName: string,
    maxLength?: number
  ): T[] {
    if (!Array.isArray(input)) {
      throw new Error(`${fieldName} must be an array`);
    }

    if (maxLength && input.length > maxLength) {
      throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
    }

    return input;
  }

  /**
   * Validate metadata object
   */
  validateMetadata(metadata: Record<string, any>, maxSize: number = 10000): Record<string, any> {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new Error('Metadata must be a plain object');
    }

    const jsonStr = JSON.stringify(metadata);
    if (jsonStr.length > maxSize) {
      throw new Error(`Metadata exceeds maximum size of ${maxSize} bytes`);
    }

    // Check for suspicious keys
    const suspiciousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of Object.keys(metadata)) {
      if (suspiciousKeys.includes(key)) {
        throw new Error(`Metadata contains forbidden key: ${key}`);
      }
    }

    return metadata;
  }

  /**
   * Validate provenance object
   */
  validateProvenance(provenance: Record<string, any>): Record<string, any> {
    const validated = this.validateMetadata(provenance);

    // Check for path traversal in values
    for (const [key, value] of Object.entries(validated)) {
      if (typeof value === 'string' && (value.includes('..') || value.startsWith('/'))) {
        throw new Error(`Path traversal detected in provenance.${key}: ${value}`);
      }
    }

    return validated;
  }
}

// Singleton instance
export const inputValidator = new InputValidator();

// Convenience exports
export const {
  validateString,
  validateLanguage,
  validateRunId,
  validateMemoryKey,
  sanitizeHtml,
  validateMemoryValue,
  validateTaskDescription,
  validateNumber,
  validateArray,
  validateMetadata,
  validateProvenance,
} = inputValidator;
