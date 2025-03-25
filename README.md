# VSCode TFVC Extension

A Visual Studio Code extension for Team Foundation Version Control (TFVC).

## Features

- Seamless integration with TFVC repositories
- Auto-checkout of files when editing
- View and manage pending changes
- File status indicators
- Checkin/checkout operations
- View file history
- View diffs between versions
- Branch management
- Shelveset management

## Requirements

- Visual Studio Code 1.60.0 or higher
- Visual Studio with Team Explorer installed or Azure DevOps/TFS command line tools

## Installation

1. Install the extension from the VS Code Marketplace
2. Ensure the TFVC command-line tools are available in your PATH or configure the extension to use a specific path

## Configuration

This extension contributes the following settings:

- `tfvc.tfPath`: Path to the 'tf' command-line tool
- `tfvc.useVisualStudioCredentials`: Use Visual Studio credentials for authentication (true/false)
- `tfvc.logLevel`: Log level for the extension (Error, Warning, Info, Debug)
- `tfvc.autoCheckout`: Automatically checkout files when edited (true/false)
- `tfvc.autoCheckoutOnSave`: Automatically checkout files only when saved (true/false)
- `tfvc.showFileStatus`: Show TFVC status in the editor gutter (true/false)
- `tfvc.showStatusBarItem`: Show TFVC status item in the status bar (true/false)

## Commands

- `vscode-tfvc.checkout`: Checkout the currently open file
- `vscode-tfvc.checkin`: Checkin selected files
- `vscode-tfvc.refresh`: Refresh the status of pending changes
- `vscode-tfvc.getLatest`: Get the latest version of files
- `vscode-tfvc.showHistory`: Show history for the current file
- `vscode-tfvc.showDiff`: Show differences between current and server version
- `vscode-tfvc.createShelveset`: Create a shelveset of pending changes
- `vscode-tfvc.applyShelveset`: Apply a shelveset to the workspace

## Development

### Prerequisites

- Node.js 16.x or higher
- TypeScript 4.3.5 or higher
- VS Code Extension Development environment

### Setup

1. Clone this repository
2. Run `npm install` to install dependencies
3. Open the project in VS Code

### Build and Run

- Use `npm run compile` to compile the TypeScript code
- Use `npm run lint` to lint the code
- Use `npm run test` to run the tests
- Press F5 to launch the extension in a new VS Code window

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Guidelines

1. Follow the existing code style
2. Add tests for new features
3. Update documentation as needed
4. Ensure tests pass before submitting a PR

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Microsoft for the TFVC platform
- VS Code team for their extension development framework 