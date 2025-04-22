# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-04-22

### Changed
- Updated server implementation to use the new `@e2b/code-interpreter` package
- Improved error handling and session cleanup
- Fixed WebSocket output handling for stdout and stderr
- Added proper TypeScript typing for all parameters

## [1.0.0] - 2025-04-15

### Added
- Initial release of the E2B sandbox integration for Athenic
- HTTP API with WebSocket support for real-time code execution updates
- Support for executing code in isolated sandboxes
- Basic error handling and session management 