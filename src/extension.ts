import * as vscode from 'vscode';
import { TfvcProvider } from './tfvcProvider';
import { TfvcCommand } from './tfvcCommand';
import { TfvcScmProvider } from './tfvcScmProvider';
import { FilesetManager } from './services/filesetManager';
import { Logger } from './services/logger';
import { PendingChangesTreeProvider } from './views/pendingChangesTreeProvider';
import { basename } from 'path';

const logger = Logger.getInstance();

export function activate(context: vscode.ExtensionContext): void {
    const tfvcProvider = new TfvcProvider();
    const scmProvider = new TfvcScmProvider();
    const filesetManager = FilesetManager.getInstance();
    const pendingChangesProvider = new PendingChangesTreeProvider();
    
    // Register source control provider
    const sourceControl = vscode.scm.createSourceControl('tfvc', 'TFVC');
    sourceControl.acceptInputCommand = new TfvcCommand('checkin', 'Check In');
    
    // Register the tree view
    const treeView = vscode.window.createTreeView('tfvcPendingChanges', {
        treeDataProvider: pendingChangesProvider,
        showCollapseAll: true
    });

    // Register commands
    const initializeCommand = vscode.commands.registerCommand('vscode-tfvc.initializeWorkspace', async () => {
        try {
            await tfvcProvider.initializeWorkspace();
            vscode.window.showInformationMessage('TFVC workspace initialized successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to initialize TFVC workspace: ${error}`);
        }
    });

    const checkinCommand = vscode.commands.registerCommand('vscode-tfvc.checkin', async () => {
        try {
            const includedFiles = filesetManager.getIncludedFiles();
            if (includedFiles.length === 0) {
                vscode.window.showWarningMessage('No files are included for check-in. Please include files using the Pending Changes view.');
                return;
            }

            const comment = await vscode.window.showInputBox({
                prompt: 'Enter check-in comment',
                placeHolder: 'Description of changes',
                ignoreFocusOut: true
            });

            if (comment !== undefined) {  // User didn't cancel
                await tfvcProvider.checkin(includedFiles.map(f => f.path), comment);
                vscode.window.showInformationMessage('Changes checked in successfully');
                // Refresh pending changes after successful check-in
                await tfvcProvider.refreshPendingChanges();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check in changes: ${error}`);
        }
    });

    const checkoutCommand = vscode.commands.registerCommand('vscode-tfvc.checkout', async () => {
        try {
            await tfvcProvider.checkout();
            vscode.window.showInformationMessage('File checked out successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check out file: ${error}`);
        }
    });

    const getLatestCommand = vscode.commands.registerCommand('vscode-tfvc.getLatest', async () => {
        try {
            await tfvcProvider.getLatest();
            vscode.window.showInformationMessage('Got latest version successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get latest version: ${error}`);
        }
    });

    const mergeCommand = vscode.commands.registerCommand('vscode-tfvc.merge', async () => {
        try {
            const sourceBranch = await vscode.window.showInputBox({
                prompt: 'Enter source branch path (e.g., $/Project/Dev)',
                placeHolder: '$/Project/Dev'
            });
            const targetBranch = await vscode.window.showInputBox({
                prompt: 'Enter target branch path (e.g., $/Project/Main)',
                placeHolder: '$/Project/Main'
            });

            if (sourceBranch && targetBranch) {
                await tfvcProvider.merge(sourceBranch, targetBranch);
                vscode.window.showInformationMessage('Merge completed successfully');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to merge changes: ${error}`);
        }
    });

    const createShelvesetCommand = vscode.commands.registerCommand('vscode-tfvc.createShelveset', async () => {
        try {
            const includedFiles = filesetManager.getIncludedFiles();
            if (includedFiles.length === 0) {
                vscode.window.showWarningMessage('No files are included for shelving. Please include files using the Pending Changes view.');
                return;
            }

            const name = await vscode.window.showInputBox({
                prompt: 'Enter shelveset name',
                placeHolder: 'MyShelveset',
                ignoreFocusOut: true
            });

            const comment = await vscode.window.showInputBox({
                prompt: 'Enter shelveset comment',
                placeHolder: 'Description of changes',
                ignoreFocusOut: true
            });

            if (name && comment) {
                await tfvcProvider.createShelveset(name, comment, includedFiles.map(f => f.path));
                vscode.window.showInformationMessage('Shelveset created successfully');
                // Optionally refresh pending changes after shelving
                await tfvcProvider.refreshPendingChanges();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create shelveset: ${error}`);
        }
    });

    const applyShelvesetCommand = vscode.commands.registerCommand('vscode-tfvc.applyShelveset', async () => {
        try {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter shelveset name',
                placeHolder: 'MyShelveset'
            });
            const owner = await vscode.window.showInputBox({
                prompt: 'Enter shelveset owner',
                placeHolder: 'username'
            });

            if (name && owner) {
                await tfvcProvider.applyShelveset(name, owner);
                vscode.window.showInformationMessage('Shelveset applied successfully');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply shelveset: ${error}`);
        }
    });

    const showHistoryCommand = vscode.commands.registerCommand('vscode-tfvc.showHistory', async () => {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const history = await tfvcProvider.getHistory(activeEditor.document.uri.fsPath);
                // Create and show a webview with the history
                const panel = vscode.window.createWebviewPanel(
                    'tfvcHistory',
                    'TFVC History',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: false
                    }
                );

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body {
                                padding: 20px;
                                line-height: 1.6;
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                            }
                            .history-item {
                                margin-bottom: 15px;
                                padding: 10px;
                                border-bottom: 1px solid var(--vscode-panel-border);
                            }
                        </style>
                    </head>
                    <body>
                        <h2>History for ${basename(activeEditor.document.uri.fsPath)}</h2>
                        ${history.map(item => `
                            <div class="history-item">
                                <div>${item.changesetId || 'Unknown changeset'}</div>
                                <div>${item.date || 'Unknown date'}</div>
                                <div>${item.author || 'Unknown author'}</div>
                                <div>${item.comment || 'No comment'}</div>
                            </div>
                        `).join('')}
                    </body>
                    </html>
                `;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show history: ${error}`);
        }
    });

    const showBranchesCommand = vscode.commands.registerCommand('vscode-tfvc.showBranches', async () => {
        try {
            const branches = await tfvcProvider.getBranches();
            // Create and show a webview with the branches
            const panel = vscode.window.createWebviewPanel(
                'tfvcBranches',
                'TFVC Branches',
                vscode.ViewColumn.One,
                {
                    enableScripts: false
                }
            );

            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            padding: 20px;
                            line-height: 1.6;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        }
                        .branch-item {
                            margin-bottom: 10px;
                            padding: 5px;
                            border-bottom: 1px solid var(--vscode-panel-border);
                        }
                    </style>
                </head>
                <body>
                    <h2>TFVC Branches</h2>
                    ${branches.map(branch => `
                        <div class="branch-item">
                            ${branch}
                        </div>
                    `).join('')}
                </body>
                </html>
            `;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show branches: ${error}`);
        }
    });

    // Register diagnostics command
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-tfvc.showDiagnostics', async () => {
            try {
                const report = await tfvcProvider.generateDiagnosticsReport();
                
                // Create and show the diagnostics panel
                const panel = vscode.window.createWebviewPanel(
                    'tfvcDiagnostics',
                    'TFVC Diagnostics Report',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: false
                    }
                );

                // Add styling to the report
                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body {
                                padding: 20px;
                                line-height: 1.6;
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                            }
                            h3 {
                                color: var(--vscode-editor-foreground);
                                border-bottom: 1px solid var(--vscode-panel-border);
                                padding-bottom: 5px;
                            }
                            pre {
                                background-color: var(--vscode-textBlockQuote-background);
                                padding: 10px;
                                border-radius: 3px;
                                overflow-x: auto;
                            }
                            code {
                                font-family: var(--vscode-editor-font-family);
                            }
                        </style>
                    </head>
                    <body>
                        ${report.replace(/\n/g, '<br>')}
                    </body>
                    </html>
                `;

                // Also log the report
                logger.info('Generated TFVC diagnostics report');
                logger.debug('Diagnostics report content:', { report });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error('Failed to generate diagnostics report: ' + errorMessage);
                vscode.window.showErrorMessage('Failed to generate TFVC diagnostics report');
            }
        })
    );

    context.subscriptions.push(
        initializeCommand,
        checkinCommand,
        checkoutCommand,
        getLatestCommand,
        mergeCommand,
        createShelvesetCommand,
        applyShelvesetCommand,
        showHistoryCommand,
        showBranchesCommand,
        scmProvider,
        treeView,
        tfvcProvider
    );

    // Initial refresh of pending changes
    tfvcProvider.refreshPendingChanges();
}

export function deactivate(): void {
    // Clean up resources
    FilesetManager.getInstance().dispose();
} 