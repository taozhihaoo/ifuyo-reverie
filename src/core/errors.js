/**
 * Shared typed error for user-data files whose schema version is NEWER than
 * this build supports (M10 §26). Policy: read-only + refuse writes — never
 * silently reset or rewrite a file we don't fully understand. Recovery is
 * upgrading Reverie, not downgrading the file.
 */
export class UnsupportedVersionError extends Error {
  constructor(kind, filePath, foundVersion, supportedVersion) {
    super(`${kind} 的格式版本 (${foundVersion}) 比当前支持的版本 (${supportedVersion}) 更新，`
      + `已进入只读保护，拒绝写入以免丢失数据。请升级 Reverie 后再使用。`);
    this.name = 'UnsupportedVersionError';
    this.code = 'UNSUPPORTED_VERSION';
    this.kind = kind;
    this.filePath = filePath;
    this.foundVersion = foundVersion;
    this.supportedVersion = supportedVersion;
  }
}
