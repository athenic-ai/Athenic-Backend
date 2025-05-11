# Changelog

## [Unreleased]

### Added
- MCP server integration fixes: Updated `buildMcpServersConfig` to correctly identify active connections and fetch corresponding MCP server details
- Added e2bSandboxId tracking in Inngest agent responses when MCP tools are executed
- Improved E2B integration in the chat interface by passing sandbox IDs through SSE responses
- Added global tracking of MCP server to E2B sandbox mappings for reuse

### Changed

### Fixed
- Fixed "MCP server not found" error by properly retrieving connection objects from the database
- Fixed connection status detection by checking for "mcpRunning" status
- Fixed E2B sandbox reuse by passing sandbox IDs correctly between Inngest and the frontend

### Removed 