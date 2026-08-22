# Security policy

## Supported version

Security fixes are applied to the latest source revision and current 1.0.x desktop build. Older portable builds may not receive updates.

## Reporting a vulnerability

Do not open a public issue containing exploit steps, malicious media, or private data. Contact the repository owner privately through the security-reporting method configured on the GitHub repository. Include:

- the affected version and operating system;
- a minimal reproduction or proof of concept;
- the expected impact;
- whether the issue affects the browser build, Electron build, or generated blueprint.

Avoid accessing data that is not yours and do not distribute a weaponized file. The maintainer should acknowledge a complete report, assess its scope, prepare a fix, and coordinate disclosure before details are made public.

## Desktop trust boundary

The Electron application reads user-selected local media and invokes its bundled FFmpeg process. Open only media and font files you trust. Generated Factorio blueprint strings should also be reviewed before sharing, especially after changes to generation logic.
