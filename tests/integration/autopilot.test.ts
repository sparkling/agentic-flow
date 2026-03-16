/**
 * Tests for SwarmCompletionCoordinator (ADR-058)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SwarmCompletionCoordinator,
  SwarmTask,
  CompletionState,
} from '../../agentic-flow/src/coordination/swarm-completion.js';

describe('SwarmCompletionCoordinator', () => {
  let coordinator: SwarmCompletionCoordinator;

  beforeEach(() => {
    coordinator = new SwarmCompletionCoordinator({ maxIterations: 10, timeoutMinutes: 60 });
  });

  describe('addTask', () => {
    it('should add a task', () => {
      coordinator.addTask({ id: '1', subject: 'Test task', status: 'pending' });
      const state = coordinator.getState();
      expect(state.total).toBe(1);
      expect(state.pending).toBe(1);
    });

    it('should set createdAt if not provided', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      const state = coordinator.getState();
      expect(state.remainingTasks[0].createdAt).toBeDefined();
    });
  });

  describe('addTasks', () => {
    it('should add multiple tasks', () => {
      coordinator.addTasks([
        { id: '1', subject: 'Task 1', status: 'pending' },
        { id: '2', subject: 'Task 2', status: 'pending' },
        { id: '3', subject: 'Task 3', status: 'in_progress' },
      ]);
      const state = coordinator.getState();
      expect(state.total).toBe(3);
      expect(state.pending).toBe(2);
      expect(state.inProgress).toBe(1);
    });
  });

  describe('updateTask', () => {
    it('should update task status', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      coordinator.updateTask('1', 'in_progress');
      expect(coordinator.getState().inProgress).toBe(1);
    });

    it('should set completedAt when completed', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      coordinator.updateTask('1', 'completed');
      const state = coordinator.getState();
      expect(state.completed).toBe(1);
    });

    it('should record completion history', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      coordinator.updateTask('1', 'completed');
      const history = coordinator.getCompletionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].taskId).toBe('1');
    });

    it('should ignore update for non-existent task', () => {
      coordinator.updateTask('nonexistent', 'completed');
      expect(coordinator.getState().total).toBe(0);
    });
  });

  describe('removeTask', () => {
    it('should remove a task', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      coordinator.removeTask('1');
      expect(coordinator.getState().total).toBe(0);
    });
  });

  describe('getState', () => {
    it('should return correct state with mixed statuses', () => {
      coordinator.addTasks([
        { id: '1', subject: 'Done', status: 'completed' },
        { id: '2', subject: 'WIP', status: 'in_progress' },
        { id: '3', subject: 'Todo', status: 'pending' },
        { id: '4', subject: 'Stuck', status: 'blocked' },
      ]);
      const state = coordinator.getState();
      expect(state.total).toBe(4);
      expect(state.completed).toBe(1);
      expect(state.inProgress).toBe(1);
      expect(state.pending).toBe(1);
      expect(state.blocked).toBe(1);
      expect(state.progress).toBe(25);
      expect(state.isComplete).toBe(false);
      expect(state.remainingTasks).toHaveLength(3);
    });

    it('should report 100% for empty task list', () => {
      const state = coordinator.getState();
      expect(state.progress).toBe(100);
      expect(state.isComplete).toBe(true);
    });

    it('should report complete when all tasks done', () => {
      coordinator.addTask({ id: '1', subject: 'Done', status: 'completed' });
      expect(coordinator.getState().isComplete).toBe(true);
    });
  });

  describe('tick', () => {
    it('should increment iteration counter', () => {
      coordinator.tick();
      expect(coordinator.getState().iterations).toBe(1);
      coordinator.tick();
      expect(coordinator.getState().iterations).toBe(2);
    });
  });

  describe('shouldContinue', () => {
    it('should return false when disabled', () => {
      coordinator.setConfig({ enabled: false });
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      expect(coordinator.shouldContinue()).toBe(false);
    });

    it('should return false when all complete', () => {
      coordinator.addTask({ id: '1', subject: 'Done', status: 'completed' });
      expect(coordinator.shouldContinue()).toBe(false);
    });

    it('should return false when max iterations exceeded', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      for (let i = 0; i < 10; i++) coordinator.tick();
      expect(coordinator.shouldContinue()).toBe(false);
    });

    it('should return true when tasks remain and under limits', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      expect(coordinator.shouldContinue()).toBe(true);
    });
  });

  describe('getRemainingTasks', () => {
    it('should sort in_progress before pending before blocked', () => {
      coordinator.addTasks([
        { id: '1', subject: 'Blocked', status: 'blocked' },
        { id: '2', subject: 'Pending', status: 'pending' },
        { id: '3', subject: 'WIP', status: 'in_progress' },
      ]);
      const remaining = coordinator.getRemainingTasks();
      expect(remaining[0].status).toBe('in_progress');
      expect(remaining[1].status).toBe('pending');
      expect(remaining[2].status).toBe('blocked');
    });

    it('should exclude completed tasks', () => {
      coordinator.addTasks([
        { id: '1', subject: 'Done', status: 'completed' },
        { id: '2', subject: 'Todo', status: 'pending' },
      ]);
      const remaining = coordinator.getRemainingTasks();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('2');
    });
  });

  describe('generateReEngagementPrompt', () => {
    it('should generate completion message when done', async () => {
      coordinator.addTask({ id: '1', subject: 'Done', status: 'completed' });
      const prompt = await coordinator.generateReEngagementPrompt();
      expect(prompt).toContain('All 1 tasks complete');
    });

    it('should list remaining tasks', async () => {
      coordinator.addTasks([
        { id: '1', subject: 'Task A', status: 'pending' },
        { id: '2', subject: 'Task B', status: 'in_progress' },
      ]);
      const prompt = await coordinator.generateReEngagementPrompt();
      expect(prompt).toContain('Task A');
      expect(prompt).toContain('Task B');
      expect(prompt).toContain('Continue working');
    });

    it('should show truncation for many tasks', async () => {
      for (let i = 0; i < 15; i++) {
        coordinator.addTask({ id: `${i}`, subject: `Task ${i}`, status: 'pending' });
      }
      const prompt = await coordinator.generateReEngagementPrompt();
      expect(prompt).toContain('... and 5 more');
    });
  });

  describe('getAverageCompletionTime', () => {
    it('should return 0 with no history', () => {
      expect(coordinator.getAverageCompletionTime()).toBe(0);
    });

    it('should compute average from history', () => {
      coordinator.addTask({ id: '1', subject: 'A', status: 'pending', createdAt: Date.now() - 1000 });
      coordinator.addTask({ id: '2', subject: 'B', status: 'pending', createdAt: Date.now() - 2000 });
      coordinator.updateTask('1', 'completed');
      coordinator.updateTask('2', 'completed');
      expect(coordinator.getAverageCompletionTime()).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      coordinator.tick();
      coordinator.updateTask('1', 'completed');
      coordinator.reset();
      const state = coordinator.getState();
      expect(state.total).toBe(0);
      expect(state.iterations).toBe(0);
      expect(coordinator.getCompletionHistory()).toHaveLength(0);
    });
  });

  describe('config', () => {
    it('should get config', () => {
      const config = coordinator.getConfig();
      expect(config.maxIterations).toBe(10);
      expect(config.timeoutMinutes).toBe(60);
      expect(config.enabled).toBe(true);
    });

    it('should update config partially', () => {
      coordinator.setConfig({ maxIterations: 100 });
      expect(coordinator.getConfig().maxIterations).toBe(100);
      expect(coordinator.getConfig().timeoutMinutes).toBe(60);
    });
  });

  describe('edge cases', () => {
    it('should handle duplicate task IDs by overwriting', () => {
      coordinator.addTask({ id: '1', subject: 'Original', status: 'pending' });
      coordinator.addTask({ id: '1', subject: 'Updated', status: 'in_progress' });
      const state = coordinator.getState();
      expect(state.total).toBe(1);
      expect(state.inProgress).toBe(1);
      expect(state.remainingTasks[0].subject).toBe('Updated');
    });

    it('should handle removing non-existent task gracefully', () => {
      coordinator.removeTask('nonexistent');
      expect(coordinator.getState().total).toBe(0);
    });

    it('should track elapsed time accurately', () => {
      const state = coordinator.getState();
      expect(state.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(state.elapsedMs).toBeLessThan(5000);
    });

    it('should handle all tasks blocked', () => {
      coordinator.addTasks([
        { id: '1', subject: 'Blocked A', status: 'blocked' },
        { id: '2', subject: 'Blocked B', status: 'blocked' },
      ]);
      const state = coordinator.getState();
      expect(state.isComplete).toBe(false);
      expect(state.blocked).toBe(2);
      expect(state.progress).toBe(0);
      expect(coordinator.shouldContinue()).toBe(true);
    });

    it('should handle rapid tick calls', () => {
      for (let i = 0; i < 100; i++) coordinator.tick();
      expect(coordinator.getState().iterations).toBe(100);
    });

    it('should preserve createdAt when provided', () => {
      const ts = 1000000;
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending', createdAt: ts });
      const task = coordinator.getState().remainingTasks[0];
      expect(task.createdAt).toBe(ts);
    });

    it('getConfig should return a copy, not a reference', () => {
      const config1 = coordinator.getConfig();
      config1.maxIterations = 999;
      const config2 = coordinator.getConfig();
      expect(config2.maxIterations).toBe(10);
    });

    it('getCompletionHistory should return a copy', () => {
      coordinator.addTask({ id: '1', subject: 'Test', status: 'pending' });
      coordinator.updateTask('1', 'completed');
      const h1 = coordinator.getCompletionHistory();
      h1.push({ taskId: 'fake', duration: 0, iterations: 0 });
      const h2 = coordinator.getCompletionHistory();
      expect(h2).toHaveLength(1);
    });
  });
});
