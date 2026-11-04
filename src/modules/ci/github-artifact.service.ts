import { Injectable } from '@nestjs/common';
import { createSign } from 'crypto';
import { inflateRawSync } from 'zlib';
import { CiSettings } from './ci.repository';

@Injectable()
export class GithubArtifactService {
  async downloadJUnit(settings: CiSettings, runId: number): Promise<string> {
    const token = await this.installationToken(settings.githubInstallationId);
    const base = `https://api.github.com/repos/${settings.repositoryOwner}/${settings.repositoryName}`;
    const artifacts = await this.githubJson<{ artifacts: Array<{ id: number; name: string; expired: boolean }> }>(`${base}/actions/runs/${runId}/artifacts`, token);
    const artifact = artifacts.artifacts.find((item) => item.name === settings.junitArtifactName && !item.expired);
    if (!artifact) throw new Error(`JUnit artifact '${settings.junitArtifactName}' was not found.`);
    const response = await fetch(`${base}/actions/artifacts/${artifact.id}/zip`, { headers: this.headers(token), redirect: 'follow' });
    if (!response.ok) throw new Error(`GitHub artifact download failed with HTTP ${response.status}.`);
    return this.extractXml(Buffer.from(await response.arrayBuffer()));
  }

  private async installationToken(installationId: number): Promise<string> {
    const appId = process.env.GITHUB_APP_ID; const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!appId || !privateKey) throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required to download GitHub artifacts.');
    const now = Math.floor(Date.now() / 1000);
    const header = this.base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = this.base64url(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }));
    const signer = createSign('RSA-SHA256'); signer.update(`${header}.${payload}`); signer.end();
    const jwt = `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jwt}`, 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!response.ok) throw new Error(`GitHub installation token request failed with HTTP ${response.status}.`);
    return (await response.json() as { token: string }).token;
  }

  private async githubJson<T>(url: string, token: string): Promise<T> {
    const response = await fetch(url, { headers: this.headers(token) });
    if (!response.ok) throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
    return response.json() as Promise<T>;
  }

  private headers(token: string) { return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }; }
  private base64url(value: string) { return Buffer.from(value).toString('base64url'); }

  private extractXml(zip: Buffer): string {
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error('GitHub artifact is not a valid ZIP file.');
    let offset = zip.readUInt32LE(end + 16);
    const entries = zip.readUInt16LE(end + 10);
    for (let index = 0; index < entries; index += 1) {
      if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory.');
      const method = zip.readUInt16LE(offset + 10); const compressedSize = zip.readUInt32LE(offset + 20);
      const nameLength = zip.readUInt16LE(offset + 28); const extraLength = zip.readUInt16LE(offset + 30); const commentLength = zip.readUInt16LE(offset + 32);
      const localOffset = zip.readUInt32LE(offset + 42); const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
      offset += 46 + nameLength + extraLength + commentLength;
      if (!/\.xml$/i.test(name)) continue;
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local file header.');
      const localNameLength = zip.readUInt16LE(localOffset + 26); const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(localOffset + 30 + localNameLength + localExtraLength, localOffset + 30 + localNameLength + localExtraLength + compressedSize);
      return (method === 0 ? data : method === 8 ? inflateRawSync(data) : (() => { throw new Error(`Unsupported ZIP compression method ${method}.`); })()).toString('utf8');
    }
    throw new Error('JUnit XML file was not found in the GitHub artifact.');
  }
}
