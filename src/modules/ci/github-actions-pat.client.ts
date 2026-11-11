import { Injectable } from '@nestjs/common';
import { inflateRawSync } from 'zlib';

export interface GithubWorkflowRun { id: number; run_attempt: number; workflow_id: number; name: string | null; head_branch: string | null; head_sha: string | null; conclusion: string | null; run_started_at: string | null; updated_at: string | null; }

@Injectable()
export class GithubActionsPatClient {
  async listCompletedRuns(owner: string, repo: string, workflowId: number, branch: string, token: string): Promise<GithubWorkflowRun[]> {
    const result: GithubWorkflowRun[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${workflowId}/runs?status=completed&branch=${encodeURIComponent(branch)}&per_page=100&page=${page}`;
      const response = await this.githubJson<{ workflow_runs: GithubWorkflowRun[] }>(url, token);
      result.push(...response.workflow_runs);
      if (response.workflow_runs.length < 100) break;
    }
    return result;
  }

  async downloadJUnit(owner: string, repo: string, runId: number, artifactName: string, token: string): Promise<string> {
    const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const artifacts = await this.githubJson<{ artifacts: Array<{ id: number; name: string; expired: boolean }> }>(`${base}/actions/runs/${runId}/artifacts?per_page=100`, token);
    const matches = artifacts.artifacts.filter((item) => item.name === artifactName && !item.expired);
    if (matches.length !== 1) throw new Error(matches.length ? `Multiple active artifacts named '${artifactName}' were found.` : `JUnit artifact '${artifactName}' was not found or has expired.`);
    const response = await fetch(`${base}/actions/artifacts/${matches[0].id}/zip`, { headers: this.headers(token), redirect: 'follow' });
    if (!response.ok) throw new Error(`GitHub artifact download failed with HTTP ${response.status}.`);
    return this.extractSingleXml(Buffer.from(await response.arrayBuffer()));
  }

  private async githubJson<T>(url: string, token: string): Promise<T> { const response = await fetch(url, { headers: this.headers(token) }); if (!response.ok) throw new Error(`GitHub API request failed with HTTP ${response.status}.`); return response.json() as Promise<T>; }
  private headers(token: string) { return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }; }
  private extractSingleXml(zip: Buffer): string {
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (end < 0) throw new Error('GitHub artifact is not a valid ZIP file.');
    let offset = zip.readUInt32LE(end + 16); const entries = zip.readUInt16LE(end + 10); const xmls: Buffer[] = [];
    for (let index = 0; index < entries; index += 1) { if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory.'); const method = zip.readUInt16LE(offset + 10); const compressedSize = zip.readUInt32LE(offset + 20); const nameLength = zip.readUInt16LE(offset + 28); const extraLength = zip.readUInt16LE(offset + 30); const commentLength = zip.readUInt16LE(offset + 32); const localOffset = zip.readUInt32LE(offset + 42); const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'); offset += 46 + nameLength + extraLength + commentLength; if (!/\.xml$/i.test(name)) continue; if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local file header.'); const localNameLength = zip.readUInt16LE(localOffset + 26); const localExtraLength = zip.readUInt16LE(localOffset + 28); const data = zip.subarray(localOffset + 30 + localNameLength + localExtraLength, localOffset + 30 + localNameLength + localExtraLength + compressedSize); xmls.push(method === 0 ? data : method === 8 ? inflateRawSync(data) : (() => { throw new Error(`Unsupported ZIP compression method ${method}.`); })()); }
    if (xmls.length !== 1) throw new Error(xmls.length ? 'JUnit artifact must contain exactly one XML file.' : 'JUnit XML file was not found in the GitHub artifact.'); return xmls[0].toString('utf8');
  }
}
