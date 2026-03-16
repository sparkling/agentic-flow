/**
 * GitHub Tools Integration Tests
 *
 * Tests the GitHubService with mocked execFileSync to validate
 * PR, issue, repo, and workflow operations without requiring `gh` CLI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import { GitHubService } from '../../agentic-flow/src/services/github-service';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = childProcess.execFileSync as unknown as ReturnType<typeof vi.fn>;

describe('GitHub Tools Integration', () => {
  beforeEach(() => {
    GitHubService.resetInstance();
    vi.clearAllMocks();
  });

  describe('github_pr_list', () => {
    it('lists open PRs', () => {
      mockExecFileSync.mockReturnValue(JSON.stringify([
        { number: 1, title: 'Fix bug', state: 'OPEN', url: 'https://github.com/test/repo/pull/1', author: { login: 'user1' } },
        { number: 2, title: 'Add feature', state: 'OPEN', url: 'https://github.com/test/repo/pull/2', author: { login: 'user2' } },
      ]));
      const svc = GitHubService.getInstance();
      const prs = svc.listPRs({ state: 'open', limit: 10 });
      expect(prs).toHaveLength(2);
      expect(prs[0].number).toBe(1);
      expect(prs[0].title).toBe('Fix bug');
    });

    it('returns empty array on parse failure', () => {
      mockExecFileSync.mockReturnValue('not json');
      const svc = GitHubService.getInstance();
      const prs = svc.listPRs({});
      expect(prs).toEqual([]);
    });
  });

  describe('github_pr_create', () => {
    it('creates a PR and returns info', () => {
      mockExecFileSync.mockReturnValue('https://github.com/test/repo/pull/42\n');
      const svc = GitHubService.getInstance();
      const pr = svc.createPR({ title: 'New PR', body: 'Description' });
      expect(pr.number).toBe(42);
      expect(pr.title).toBe('New PR');
      expect(pr.state).toBe('open');
    });

    it('includes base and head params', () => {
      mockExecFileSync.mockReturnValue('https://github.com/test/repo/pull/10\n');
      const svc = GitHubService.getInstance();
      svc.createPR({ title: 'PR', body: 'body', base: 'main', head: 'feature' });
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--base', 'main', '--head', 'feature']),
        expect.any(Object),
      );
    });
  });

  describe('github_pr_review', () => {
    it('adds a review comment', () => {
      mockExecFileSync.mockReturnValue('');
      const svc = GitHubService.getInstance();
      const result = svc.reviewPR({ number: 5, body: 'LGTM', event: 'approve' });
      expect(result.success).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['pr', 'review', '5']),
        expect.any(Object),
      );
    });
  });

  describe('github_pr_merge', () => {
    it('merges a PR with squash', () => {
      mockExecFileSync.mockReturnValue('');
      const svc = GitHubService.getInstance();
      const result = svc.mergePR({ number: 7, method: 'squash' });
      expect(result.success).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--squash']),
        expect.any(Object),
      );
    });
  });

  describe('github_issue_create', () => {
    it('creates an issue with labels', () => {
      mockExecFileSync.mockReturnValue('https://github.com/test/repo/issues/15\n');
      const svc = GitHubService.getInstance();
      const issue = svc.createIssue({ title: 'Bug', body: 'Description', labels: ['bug', 'critical'] });
      expect(issue.number).toBe(15);
      expect(issue.labels).toEqual(['bug', 'critical']);
    });
  });

  describe('github_issue_list', () => {
    it('lists issues', () => {
      mockExecFileSync.mockReturnValue(JSON.stringify([
        { number: 1, title: 'Bug', state: 'OPEN', url: 'https://github.com/test/repo/issues/1', labels: [{ name: 'bug' }] },
      ]));
      const svc = GitHubService.getInstance();
      const issues = svc.listIssues({ state: 'open' });
      expect(issues).toHaveLength(1);
      expect(issues[0].labels).toEqual(['bug']);
    });
  });

  describe('github_repo_info', () => {
    it('returns repository metadata', () => {
      mockExecFileSync.mockReturnValue(JSON.stringify({
        name: 'agentic-flow', description: 'AI agent framework',
        defaultBranchRef: { name: 'main' }, url: 'https://github.com/test/agentic-flow',
        stargazerCount: 100, primaryLanguage: { name: 'TypeScript' },
      }));
      const svc = GitHubService.getInstance();
      const info = svc.getRepoInfo();
      expect(info.name).toBe('agentic-flow');
      expect(info.defaultBranch).toBe('main');
      expect(info.language).toBe('TypeScript');
    });
  });

  describe('github_workflow_status', () => {
    it('returns workflow runs', () => {
      mockExecFileSync.mockReturnValue(JSON.stringify([
        { databaseId: 1, name: 'CI', status: 'completed', conclusion: 'success', url: 'https://github.com/test/actions/1' },
      ]));
      const svc = GitHubService.getInstance();
      const runs = svc.getWorkflowStatus({ limit: 5 });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('completed');
    });
  });

  describe('security: command injection prevention', () => {
    it('uses execFileSync not execSync', () => {
      mockExecFileSync.mockReturnValue('[]');
      const svc = GitHubService.getInstance();
      svc.listPRs({});
      expect(mockExecFileSync).toHaveBeenCalledWith('gh', expect.any(Array), expect.any(Object));
    });

    it('passes arguments as array elements, not string concatenation', () => {
      mockExecFileSync.mockReturnValue('https://github.com/test/repo/pull/1\n');
      const svc = GitHubService.getInstance();
      svc.createPR({ title: 'malicious"; rm -rf /', body: 'test' });
      const callArgs = mockExecFileSync.mock.calls[0][1] as string[];
      expect(callArgs).toContain('malicious"; rm -rf /');
      // The malicious string is passed as a single array element, not parsed by shell
    });
  });

  describe('error handling', () => {
    it('throws descriptive error for missing gh CLI', () => {
      mockExecFileSync.mockImplementation(() => {
        const error: any = new Error('spawn gh ENOENT');
        error.code = 'ENOENT';
        error.stderr = '';
        throw error;
      });
      const svc = GitHubService.getInstance();
      expect(() => svc.listPRs({})).toThrow('GitHub CLI (gh) is not installed');
    });
  });
});
