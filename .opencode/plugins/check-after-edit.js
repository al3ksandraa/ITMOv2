// Example OpenCode 2 plugin: run project checks after edits
// Registers a post-execution hook and runs a trusted runner (scripts/check.sh)
// Assumptions:
// - OpenCode loads ESM plugins and calls default export with a context object `ctx`
// - The hook fires after tools (e.g. apply_patch) complete in the session
// - We keep it conservative: only trigger after apply_patch to avoid noise

import { spawn } from 'node:child_process';

export default async function setup(ctx) {
  // Register hook that runs after a tool execution inside the agent session
  ctx.tool.hook('execute.after', async (event) => {
    try {
      // Only react to file edits applied via apply_patch (adjust if you want broader coverage)
      if (!event || event.tool !== 'apply_patch') return;

      const cwd = (ctx && ctx.workspace && ctx.workspace.root) || process.cwd();
      const startedAt = Date.now();

      // Prefer a trusted runner if your OpenCode exposes it; fallback to local spawn
      let code = 0;
      let stdout = '';
      let stderr = '';

      if (ctx.runner && typeof ctx.runner.run === 'function') {
        // Trusted runner path (adjust id/name to your environment)
        const res = await ctx.runner.run({
          id: 'project-check',
          command: 'sh',
          args: ['scripts/check.sh'],
          cwd,
          trust: true,
          timeoutMs: 180000,
        });
        code = res.code;
        stdout = res.stdout || '';
        stderr = res.stderr || '';
      } else {
        // Fallback: spawn shell directly
        const child = spawn('sh', ['scripts/check.sh'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        code = await new Promise((resolve) => child.on('close', resolve));
      }

      const durationMs = Date.now() - startedAt;
      const status = code === 0 ? 'PASS' : 'FAIL';
      const summary = { ok: code === 0, code, status, durationMs };

      // Report back into the agent UI if available; fall back to console
      const body = (stdout || stderr || '').slice(-4000);
      if (ctx.notify) {
        await ctx.notify({ title: `check.sh ${status}`, body, level: code === 0 ? 'info' : 'error' }).catch(() => {});
      } else if (ctx.message) {
        await ctx.message({ type: 'notice', title: `check.sh ${status}`, body }).catch(() => {});
      } else {
        // eslint-disable-next-line no-console
        console.log('[plugin] check-after-edit:', summary);
      }

      return summary;
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (ctx && ctx.message) {
        await ctx.message({ type: 'error', title: 'check-after-edit hook error', body: msg }).catch(() => {});
      }
      // eslint-disable-next-line no-console
      console.error('[plugin] check-after-edit error:', e);
    }
  });
}
