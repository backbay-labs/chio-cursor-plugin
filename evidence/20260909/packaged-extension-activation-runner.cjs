const vscode = require('vscode');
const fs = require('node:fs');
const assert = require('node:assert/strict');
exports.run = async function () {
  const extension = vscode.extensions.getExtension('chio.chio-cursor');
  assert.ok(extension, 'packaged extension discovered');
  await extension.activate();
  assert.equal(extension.isActive, true);
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('chio.init'));
  await vscode.commands.executeCommand('chio.init');
  const root = '/tmp/chio-cursor-20260909/gui-workspace';
  const hooks = JSON.parse(fs.readFileSync(root + '/.cursor/hooks.json', 'utf8'));
  assert.equal(hooks.hooks.afterFileEdit[0].command, 'printf operator-custom-hook');
  assert.equal(hooks.hooks.preToolUse[0].failClosed, true);
  const copied = ['pretooluse', 'composer', 'shell', 'tool'].map(name => {
    const file = root + '/.chio/hooks/' + name + '.mjs';
    assert.ok(fs.statSync(file).size > 0);
    return { name, bytes: fs.statSync(file).size };
  });
  fs.writeFileSync('/tmp/chio-cursor-20260909/gui-test/result.json', JSON.stringify({extension:extension.id,version:extension.packageJSON.version,isActive:extension.isActive,commands:commands.filter(x=>x.startsWith('chio.')),unrelatedHookPreserved:true,copied},null,2));
};
