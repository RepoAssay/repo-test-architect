// Manual review harness: observations, NOT a passing release gate.
// Only temporary fixture copies are changed. No native code, network, or package installation is run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdapter } from '../../src/core/adapter-registry.js';
import { auditDetectedProjects } from '../../src/core/project-auditor.js';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rta-adapter-trust-'));
const cases = {
  javascript: 'node-vitest-basic', python: 'python-pytest-service', kotlin: 'kotlin-junit-basic',
  swift: 'swift-spm-xctest', go: 'go-testing-basic', rust: 'rust-cargo-basic',
  csharp: 'csharp-sdk-xunit-basic', ruby: 'ruby-minitest-basic', php: 'php-phpunit-basic',
  elixir: 'elixir-mix-exunit-basic', dart: 'dart-test-basic'
};

const fixtures = cases;
const results = [];
try {
const summarize = audit => ({ command: audit.profile.testCommand ?? null, blockers: audit.profile.blockers,
  targets: audit.recommended.map(t => t.path),
  evidence: audit.coveredButRisky.flatMap(t => (t.existingTestEvidence ?? []).map(e => ({source:t.path, ...e}))) });
for (const [id, fixture] of Object.entries(cases)) {
  const adapter = getAdapter(id);
  const original = path.join(repo, 'examples', fixture);
  const baseline = adapter.audit(original);
  const sourcePath = baseline.recommended[0].path;
  const testPaths = [...new Set(baseline.coveredButRisky.flatMap(t => t.existingTestPaths))];
  for (const mode of ['source-symlink', 'test-symlink', 'broken-source-symlink', 'comment-only-tests']) {
    if (process.platform === 'win32' && mode.includes('symlink')) {
      results.push({ id, fixture, mode, skipped: 'Symlink probes require a POSIX host in this manual harness.' });
      continue;
    }
    const root = path.join(scratch, `${id}-${mode}`);
    fs.cpSync(original, root, {recursive:true});
    const selected = mode === 'test-symlink' ? testPaths[0] : sourcePath;
    if (mode === 'comment-only-tests') {
      for (const testPath of testPaths) {
        const filename = path.join(root, testPath);
        const content = fs.readFileSync(filename, 'utf8');
        const wrapped = id === 'python' ? `'''\n${content}\n'''\n`
          : id === 'ruby' ? `=begin\n${content}\n=end\n`
          : id === 'elixir' ? content.split('\n').map(line => '# ' + line).join('\n')
          : `/*\n${content}\n*/\n`;
        fs.writeFileSync(filename, wrapped);
      }
    } else {
      const external = path.join(scratch, `${id}-${mode}-external`);
      fs.renameSync(path.join(root, selected), external);
      fs.symlinkSync(mode === 'broken-source-symlink' ? external + '-missing' : external, path.join(root, selected));
    }
    try {
      const audit = adapter.audit(root);
      results.push({ id, fixture, mode, selected, ...summarize(audit) });
    } catch(error) { results.push({id, fixture, mode, selected, error:error.message}); }
  }
}

function probe(id, label, mutate, projects=false) {
  const root=path.join(scratch,`${id}-${label}`);
  fs.cpSync(path.join(repo,'examples',fixtures[id]),root,{recursive:true});
  const adapter=getAdapter(id);
  const baseline=adapter.audit(root);
  const tests=[...new Set(baseline.coveredButRisky.flatMap(t=>t.existingTestPaths))];
  const write=(p,content)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),content)};
  const change=(p,fn)=>write(p,fn(fs.readFileSync(path.join(root,p),'utf8')));
  mutate({root,tests,write,change});
  try {
    const audit=adapter.audit(root);
    results.push({id,label,command:audit.profile.testCommand??null,confidence:audit.profile.confidence,blockers:audit.profile.blockers,
      targets:audit.recommended.map(t=>t.path),evidence:audit.coveredButRisky.flatMap(t=>(t.existingTestEvidence??[]).map(e=>({source:t.path,...e}))),
      ...(projects?{projects:auditDetectedProjects(root).audits.map(a=>({root:a.projectRoot,targets:a.audit.recommended.map(t=>t.path)}))}:{})});
  } catch(error){results.push({id,label,error:error.message})}
}
for(const id of ['kotlin','swift','rust']) probe(id,'nested-comment-tests',({tests,change})=>{
  for(const p of tests) change(p,s=>`/* outer /* inner */\n${s}\n*/\n`);
});
probe('php','foreign-testcase',({tests,change})=>{
  for(const p of tests) change(p,s=>s.replace('use PHPUnit\\Framework\\TestCase;','use Acme\\Support\\TestCase;'));
});
probe('php','nowdoc-tests',({tests,change})=>{
  for(const p of tests) change(p,s=>`<?php\n$documentation = <<<'DOC'\n${s}\nDOC;\n`);
});
probe('ruby','heredoc-tests',({tests,change})=>{
  for(const p of tests) change(p,s=>`documentation = <<~'DOC'\n${s}\nDOC\n`);
});
probe('elixir','heredoc-tests',({tests,change})=>{
  for(const p of tests) change(p,s=>`documentation = """\n${s}\n"""\n`);
});
probe('csharp','raw-string-tests',({tests,change})=>{
  for(const p of tests) change(p,s=>`namespace Documentation;\npublic class Example { public const string Text = """\n${s}\n"""; }\n`);
});
probe('go','raw-string-tests',({tests,change})=>{
  for(const p of tests) change(p,s=>`package checkout\nconst doc = \x60\n${s}\n\x60\n`);
});
probe('kotlin','commented-build',({change})=>change('build.gradle.kts',s=>`/*\n${s}\n*/\n`));
probe('swift','commented-manifest',({change})=>change('Package.swift',s=>`/*\n${s}\n*/\n`));
probe('python','commented-pytest-dependency',({write})=>write('pyproject.toml','[project]\nname = "example"\nversion = "1.0.0"\n# pytest\n'));
probe('ruby','commented-rakefile',({change})=>change('Rakefile',s=>`=begin\n${s}\n=end\n`));
probe('rust','nested-src-package',({write})=>{
  write('src/Cargo.toml','[package]\nname = "nested"\nversion = "0.1.0"\nedition = "2021"\n');
  write('src/src/lib.rs','pub fn nested(value: i32) -> i32 { if value < 0 { 0 } else { value } }\n');
},true);
probe('python','nested-app-package',({write})=>{
  write('app/child/pyproject.toml','[project]\nname = "nested"\nversion = "1.0.0"\n');
  write('app/child/app/foreign.py','def foreign(value):\n    if value < 0:\n        return 0\n    return value\n');
},true);

console.log(JSON.stringify({
  scope: 'Fixture-based ownership, lexical evidence, and command counterexamples; not a live-corpus rerun.',
  fixtures, observationCount: results.length, observations: results
}, (_key, value) => typeof value === 'string' ? value.replaceAll(scratch, '<temporary-root>') : value, 2));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
