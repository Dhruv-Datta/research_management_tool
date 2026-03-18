import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing routes
const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}));

// Helper to build chainable supabase mock
function chain(overrides = {}) {
  const c = {
    select: vi.fn(() => c),
    insert: vi.fn(() => c),
    update: vi.fn(() => c),
    delete: vi.fn(() => c),
    eq: vi.fn(() => c),
    neq: vi.fn(() => c),
    order: vi.fn(() => c),
    limit: vi.fn(() => c),
    single: vi.fn(() => c),
    ...overrides,
  };
  // Make each method return the chain
  for (const [key, val] of Object.entries(c)) {
    if (typeof val === 'function' && !overrides[key]) {
      c[key] = vi.fn(() => c);
    }
  }
  Object.assign(c, overrides);
  return c;
}

// Import route handlers
import { GET, POST, PATCH, DELETE } from '@/app/api/tasks/route';
import {
  POST as SUB_POST,
  PATCH as SUB_PATCH,
  DELETE as SUB_DELETE,
} from '@/app/api/tasks/subtasks/route';

function makeRequest(body) {
  return new Request('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id) {
  return new Request(`http://localhost/api/tasks?id=${id}`, { method: 'DELETE' });
}

describe('/api/tasks', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe('GET', () => {
    it('returns tasks with subtasks joined', async () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1', priority: 'high', status: 'open', position: 0 },
        { id: 'task-2', title: 'Task 2', priority: 'medium', status: 'open', position: 0 },
      ];
      const subtasks = [
        { id: 'sub-1', task_id: 'task-1', title: 'Subtask 1', done: false, position: 0 },
      ];

      let callCount = 0;
      mockFrom.mockImplementation((table) => {
        if (table === 'tasks') {
          return chain({
            select: vi.fn(() => chain({
              order: vi.fn(() => Promise.resolve({ data: tasks, error: null })),
            })),
          });
        }
        if (table === 'subtasks') {
          return chain({
            select: vi.fn(() => chain({
              order: vi.fn(() => Promise.resolve({ data: subtasks, error: null })),
            })),
          });
        }
      });

      const res = await GET();
      const data = await res.json();

      expect(data.tasks).toHaveLength(2);
      expect(data.tasks[0].subtasks).toHaveLength(1);
      expect(data.tasks[0].subtasks[0].title).toBe('Subtask 1');
      expect(data.tasks[1].subtasks).toHaveLength(0);
    });

    it('returns error on supabase failure', async () => {
      mockFrom.mockImplementation(() =>
        chain({
          select: vi.fn(() => chain({
            order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'DB down' } })),
          })),
        })
      );

      const res = await GET();
      const data = await res.json();
      expect(data.error).toBe('DB down');
      expect(res.status).toBe(500);
    });
  });

  describe('POST', () => {
    it('rejects missing title', async () => {
      const res = await POST(makeRequest({ priority: 'high' }));
      const data = await res.json();
      expect(data.error).toBe('title and priority are required');
      expect(res.status).toBe(400);
    });

    it('rejects missing priority', async () => {
      const res = await POST(makeRequest({ title: 'Test' }));
      const data = await res.json();
      expect(data.error).toBe('title and priority are required');
      expect(res.status).toBe(400);
    });

    it('rejects invalid priority value', async () => {
      const res = await POST(makeRequest({ title: 'Test', priority: 'urgent' }));
      const data = await res.json();
      expect(data.error).toBe('priority must be high, medium, or low');
      expect(res.status).toBe(400);
    });

    it('enforces high priority limit of 3', async () => {
      mockFrom.mockImplementation(() =>
        chain({
          select: vi.fn(() => chain({
            eq: vi.fn(() => chain({
              eq: vi.fn(() => Promise.resolve({ count: 3, error: null })),
            })),
          })),
        })
      );

      const res = await POST(makeRequest({ title: 'Fourth', priority: 'high' }));
      const data = await res.json();
      expect(data.error).toBe('high priority is full (max 3)');
      expect(res.status).toBe(400);
    });

    it('enforces medium priority limit of 5', async () => {
      mockFrom.mockImplementation(() =>
        chain({
          select: vi.fn(() => chain({
            eq: vi.fn(() => chain({
              eq: vi.fn(() => Promise.resolve({ count: 5, error: null })),
            })),
          })),
        })
      );

      const res = await POST(makeRequest({ title: 'Sixth', priority: 'medium' }));
      const data = await res.json();
      expect(data.error).toBe('medium priority is full (max 5)');
      expect(res.status).toBe(400);
    });

    it('allows unlimited low priority tasks', async () => {
      // Low has no limit check — goes straight to position query then insert
      const task = { id: 'new-1', title: 'Low task', priority: 'low', status: 'open', position: 0 };

      mockFrom.mockImplementation(() =>
        chain({
          select: vi.fn(() => chain({
            eq: vi.fn(() => chain({
              order: vi.fn(() => chain({
                limit: vi.fn(() => Promise.resolve({ data: [] })),
              })),
            })),
          })),
          insert: vi.fn(() => chain({
            select: vi.fn(() => chain({
              single: vi.fn(() => Promise.resolve({ data: task, error: null })),
            })),
          })),
        })
      );

      const res = await POST(makeRequest({ title: 'Low task', priority: 'low' }));
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.task.title).toBe('Low task');
      expect(data.task.subtasks).toEqual([]);
    });
  });

  describe('PATCH', () => {
    it('rejects missing id', async () => {
      const req = new Request('http://localhost/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      const res = await PATCH(req);
      const data = await res.json();
      expect(data.error).toBe('id is required');
      expect(res.status).toBe(400);
    });

    it('updates task fields', async () => {
      const updated = { id: 'task-1', title: 'Updated', status: 'done' };
      mockFrom.mockImplementation(() =>
        chain({
          update: vi.fn(() => chain({
            eq: vi.fn(() => chain({
              select: vi.fn(() => chain({
                single: vi.fn(() => Promise.resolve({ data: updated, error: null })),
              })),
            })),
          })),
        })
      );

      const req = new Request('http://localhost/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'task-1', title: 'Updated', status: 'done' }),
      });
      const res = await PATCH(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.task.title).toBe('Updated');
    });
  });

  describe('DELETE', () => {
    it('rejects missing id', async () => {
      const req = new Request('http://localhost/api/tasks', { method: 'DELETE' });
      const res = await DELETE(req);
      const data = await res.json();
      expect(data.error).toBe('id is required');
      expect(res.status).toBe(400);
    });

    it('deletes task successfully', async () => {
      mockFrom.mockImplementation(() =>
        chain({
          delete: vi.fn(() => chain({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        })
      );

      const res = await DELETE(makeDeleteRequest('task-1'));
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});

describe('/api/tasks/subtasks', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe('POST', () => {
    it('rejects missing task_id', async () => {
      const req = new Request('http://localhost/api/tasks/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Sub' }),
      });
      const res = await SUB_POST(req);
      const data = await res.json();
      expect(data.error).toBe('task_id and title are required');
      expect(res.status).toBe(400);
    });

    it('rejects missing title', async () => {
      const req = new Request('http://localhost/api/tasks/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: 'task-1' }),
      });
      const res = await SUB_POST(req);
      const data = await res.json();
      expect(data.error).toBe('task_id and title are required');
      expect(res.status).toBe(400);
    });

    it('creates subtask with correct position', async () => {
      const subtask = { id: 'sub-new', task_id: 'task-1', title: 'New sub', done: false, position: 2 };

      mockFrom.mockImplementation(() =>
        chain({
          select: vi.fn(() => chain({
            eq: vi.fn(() => chain({
              order: vi.fn(() => chain({
                limit: vi.fn(() => Promise.resolve({ data: [{ position: 1 }] })),
              })),
            })),
          })),
          insert: vi.fn(() => chain({
            select: vi.fn(() => chain({
              single: vi.fn(() => Promise.resolve({ data: subtask, error: null })),
            })),
          })),
        })
      );

      const req = new Request('http://localhost/api/tasks/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: 'task-1', title: 'New sub' }),
      });
      const res = await SUB_POST(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.subtask.title).toBe('New sub');
    });
  });

  describe('PATCH', () => {
    it('rejects missing id', async () => {
      const req = new Request('http://localhost/api/tasks/subtasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true }),
      });
      const res = await SUB_PATCH(req);
      const data = await res.json();
      expect(data.error).toBe('id is required');
      expect(res.status).toBe(400);
    });

    it('toggles subtask done', async () => {
      mockFrom.mockImplementation(() =>
        chain({
          update: vi.fn(() => chain({
            eq: vi.fn(() => chain({
              select: vi.fn(() => chain({
                single: vi.fn(() => Promise.resolve({ data: { id: 'sub-1', done: true }, error: null })),
              })),
            })),
          })),
        })
      );

      const req = new Request('http://localhost/api/tasks/subtasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'sub-1', done: true }),
      });
      const res = await SUB_PATCH(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.subtask.done).toBe(true);
    });
  });

  describe('DELETE', () => {
    it('rejects missing id', async () => {
      const req = new Request('http://localhost/api/tasks/subtasks', { method: 'DELETE' });
      const res = await SUB_DELETE(req);
      const data = await res.json();
      expect(data.error).toBe('id is required');
      expect(res.status).toBe(400);
    });

    it('deletes subtask', async () => {
      mockFrom.mockImplementation(() =>
        chain({
          delete: vi.fn(() => chain({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        })
      );

      const req = new Request('http://localhost/api/tasks/subtasks?id=sub-1', { method: 'DELETE' });
      const res = await SUB_DELETE(req);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
