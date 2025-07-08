# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [2.0.0] - 2025-07-07

### Changed

- Official release of agent version using ReACT algorithm

## [1.1.1] - 2024-11-02

### Fixed

- Fixed issue with failing to invoke `/insight` command (#14)

## [1.1.0] - 2024-10-31

### Added

- Added `/insight` slash command (#10)
- Added `/findings-report` slash command (#13)
- Added documentation on how to deploy/use two slash commands

### Changed

- Improved logging style

### Fixed

- Fixed typos, etc.

## [1.0.2] - 2024-10-18

### Added

- Feature to get metric data in metrics that is chosen by ToolUse (#8)
- Feature to show the hypothesis of failure analysis with image (#9)

### Changed

- Updated documentation (#3, #4)

## [1.0.1] - 2024-07-26

### Changed

- Removed unused parameter (SNS topic ARN) from Slack App version (#1)

### Added

- Added dotfiles for development tools (#2)

## [1.0.0] - 2024-07-25

### Added

- Initial release
- Includes two versions:
  - `main` branch for Slack App
  - `chatbot-customaction` branch for AWS Chatbot Custom Action
