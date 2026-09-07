import assert from 'node:assert/strict';
import { registerRemindTool } from '../src/tools/remind.js';

const hooks = new Map<string, (...args: any[]) => unknown>();
let tool: { execute: (id: string, params: Record<string, unknown>) => Promise<any> } | undefined;
const jobs: any[] = [];
const cron = {
  list: async () => jobs,
  add: async (job: any) => {
    const created = { ...job, id: `job-${jobs.length + 1}` };
    jobs.push(created);
    return created;
  },
  remove: async (id: string) => {
    const index = jobs.findIndex((job) => job.id === id);
    if (index < 0) return { removed: false };
    jobs.splice(index, 1);
    return { removed: true };
  },
};

registerRemindTool({
  on: (name: string, handler: (...args: any[]) => unknown) => hooks.set(name, handler),
  registerTool: (registered: typeof tool) => { tool = registered; },
} as never);
hooks.get('gateway_start')?.({}, { getCron: () => cron });
assert.ok(tool);

const before = Date.now();
const added = await tool.execute('add', {
  action: 'add', content: '拿沙拉', time: '1m',
  to: 'qqbot:group:test-group', name: '提醒拿沙拉',
});
assert.equal(added.details.ok, true);
assert.equal(added.details.jobId, 'job-1');
assert.equal(jobs.length, 1);
assert.equal(jobs[0].delivery.to, 'qqbot:group:test-group');
assert.equal(jobs[0].delivery.accountId, 'default');
assert.equal(jobs[0].schedule.kind, 'at');
const scheduledAt = Date.parse(jobs[0].schedule.at);
assert.ok(scheduledAt >= before + 59_000 && scheduledAt <= Date.now() + 61_000);

const listed = await tool.execute('list', { action: 'list', to: 'qqbot:group:test-group' });
assert.deepEqual(listed.details.reminders.map((job: any) => job.id), ['job-1']);
const removed = await tool.execute('remove', {
  action: 'remove', jobId: 'job-1', to: 'qqbot:group:test-group',
});
assert.equal(removed.details.removed, true);
assert.equal(jobs.length, 0);
console.log('PASS: qqbot_remind directly creates, lists, and removes persisted cron jobs');
