// check-after-edit plugin: runs project runner after edits and stores result
// Hooks into tool.execute.after for the 'edit' tool

export default (async ({ project, directory }) => {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { execSync } = await import('node:child_process');

  const root = (project && project.root) || directory || process.cwd();
  const outFile = path.join(root, '.opencode', 'check-after-edit.last.json');

  function writeResult(obj) {
    try {
      const dir = path.dirname(outFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    } catch (_) {
      // ignore file write errors
    }
  }

  return {
    async "tool.execute.after"(input, output) {
      try {
        // Only after successful edits
        if (input?.tool !== 'edit') return;
        if (output?.error) return;

        const startedAt = new Date().toISOString();
        let stdout = '';
        try {
          stdout = execSync('sh scripts/check.sh', {
            cwd: root,
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf-8',
          });
          console.log('[check-after-edit] PASS');
          writeResult({ status: 'PASS', startedAt, finishedAt: new Date().toISOString(), stdout });
        } catch (e) {
          const errOut = (e && (e.stdout || e.stderr || e.message)) || String(e);
          console.log('[check-after-edit] FAIL');
          writeResult({ status: 'FAIL', startedAt, finishedAt: new Date().toISOString(), stdout: errOut });
        }
      } catch (_) {
        // never throw from plugin hook
      }
    },
  };
});
