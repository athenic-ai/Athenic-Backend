# Changelog

## [Unreleased]

### Added
- MCP server integration fixes: Updated `buildMcpServersConfig` to correctly identify active connections and fetch corresponding MCP server details
- Added e2bSandboxId tracking in Inngest agent responses when MCP tools are executed
- Improved E2B integration in the chat interface by passing sandbox IDs through SSE responses
- Added global tracking of MCP server to E2B sandbox mappings for reuse
- Extensive logging and error handling to MCP server discovery and config building in `buildMcpServersConfig`.
- Additional logs in `inngest.ts` to trace MCP server config flow and agent options.
- Warnings for name mismatches between LLM tool calls and available MCP servers.
- Improved sandbox ID lookup with case-insensitive matching and key listing for easier debugging.

### Changed

### Fixed
- Fixed "MCP server not found" error by properly retrieving connection objects from the database
- Fixed connection status detection by checking for "mcpRunning" status
- Fixed E2B sandbox reuse by passing sandbox IDs correctly between Inngest and the frontend
- Improved robustness of MCP config parsing and matching, which should resolve issues where MCP servers were not found by the agent.

### Removed 