# Changelog

All notable changes to the Athenic E2B Service will be documented in this file.

## [1.1.0] - 2025-04-20

### Fixed
- Updated E2B client to use the current SDK methods for sandbox creation and termination
- Fixed `Sandbox.create()` parameters to match the current SDK requirements
- Changed sandbox termination from using `this.sandbox.terminal.process.kill()` to the proper `this.sandbox.kill()` method
- Updated error handling in the `runCode` method to properly return errors as strings

### Improved
- Enhanced end-to-end flow tests with better error handling and timeout management
- Modified integration tests to automatically skip when E2B API key is not available
- Added additional error handling in test setup to prevent test failures when E2B service is unavailable
- Increased timeouts for tests involving package installation and external API calls
- Improved test reliability by adding more comprehensive checks for success/error conditions

### Documentation
- Updated README with information about E2B SDK integration and testing improvements
- Added this CHANGELOG file to track future updates

## [1.0.0] - 2025-03-01

### Added
- Initial release of the Athenic E2B Service
- Support for executing code in secure sandboxed environments
- WebSocket streaming of code execution results
- Message analysis to determine execution needs
- Integration with the main Athenic platform 