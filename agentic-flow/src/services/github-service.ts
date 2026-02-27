import { Octokit } from '@octokit/rest';

export interface GitHubConfig {
  token?: string;
  owner?: string;
  repo?: string;
}

export interface PullRequestParams {
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface IssueParams {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

export interface PRInfo {
  id: number;
  number: number;
  url: string;
  state: string;
  title: string;
  body?: string;
  head?: string;
  base?: string;
  mergeable?: boolean | null;
  merged?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface IssueInfo {
  id: number;
  number: number;
  url: string;
  state: string;
  title: string;
  body?: string;
  labels: string[];
  assignees?: string[];
  created_at: string;
  updated_at?: string;
}

export interface RepoMetrics {
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  openPRs: number;
  size: number;
  language: string | null;
  updated_at: string | null;
}

export interface ReleaseInfo {
  id: number;
  url: string;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
}

export interface ReviewInfo {
  id: number;
  state: string;
  body: string | null;
  submitted_at: string | null;
}

export interface MergeResult {
  merged: boolean;
  sha: string;
  message: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  url: string;
}

function resolveOwnerRepo(
  owner: string | undefined,
  repo: string | undefined,
  defaultOwner: string | undefined,
  defaultRepo: string | undefined,
): { owner: string; repo: string } {
  const finalOwner = owner || defaultOwner;
  const finalRepo = repo || defaultRepo;
  if (!finalOwner || !finalRepo) {
    throw new Error('Owner and repo must be specified via constructor config, environment variables (GITHUB_OWNER, GITHUB_REPO), or method parameters.');
  }
  return { owner: finalOwner, repo: finalRepo };
}

export class GitHubService {
  private static instance: GitHubService | null = null;
  private octokit: Octokit;
  private defaultOwner?: string;
  private defaultRepo?: string;

  constructor(config: GitHubConfig = {}) {
    const token = config.token || process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn('[GitHubService] No GitHub token provided. Some operations may fail.');
    }
    this.octokit = new Octokit({ auth: token });
    this.defaultOwner = config.owner || process.env.GITHUB_OWNER;
    this.defaultRepo = config.repo || process.env.GITHUB_REPO;
  }

  static getInstance(config?: GitHubConfig): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService(config);
    }
    return GitHubService.instance;
  }

  static resetInstance(): void {
    GitHubService.instance = null;
  }

  async createPullRequest(
    params: PullRequestParams,
    owner?: string,
    repo?: string,
  ): Promise<PRInfo> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.pulls.create({
        owner: resolved.owner,
        repo: resolved.repo,
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
        draft: params.draft || false,
      });
      return {
        id: response.data.id,
        number: response.data.number,
        url: response.data.html_url,
        state: response.data.state,
        title: response.data.title,
        created_at: response.data.created_at,
      };
    } catch (error: any) {
      throw new Error(`Failed to create PR: ${error.message}`);
    }
  }

  async getPullRequest(
    prNumber: number,
    owner?: string,
    repo?: string,
  ): Promise<PRInfo> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.pulls.get({
        owner: resolved.owner,
        repo: resolved.repo,
        pull_number: prNumber,
      });
      return {
        id: response.data.id,
        number: response.data.number,
        url: response.data.html_url,
        state: response.data.state,
        title: response.data.title,
        body: response.data.body ?? undefined,
        head: response.data.head.ref,
        base: response.data.base.ref,
        mergeable: response.data.mergeable,
        merged: response.data.merged,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
      };
    } catch (error: any) {
      throw new Error(`Failed to get PR #${prNumber}: ${error.message}`);
    }
  }

  async listPullRequests(
    state: 'open' | 'closed' | 'all' = 'open',
    owner?: string,
    repo?: string,
    limit = 100,
  ): Promise<PRInfo[]> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.pulls.list({
        owner: resolved.owner,
        repo: resolved.repo,
        state,
        per_page: Math.min(limit, 100),
      });
      return response.data.map(pr => ({
        id: pr.id,
        number: pr.number,
        url: pr.html_url,
        state: pr.state,
        title: pr.title,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
      }));
    } catch (error: any) {
      throw new Error(`Failed to list PRs: ${error.message}`);
    }
  }

  async mergePullRequest(
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
    owner?: string,
    repo?: string,
  ): Promise<MergeResult> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.pulls.merge({
        owner: resolved.owner,
        repo: resolved.repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
      });
      return {
        merged: response.data.merged,
        sha: response.data.sha,
        message: response.data.message,
      };
    } catch (error: any) {
      throw new Error(`Failed to merge PR #${prNumber}: ${error.message}`);
    }
  }

  async createReview(
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body?: string,
    comments?: Array<{ path: string; line: number; body: string }>,
    owner?: string,
    repo?: string,
  ): Promise<ReviewInfo> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.pulls.createReview({
        owner: resolved.owner,
        repo: resolved.repo,
        pull_number: prNumber,
        event,
        body,
        comments,
      });
      return {
        id: response.data.id,
        state: response.data.state,
        body: response.data.body,
        submitted_at: response.data.submitted_at ?? null,
      };
    } catch (error: any) {
      throw new Error(`Failed to create review on PR #${prNumber}: ${error.message}`);
    }
  }

  async createIssue(
    params: IssueParams,
    owner?: string,
    repo?: string,
  ): Promise<IssueInfo> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.issues.create({
        owner: resolved.owner,
        repo: resolved.repo,
        title: params.title,
        body: params.body,
        labels: params.labels,
        assignees: params.assignees,
      });
      return {
        id: response.data.id,
        number: response.data.number,
        url: response.data.html_url,
        state: response.data.state as string,
        title: response.data.title,
        labels: response.data.labels.map((l: any) => (typeof l === 'string' ? l : l.name ?? '')),
        created_at: response.data.created_at,
      };
    } catch (error: any) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  async getIssue(
    issueNumber: number,
    owner?: string,
    repo?: string,
  ): Promise<IssueInfo> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.issues.get({
        owner: resolved.owner,
        repo: resolved.repo,
        issue_number: issueNumber,
      });
      return {
        id: response.data.id,
        number: response.data.number,
        url: response.data.html_url,
        state: response.data.state as string,
        title: response.data.title,
        body: response.data.body ?? undefined,
        labels: response.data.labels.map((l: any) => (typeof l === 'string' ? l : l.name ?? '')),
        assignees: response.data.assignees?.map((a: any) => a.login) || [],
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
      };
    } catch (error: any) {
      throw new Error(`Failed to get issue #${issueNumber}: ${error.message}`);
    }
  }

  async listIssues(
    state: 'open' | 'closed' | 'all' = 'open',
    labels?: string[],
    owner?: string,
    repo?: string,
    limit = 100,
  ): Promise<IssueInfo[]> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.issues.listForRepo({
        owner: resolved.owner,
        repo: resolved.repo,
        state,
        labels: labels?.join(','),
        per_page: Math.min(limit, 100),
      });
      return response.data
        .filter(issue => !issue.pull_request)
        .map(issue => ({
          id: issue.id,
          number: issue.number,
          url: issue.html_url,
          state: issue.state as string,
          title: issue.title,
          labels: issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name ?? '')),
          created_at: issue.created_at,
          updated_at: issue.updated_at,
        }));
    } catch (error: any) {
      throw new Error(`Failed to list issues: ${error.message}`);
    }
  }

  async createRelease(
    tagName: string,
    name: string,
    body: string,
    draft = false,
    prerelease = false,
    owner?: string,
    repo?: string,
  ): Promise<ReleaseInfo> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.repos.createRelease({
        owner: resolved.owner,
        repo: resolved.repo,
        tag_name: tagName,
        name,
        body,
        draft,
        prerelease,
      });
      return {
        id: response.data.id,
        url: response.data.html_url,
        tag_name: response.data.tag_name,
        name: response.data.name,
        draft: response.data.draft,
        prerelease: response.data.prerelease,
        created_at: response.data.created_at,
      };
    } catch (error: any) {
      throw new Error(`Failed to create release: ${error.message}`);
    }
  }

  async getMetrics(owner?: string, repo?: string): Promise<RepoMetrics> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const [repoResponse, prsResponse] = await Promise.all([
        this.octokit.repos.get({ owner: resolved.owner, repo: resolved.repo }),
        this.octokit.pulls.list({ owner: resolved.owner, repo: resolved.repo, state: 'open', per_page: 1 }),
      ]);
      return {
        stars: repoResponse.data.stargazers_count,
        forks: repoResponse.data.forks_count,
        watchers: repoResponse.data.watchers_count,
        openIssues: repoResponse.data.open_issues_count,
        openPRs: prsResponse.data.length,
        size: repoResponse.data.size,
        language: repoResponse.data.language,
        updated_at: repoResponse.data.updated_at,
      };
    } catch (error: any) {
      throw new Error(`Failed to get metrics: ${error.message}`);
    }
  }

  async getWorkflowRuns(
    limit = 10,
    owner?: string,
    repo?: string,
  ): Promise<WorkflowRun[]> {
    const resolved = resolveOwnerRepo(owner, repo, this.defaultOwner, this.defaultRepo);
    try {
      const response = await this.octokit.actions.listWorkflowRunsForRepo({
        owner: resolved.owner,
        repo: resolved.repo,
        per_page: Math.min(limit, 100),
      });
      return response.data.workflow_runs.map(run => ({
        id: run.id,
        name: run.name ?? '',
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get workflow runs: ${error.message}`);
    }
  }
}
