# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2025-04-22
### Changed
- Updated testing approach to use remote servers instead of local instances
- Added comprehensive connectivity tests for E2B, Supabase, and Inngest services
- Implemented more resilient test retry logic for external services
- Added environment variable configuration for remote service endpoints

## [1.2.1] - 2025-04-20
### Fixed
- Fixed API tests to properly check for stdout in result logs
- Updated error handling test to check for error message with status code 200
- Improved test resilience with proper server readiness checks and timeouts
- Enhanced E2B trigger tests with better connection handling

## [1.2.0] - 2025-04-19
### Added
- Integrated E2B service with main Athenic backend
- Added LLM-based detection of code execution requests
- Created comprehensive test suite covering API, WebSocket, Sandbox operations
- Implemented streaming output via WebSockets

### Fixed
- Fixed sandbox resource management to properly close connections
- Ensured proper error propagation in streaming mode

## [1.1.1] - 2025-04-17
### Fixed
- Fixed sandbox ID property name inconsistency
- Updated timeout handling for long-running operations
- Improved output streaming for different formats
- Enhanced language template selection

## [1.1.0] - 2025-04-15
### Added
- WebSocket support for streaming code execution
- Enhanced error handling
- Sandbox resource management system

### Changed
- Switched to E2B SDK v0.11.0
- Improved API response format

## [1.0.0] - 2025-04-12
### Added
- Initial release of the E2B service
- Basic API endpoints for code execution
- Support for Python code execution
- Environment setup and configuration 