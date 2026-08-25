# Files

- [Daily Internal Release](daily-release.md) - Scheduled and manual release automation validates the default branch, applies Supabase migrations, deploys the cleaner then CRM through Vercel, and smokes the hosted routes. The provider-facing jobs use the GitHub `internal-deployment` environment.
- [OpenWiki Automation, Diagram Validation, and Connector Contract](openwiki-automation.md) - A pinned GitHub Actions workflow refreshes OpenWiki and creates a documentation pull request. Repository-local skills prescribe Mermaid validation and secure built-in connector implementation, but no connector source is implemented here.
