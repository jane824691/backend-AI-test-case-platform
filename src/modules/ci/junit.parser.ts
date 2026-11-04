export interface ParsedJUnitTest { identifier: string | null; suiteName: string | null; testName: string; outcome: 'passed' | 'failed' | 'skipped' | 'error'; durationMs: number | null; failureMessage: string | null; }

function decode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attribute(source: string, name: string): string | null {
  const match = source.match(new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`));
  return match ? decode(match[1] ?? match[2] ?? '') : null;
}

export function parseJUnit(xml: string): ParsedJUnitTest[] {
  const tests: ParsedJUnitTest[] = [];
  const testcasePattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(testcasePattern)) {
    const attrs = match[1]; const body = match[2] ?? '';
    const testName = attribute(attrs, 'name') ?? 'Unnamed test';
    const identifier = testName.match(/\[?(TC-[A-Za-z0-9_-]+)\]?/)?.[1] ?? null;
    const duration = Number(attribute(attrs, 'time'));
    const failure = body.match(/<(failure|error)\b[^>]*>([\s\S]*?)<\/\1>|<(failure|error)\b([^>]*)\/>/);
    const skipped = /<skipped\b/.test(body);
    const outcome = failure ? (failure[1] === 'error' || failure[3] === 'error' ? 'error' : 'failed') : skipped ? 'skipped' : 'passed';
    tests.push({ identifier, suiteName: attribute(attrs, 'classname'), testName, outcome, durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null, failureMessage: failure ? decode((failure[2] ?? failure[4] ?? '').trim()).slice(0, 10000) || null : null });
  }
  return tests;
}
