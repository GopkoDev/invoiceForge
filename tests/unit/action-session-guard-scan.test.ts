// AC-18 (ADR-0003 layer 2): every exported function of a 'use server' module under
// lib/actions/ except the sign-in actions resolves the session first, through
// actingFreelancerFromSession() or getAuthenticatedUser(). A static scan over source text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ACTIONS_DIR = path.resolve(__dirname, '../../lib/actions');
const GUARDS = ['actingFreelancerFromSession', 'getAuthenticatedUser'];
const SIGN_IN_ACTIONS = new Set(['signInWithEmail', 'signInWithGoogle']);

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  });
}

function parse(name: string, source: string): ts.SourceFile {
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
}

function isUseServer(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use server'
  );
}

function callsGuard(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && GUARDS.includes(n.expression.text)) {
      found = true;
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function isExported(st: ts.Statement): boolean {
  return ts.canHaveModifiers(st) && !!ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** Names of exported functions whose first statement does not resolve the session. */
function findUnguardedExports(source: string, exempt: ReadonlySet<string>): string[] {
  const bad: string[] = [];
  for (const st of parse('x.ts', source).statements) {
    if (!isExported(st)) continue;
    if (ts.isFunctionDeclaration(st) && st.name) {
      const first = st.body?.statements[0];
      if (!exempt.has(st.name.text) && !(first && callsGuard(first))) bad.push(st.name.text);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isIdentifier(d.name)) {
          const first = ts.isBlock(init.body) ? init.body.statements[0] : init.body;
          if (!exempt.has(d.name.text) && !(first && callsGuard(first))) bad.push(d.name.text);
        }
      }
    }
  }
  return bad;
}

describe('server actions session guard scan (AC-18)', () => {
  const modules = listFiles(ACTIONS_DIR).filter((f) => isUseServer(parse(f, fs.readFileSync(f, 'utf8'))));

  it('finds the action modules', () => {
    expect(modules.length).toBeGreaterThan(5);
  });

  it('every exported action except the sign-in actions resolves the session first', () => {
    const offenders: string[] = [];
    for (const file of modules) {
      const exempt = path.basename(file) === 'login-actions.ts' ? SIGN_IN_ACTIONS : new Set<string>();
      for (const name of findUnguardedExports(fs.readFileSync(file, 'utf8'), exempt)) {
        offenders.push(`${path.relative(ACTIONS_DIR, file)}:${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only login-actions.ts is exempt, and it exports only the two sign-in actions', () => {
    const sf = parse('l.ts', fs.readFileSync(path.join(ACTIONS_DIR, 'login-actions.ts'), 'utf8'));
    const names = sf.statements
      .filter(ts.isFunctionDeclaration)
      .filter(isExported)
      .map((f) => f.name?.text)
      .sort();
    expect(names).toEqual(['signInWithEmail', 'signInWithGoogle']);
  });

  it('fails the scan on a planted unguarded export', () => {
    const planted = `'use server';
export async function leaky(id: string) {
  const row = await db.thing.findUnique({ where: { id } });
  return row;
}
export async function fine() {
  const actor = await actingFreelancerFromSession();
  return actor;
}`;
    expect(findUnguardedExports(planted, new Set())).toEqual(['leaky']);
  });
});
