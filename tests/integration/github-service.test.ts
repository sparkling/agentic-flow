import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { GitHubService } from '../../agentic-flow/src/services/github-service.js';

describe('GitHubService', () => {
  afterEach(() => {
    GitHubService.resetInstance();
  });

  describe('Initialization', () => {
    it('should create instance with default config', () => {
      const service = new GitHubService();
      expect(service).toBeDefined();
    });

    it('should create instance with explicit config', () => {
      const service = new GitHubService({
        token: 'test-token',
        owner: 'test-owner',
        repo: 'test-repo',
      });
      expect(service).toBeDefined();
    });

    it('should return singleton via getInstance', () => {
      const a = GitHubService.getInstance();
      const b = GitHubService.getInstance();
      expect(a).toBe(b);
    });

    it('should reset singleton', () => {
      const a = GitHubService.getInstance();
      GitHubService.resetInstance();
      const b = GitHubService.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('Method signatures', () => {
    let github: GitHubService;

    beforeEach(() => {
      github = new GitHubService({
        token: 'test-token',
        owner: 'ruvnet',
        repo: 'agentic-flow',
      });
    });

    it('should have createPullRequest method', () => {
      expect(typeof github.createPullRequest).toBe('function');
    });

    it('should have getPullRequest method', () => {
      expect(typeof github.getPullRequest).toBe('function');
    });

    it('should have listPullRequests method', () => {
      expect(typeof github.listPullRequests).toBe('function');
    });

    it('should have mergePullRequest method', () => {
      expect(typeof github.mergePullRequest).toBe('function');
    });

    it('should have createReview method', () => {
      expect(typeof github.createReview).toBe('function');
    });

    it('should have createIssue method', () => {
      expect(typeof github.createIssue).toBe('function');
    });

    it('should have getIssue method', () => {
      expect(typeof github.getIssue).toBe('function');
    });

    it('should have listIssues method', () => {
      expect(typeof github.listIssues).toBe('function');
    });

    it('should have createRelease method', () => {
      expect(typeof github.createRelease).toBe('function');
    });

    it('should have getMetrics method', () => {
      expect(typeof github.getMetrics).toBe('function');
    });

    it('should have getWorkflowRuns method', () => {
      expect(typeof github.getWorkflowRuns).toBe('function');
    });
  });

  describe('Error handling — missing owner/repo', () => {
    let github: GitHubService;

    beforeEach(() => {
      // No owner/repo configured, env vars cleared
      const origOwner = process.env.GITHUB_OWNER;
      const origRepo = process.env.GITHUB_REPO;
      delete process.env.GITHUB_OWNER;
      delete process.env.GITHUB_REPO;
      github = new GitHubService({ token: 'test-token' });
      // Restore
      if (origOwner) process.env.GITHUB_OWNER = origOwner;
      if (origRepo) process.env.GITHUB_REPO = origRepo;
    });

    it('should throw on listPullRequests without owner/repo', async () => {
      await expect(github.listPullRequests()).rejects.toThrow('Owner and repo must be specified');
    });

    it('should throw on getMetrics without owner/repo', async () => {
      await expect(github.getMetrics()).rejects.toThrow('Owner and repo must be specified');
    });

    it('should throw on createIssue without owner/repo', async () => {
      await expect(
        github.createIssue({ title: 'test', body: 'body' }),
      ).rejects.toThrow('Owner and repo must be specified');
    });
  });

  // Only run real API tests when GITHUB_TOKEN is available
  const hasToken = !!process.env.GITHUB_TOKEN;
  const conditionalDescribe = hasToken ? describe : describe.skip;

  conditionalDescribe('Live API tests (requires GITHUB_TOKEN)', () => {
    let github: GitHubService;

    beforeAll(() => {
      github = new GitHubService({
        token: process.env.GITHUB_TOKEN,
        owner: 'ruvnet',
        repo: 'agentic-flow',
      });
    });

    it('should fetch repository metrics', async () => {
      const metrics = await github.getMetrics();
      expect(metrics.stars).toBeGreaterThanOrEqual(0);
      expect(metrics.forks).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.size).toBe('number');
    });

    it('should list open pull requests', async () => {
      const prs = await github.listPullRequests('open');
      expect(Array.isArray(prs)).toBe(true);
    });

    it('should list open issues', async () => {
      const issues = await github.listIssues('open');
      expect(Array.isArray(issues)).toBe(true);
    });

    it('should list workflow runs', async () => {
      const runs = await github.getWorkflowRuns(5);
      expect(Array.isArray(runs)).toBe(true);
    });
  });
});
