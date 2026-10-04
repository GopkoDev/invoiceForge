// AC-18 (ADR-0003 layer 2): every server action the framework would run (an exported function of a
// 'use server' module, or a function carrying an inline 'use server') resolves the session first —
// `const x = await guard()` then `if (!x.success) return …` — except the sign-in actions and the
// session helper itself. A static scan over the source text of every JS/TS file in the repo (not
// only app/, lib/ and components/), where the guard counts only when it is imported from its
// canonical module.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_FILE = /\.(tsx?|jsx?|mjs)$/;
// Never source the app ships: dependencies, build output, VCS and tool state (.claude holds other
// worktrees' checkouts), at any depth...
const SKIP_ANYWHERE = new Set(['node_modules', '.next', '.git', '.claude']);
// ...and the repo-root folders of docs, tests and test/report output.
const SKIP_AT_ROOT = new Set([
  'docs',
  'tests',
  'test-results',
  'playwright-report',
  'coverage',
]);
// Each guard, by the module (repo-relative, no extension) it must be imported from.
const CANONICAL_GUARDS: Record<string, string> = {
  actingFreelancerFromSession: 'lib/helpers/session-actor',
  getAuthenticatedUser: 'lib/helpers/auth-helpers',
};
// The only exemptions, by file and exported name: the sign-in actions run for a Visitor by design,
// and getAuthenticatedUser is the session check itself.
const EXEMPT: Record<string, ReadonlySet<string>> = {
  'lib/actions/login-actions.ts': new Set([
    'signInWithEmail',
    'signInWithGoogle',
  ]),
  'lib/helpers/auth-helpers.ts': new Set(['getAuthenticatedUser']),
};

function listFiles(dir: string, root = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_ANYWHERE.has(entry.name)) return [];
      if (dir === root && SKIP_AT_ROOT.has(entry.name)) return [];
      return listFiles(full, root);
    }
    return entry.isFile() && SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

/** An import specifier as a repo-relative module path without extension, or undefined for a package. */
function resolveModule(specifier: string, file: string): string | undefined {
  let target: string;
  if (specifier.startsWith('@/')) target = specifier.slice(2);
  else if (specifier.startsWith('.'))
    target = path.posix.join(path.posix.dirname(file), specifier);
  else return undefined;
  return path.posix
    .normalize(target)
    .replace(SOURCE_FILE, '')
    .replace(/\/index$/, '');
}

/**
 * The guard names a file may call: those it imports, under their own name, from the guard's
 * canonical module (a guard's own module may also call it directly).
 */
function importedGuards(sf: ts.SourceFile, file: string): ReadonlySet<string> {
  const names = new Set<string>();
  const self = file.replace(SOURCE_FILE, '');
  for (const [guard, guardModule] of Object.entries(CANONICAL_GUARDS)) {
    if (guardModule === self) names.add(guard);
  }
  for (const st of sf.statements) {
    if (
      !ts.isImportDeclaration(st) ||
      !ts.isStringLiteral(st.moduleSpecifier) ||
      st.importClause?.isTypeOnly
    )
      continue;
    const bindings = st.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const source = resolveModule(st.moduleSpecifier.text, file);
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (
        !element.isTypeOnly &&
        element.name.text === imported &&
        CANONICAL_GUARDS[imported] === source
      )
        names.add(imported);
    }
  }
  return names;
}

function parse(name: string, source: string): ts.SourceFile {
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
}

function isUseServerDirective(st: ts.Statement): boolean {
  return (
    ts.isExpressionStatement(st) &&
    ts.isStringLiteral(st.expression) &&
    st.expression.text === 'use server'
  );
}

/** The directive prologue is the run of string-literal statements at the top. */
function hasUseServerPrologue(statements: readonly ts.Statement[]): boolean {
  for (const st of statements) {
    if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)))
      return false;
    if (st.expression.text === 'use server') return true;
  }
  return false;
}

function isUseServerModule(sf: ts.SourceFile): boolean {
  return hasUseServerPrologue(sf.statements);
}

function hasModifier(st: ts.Statement, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(st) &&
    !!ts.getModifiers(st)?.some((m) => m.kind === kind)
  );
}

function isFunctionLike(
  n: ts.Node
): n is ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n)
  );
}

/** `const x = await guard()` — the guard call, awaited and bound to a name. Returns the name. */
function guardBinding(
  st: ts.Statement | undefined,
  guards: ReadonlySet<string>
): string | undefined {
  if (!st || !ts.isVariableStatement(st)) return undefined;
  const decls = st.declarationList.declarations;
  if (decls.length !== 1) return undefined;
  const [d] = decls;
  const init = d.initializer;
  if (
    !ts.isIdentifier(d.name) ||
    !init ||
    !ts.isAwaitExpression(init) ||
    !ts.isCallExpression(init.expression) ||
    !ts.isIdentifier(init.expression.expression) ||
    !guards.has(init.expression.expression.text)
  )
    return undefined;
  return d.name.text;
}

/** `if (!x.success) return …` — an early return on the guard's failure. */
function isFailureReturn(st: ts.Statement | undefined, name: string): boolean {
  if (!st || !ts.isIfStatement(st) || st.elseStatement) return false;
  const cond = st.expression;
  if (
    !ts.isPrefixUnaryExpression(cond) ||
    cond.operator !== ts.SyntaxKind.ExclamationToken ||
    !ts.isPropertyAccessExpression(cond.operand) ||
    !ts.isIdentifier(cond.operand.expression) ||
    cond.operand.expression.text !== name ||
    cond.operand.name.text !== 'success'
  )
    return false;
  const then = st.thenStatement;
  if (ts.isReturnStatement(then)) return true;
  return (
    ts.isBlock(then) &&
    then.statements.length > 0 &&
    ts.isReturnStatement(then.statements[0])
  );
}

function bodyIsGuarded(fn: ts.Node, guards: ReadonlySet<string>): boolean {
  if (!(isFunctionLike(fn) || ts.isMethodDeclaration(fn))) return false;
  if (!fn.body || !ts.isBlock(fn.body)) return false;
  const stmts = fn.body.statements.filter((s) => !isUseServerDirective(s));
  const name = guardBinding(stmts[0], guards);
  return !!name && isFailureReturn(stmts[1], name);
}

/**
 * Offenders in one source file: unguarded exported actions of a 'use server' module, exports the
 * scan cannot inspect (re-exports, default exports, non-function values), and unguarded inline
 * 'use server' functions anywhere in the file. `file` is its repo-relative path, which resolves
 * relative imports of the guard.
 */
function findOffenders(
  source: string,
  exempt: ReadonlySet<string> = new Set(),
  file = 'lib/actions/planted.tsx'
): string[] {
  const sf = parse(file, source);
  const guards = importedGuards(sf, file);
  const bad: string[] = [];
  const checked = new Set<ts.Node>();
  const check = (fn: ts.Node, name: string, label = name) => {
    checked.add(fn);
    if (!exempt.has(name) && !bodyIsGuarded(fn, guards)) bad.push(label);
  };

  if (isUseServerModule(sf)) {
    for (const st of sf.statements) {
      if (ts.isExportAssignment(st)) {
        bad.push('default export');
      } else if (ts.isExportDeclaration(st)) {
        if (!st.isTypeOnly) bad.push('re-export');
      } else if (hasModifier(st, ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(st)) {
          if (hasModifier(st, ts.SyntaxKind.DefaultKeyword)) {
            bad.push('default export');
          } else {
            check(st, st.name?.text ?? '?');
          }
        } else if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            const name = ts.isIdentifier(d.name) ? d.name.text : '?';
            if (d.initializer && isFunctionLike(d.initializer)) {
              check(d.initializer, name);
            } else if (!exempt.has(name)) {
              bad.push(`${name} (not a function)`);
            }
          }
        } else if (
          !ts.isTypeAliasDeclaration(st) &&
          !ts.isInterfaceDeclaration(st)
        ) {
          // classes, enums, namespaces: values the framework cannot run, so not allowed here
          bad.push('export (not a function)');
        }
      }
    }
  }

  const visit = (n: ts.Node) => {
    if (
      (isFunctionLike(n) || ts.isMethodDeclaration(n)) &&
      !checked.has(n) &&
      n.body &&
      ts.isBlock(n.body) &&
      hasUseServerPrologue(n.body.statements)
    ) {
      const name =
        ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) &&
          n.name &&
          ts.isIdentifier(n.name) &&
          n.name.text) ||
        (ts.isVariableDeclaration(n.parent) &&
          ts.isIdentifier(n.parent.name) &&
          n.parent.name.text) ||
        'inline action';
      check(n, name, `inline:${name}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return bad;
}

function scanFiles(): string[] {
  return listFiles(ROOT).filter((f) =>
    fs.readFileSync(f, 'utf8').includes('use server')
  );
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

describe('server actions session guard scan (AC-18)', () => {
  const files = scanFiles();

  it('finds the action modules, including the one outside lib/actions', () => {
    const modules = files
      .filter((f) => isUseServerModule(parse(f, fs.readFileSync(f, 'utf8'))))
      .map(rel);
    expect(modules.length).toBeGreaterThan(5);
    expect(modules).toContain('lib/helpers/auth-helpers.ts');
    expect(modules).toContain('lib/actions/login-actions.ts');
  });

  it('every action resolves the session first and returns early on failure', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const exempt = EXEMPT[rel(file)] ?? new Set<string>();
      for (const name of findOffenders(
        fs.readFileSync(file, 'utf8'),
        exempt,
        rel(file)
      )) {
        offenders.push(`${rel(file)}:${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the exemptions are exactly the two sign-in actions and the session helper', () => {
    const exported = (file: string) =>
      parse(file, fs.readFileSync(path.join(ROOT, file), 'utf8'))
        .statements.filter(ts.isFunctionDeclaration)
        .filter((f) => hasModifier(f, ts.SyntaxKind.ExportKeyword))
        .map((f) => f.name?.text)
        .sort();
    expect(exported('lib/actions/login-actions.ts')).toEqual([
      'signInWithEmail',
      'signInWithGoogle',
    ]);
    expect(exported('lib/helpers/auth-helpers.ts')).toEqual([
      'getAuthenticatedUser',
    ]);
    expect(Object.keys(EXEMPT).sort()).toEqual([
      'lib/actions/login-actions.ts',
      'lib/helpers/auth-helpers.ts',
    ]);
  });

  describe('planted shapes', () => {
    const guarded = `const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;`;
    const GUARD_IMPORT = `import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';`;
    /** Adds the canonical guard import, after a leading 'use server' directive when there is one. */
    const withGuardImport = (src: string): string => {
      const directive = /^(['"])use server\1;?\n/.exec(src);
      return directive
        ? `${directive[0]}${GUARD_IMPORT}\n${src.slice(directive[0].length)}`
        : `${GUARD_IMPORT}\n${src}`;
    };

    it('flags an unguarded export and passes a guarded one', () => {
      const planted = `'use server';
export async function leaky(id: string) {
  const row = await db.thing.findUnique({ where: { id } });
  return row;
}
export async function fine() {
  ${guarded}
  return actor;
}`;
      expect(findOffenders(withGuardImport(planted))).toEqual(['leaky']);
    });

    it('flags a guard whose result is never checked, or not awaited', () => {
      const planted = `'use server';
export async function noCheck() {
  const actor = await actingFreelancerFromSession();
  return db.thing.findMany();
}
export async function noAwait() {
  const actor = actingFreelancerFromSession();
  if (!actor.success) return actor;
}
export const bareCall = async () => {
  await actingFreelancerFromSession();
  return db.thing.findMany();
};`;
      expect(findOffenders(withGuardImport(planted))).toEqual([
        'noCheck',
        'noAwait',
        'bareCall',
      ]);
    });

    it('flags a guard that is not the first statement', () => {
      const planted = `'use server';
export async function late() {
  await db.thing.deleteMany();
  ${guarded}
}`;
      expect(findOffenders(withGuardImport(planted))).toEqual(['late']);
    });

    it('flags re-exports, default exports and non-function exports', () => {
      expect(
        findOffenders(`'use server';\nexport { leaky } from './other';`)
      ).toEqual(['re-export']);
      expect(findOffenders(`'use server';\nexport * from './other';`)).toEqual([
        're-export',
      ]);
      expect(
        findOffenders(`'use server';\nexport default async function () {}`)
      ).toEqual(['default export']);
      expect(
        findOffenders(
          `'use server';\nconst f = async () => {};\nexport default f;`
        )
      ).toEqual(['default export']);
      expect(
        findOffenders(`'use server';\nexport const leaky = other;`)
      ).toEqual(['leaky (not a function)']);
      expect(findOffenders(`'use server';\nexport class Leaky {}`)).toEqual([
        'export (not a function)',
      ]);
      // a default export is refused even when guarded: the scan names every action it allows
      expect(
        findOffenders(`'use server';
export default async function () {
  ${guarded}
}`)
      ).toEqual(['default export']);
      expect(
        findOffenders(`'use server';\nexport type { Foo } from './other';`)
      ).toEqual([]);
      expect(
        findOffenders(
          `'use server';\nexport type Foo = { a: string };\nexport interface Bar { b: string }`
        )
      ).toEqual([]);
    });

    it('flags an unguarded inline use-server function, in any file', () => {
      const planted = `export function Form() {
  async function save(data: FormData) {
    'use server';
    await db.thing.create({ data });
  }
  return null;
}
export function Fine() {
  async function save() {
    'use server';
    ${guarded}
  }
  return null;
}`;
      expect(findOffenders(withGuardImport(planted))).toEqual(['inline:save']);
    });

    it('flags an unguarded inline use-server function inside a use-server module, or a method', () => {
      const inModule = `'use server';
export async function fine() {
  ${guarded}
  async function nested() {
    'use server';
    await db.thing.deleteMany();
  }
  return nested;
}`;
      expect(findOffenders(withGuardImport(inModule))).toEqual([
        'inline:nested',
      ]);
      const method = `const handlers = {
  async remove() {
    "use server";
    await db.thing.deleteMany();
  },
};`;
      expect(findOffenders(method)).toEqual(['inline:remove']);
    });

    it('honours an explicit exemption by name only', () => {
      const src = `'use server';
export async function getAuthenticatedUser() { return ok({}); }
export async function other() { return ok({}); }`;
      expect(findOffenders(src, new Set(['getAuthenticatedUser']))).toEqual([
        'other',
      ]);
    });

    it('accepts the guard only when it is imported from its canonical module (R-14)', () => {
      const body = `export async function act() {
  ${guarded}
  return actor;
}`;
      // The canonical import, by alias or by a relative path that resolves to it.
      expect(findOffenders(withGuardImport(`'use server';\n${body}`))).toEqual(
        []
      );
      expect(
        findOffenders(
          `'use server';\nimport { actingFreelancerFromSession } from '../helpers/session-actor';\n${body}`,
          new Set(),
          'lib/actions/planted-actions.ts'
        )
      ).toEqual([]);
      expect(
        findOffenders(`'use server';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
export async function act() {
  const user = await getAuthenticatedUser();
  if (!user.success) return user;
  return user;
}`)
      ).toEqual([]);

      // The right name from the wrong module, a renamed import, a local look-alike, no import at
      // all, and a relative path that resolves somewhere else.
      expect(
        findOffenders(
          `'use server';\nimport { actingFreelancerFromSession } from '@/lib/helpers/fake-guard';\n${body}`
        )
      ).toEqual(['act']);
      expect(
        findOffenders(
          `'use server';\nimport { actingFreelancerForRoute as actingFreelancerFromSession } from '@/lib/helpers/session-actor';\n${body}`
        )
      ).toEqual(['act']);
      expect(
        findOffenders(
          `'use server';\n${body}\nasync function actingFreelancerFromSession() { return { success: true }; }`
        )
      ).toEqual(['act']);
      expect(findOffenders(`'use server';\n${body}`)).toEqual(['act']);
      expect(
        findOffenders(
          `'use server';\nimport { actingFreelancerFromSession } from '../helpers/session-actor';\n${body}`,
          new Set(),
          'app/planted/actions.ts'
        )
      ).toEqual(['act']);
    });
  });

  describe('the walk (R-14)', () => {
    it('covers the repo root and every JS/TS source extension, and skips build, vendor, docs and test folders', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-scan-walk-'));
      try {
        const kept = [
          'app/b.tsx',
          'd.jsx',
          'lib/a.ts',
          'scripts/e.mjs',
          'server/c.js',
        ];
        for (const rel of [
          ...kept,
          'README.md',
          'node_modules/x/f.ts',
          '.next/server/g.js',
          '.git/hooks/h.js',
          '.claude/worktrees/w/lib/k.ts',
          'docs/i.ts',
          'tests/unit/j.ts',
        ]) {
          fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
          fs.writeFileSync(path.join(tmp, rel), `'use server';\n`);
        }

        const found = listFiles(tmp)
          .map((f) => path.relative(tmp, f).split(path.sep).join('/'))
          .sort();
        expect(found).toEqual(kept);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
