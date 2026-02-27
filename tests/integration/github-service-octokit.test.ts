/**
 * Integration Test: GitHubService (Octokit-based)
 *
 * Tests the @octokit/rest based GitHub integration service.
 * Verifies structure, type safety, and error handling without making real API calls.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('GitHubService Octokit Integration', () => {
  let GitHubService: any;
  let service: any;

  beforeAll(async () => {
    const mod = await import('../../agentic-flow/src/services/github-service.js');
    GitHubService = mod.GitHubService;
    service = new GitHubService();
  });

  afterAll(() => {
    GitHubService.resetInstance();
  });

  it('should construct GitHubService', () => {
    expect(service).toBeDefined();
  });

  it('should support singleton pattern', () => {
    const instance1 = GitHubService.getInstance();
    const instance2 = GitHubService.getInstance();
    expect(instance1).toBe(instance2);
    GitHubService.resetInstance();
  });

  it('should have createPullRequest method', () => {
    expect(typeof service.createPullRequest).toBe('function');
  });

  it('should have getPullRequest method', () => {
    expect(typeof service.getPullRequest).toBe('function');
  });

  it('should have listPullRequests method', () => {
    expect(typeof service.listPullRequests).toBe('function');
  });

  it('should have mergePullRequest method', () => {
    expect(typeof service.mergePullRequest).toBe('function');
  });

  it('should have createReview method', () => {
    expect(typeof service.createReview).toBe('function');
  });

  it('should have createIssue method', () => {
    expect(typeof service.createIssue).toBe('function');
  });

  it('should have getIssue method', () => {
    expect(typeof service.getIssue).toBe('function');
  });

  it('should have listIssues method', () => {
    expect(typeof service.listIssues).toBe('function');
  });

  it('should have createRelease method', () => {
    expect(typeof service.createRelease).toBe('function');
  });

  it('should have getMetrics method', () => {
    expect(typeof service.getMetrics).toBe('function');
  });

  it('should have getWorkflowRuns method', () => {
    expect(typeof service.getWorkflowRuns).toBe('function');
  });

  it('should require owner/repo for PR listing', async () => {
    await expect(
      service.listPullRequests('open', undefined, undefined)
    ).rejects.toThrow('Owner and repo must be specified');
  });

  it('should require owner/repo for issue listing', async () => {
    await expect(
      service.listIssues('open', undefined, undefined, undefined)
    ).rejects.toThrow('Owner and repo must be specified');
  });

  it('should accept custom config', () => {
    const custom = new GitHubService({
      owner: 'test-owner',
      repo: 'test-repo',
    });
    expect(custom).toBeDefined();
  });
});
