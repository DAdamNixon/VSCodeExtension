import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './services/logger';
import { TfvcError } from './errors/tfvcError';
import { FilesetManager, PendingChange } from './services/filesetManager';

interface HistoryItem {
    changesetId: string;
    author: string;
    date: string;
    comment?: string;  // Optional comment field
}

interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class TfvcProvider {
    private tfPath: string;
    private workspaceRoot: string;
    private logger: Logger;
    private filesetManager: FilesetManager;
    private disposables: vscode.Disposable[] = [];
    private pendingCheckouts: Set<string> = new Set();
    private collectionUrl: string | undefined;
    private useVsCredentials: boolean;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
        this.tfPath = vscode.workspace.getConfiguration('tfvc').get('tfPath') || 'tf';
        this.useVsCredentials = vscode.workspace.getConfiguration('tfvc').get('useVisualStudioCredentials', true);
        this.logger = Logger.getInstance();
        this.filesetManager = FilesetManager.getInstance();

        if (!this.workspaceRoot) {
            throw TfvcError.fromWorkspaceError('No workspace folder found');
        }

        this.logger.debug('TFVC Provider initialized', {
            workspaceRoot: this.workspaceRoot,
            tfPath: this.tfPath,
            useVsCredentials: this.useVsCredentials
        });

        // Set up file watchers if auto-checkout is enabled
        this.setupAutoCheckout();

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('tfvc.autoCheckout') || 
                    e.affectsConfiguration('tfvc.autoCheckoutOnSave')) {
                    this.setupAutoCheckout();
                }
                if (e.affectsConfiguration('tfvc.useVisualStudioCredentials')) {
                    this.useVsCredentials = vscode.workspace.getConfiguration('tfvc')
                        .get('useVisualStudioCredentials', true);
                }
            })
        );

        // Initialize collection URL from workspace
        this.initializeCollectionUrl();

        // Log environment details on startup
        this.logEnvironmentDetails();
    }

    private async initializeCollectionUrl(): Promise<void> {
        try {
            const output = await this.executeTfCommand(['workfold'], true);
            const match = /Collection: (https?:\/\/[^\s]+)/i.exec(output.stdout);
            if (match) {
                this.collectionUrl = match[1];
                this.logger.info('Collection URL detected', { url: this.collectionUrl });
            }
        } catch (error) {
            this.logger.warning('Failed to detect collection URL', error as Error);
        }
    }

    private async logEnvironmentDetails(): Promise<void> {
        this.logger.info('TFVC Environment Details', {
            platform: os.platform(),
            architecture: os.arch(),
            vsInstallDir: process.env['VSINSTALLDIR'] || 'Not set',
            vssdkInstall: process.env['VSSDK140Install'] || 'Not set',
            tfPath: this.tfPath,
            useVsCredentials: this.useVsCredentials
        });

        try {
            // Check tf.exe version
            const versionOutput = await this.executeTfCommand(['help'], true);
            this.logger.info('TF Command-Line Tool Version', { output: versionOutput.stdout.split('\n')[0] });

            // Check workspace info
            const workspaceInfo = await this.getWorkspaceInfo();
            this.logger.info('Workspace Information', workspaceInfo);
        } catch (error) {
            this.logger.warning('Failed to get complete environment details', error as Error);
        }
    }

    private async getWorkspaceInfo(): Promise<Record<string, string | undefined>> {
        try {
            const output = await this.executeTfCommand(['workfold'], true);
            const info: Record<string, string | undefined> = {
                workspaceRoot: this.workspaceRoot
            };

            // Parse collection URL
            const collectionMatch = /Collection: (https?:\/\/[^\s]+)/i.exec(output.stdout);
            if (collectionMatch) {
                info.collectionUrl = collectionMatch[1];
            }

            // Parse workspace name
            const workspaceMatch = /Workspace:\s*([^\r\n]+)/i.exec(output.stdout);
            if (workspaceMatch) {
                info.workspaceName = workspaceMatch[1];
            }

            // Parse owner
            const ownerMatch = /Owner:\s*([^\r\n]+)/i.exec(output.stdout);
            if (ownerMatch) {
                info.owner = ownerMatch[1];
            }

            return info;
        } catch (error) {
            this.logger.warning('Failed to get workspace info', error as Error);
            return { error: 'Failed to get workspace info' };
        }
    }

    private async validateCredentials(): Promise<boolean> {
        try {
            // Try a simple command that requires authentication
            await this.executeTfCommand(['workspaces', '-format:brief'], true);
            this.logger.info('Credentials validation successful');
            return true;
        } catch (error) {
            const err = error as Error;
            this.logger.error('Credentials validation failed', err, {
                useVsCredentials: this.useVsCredentials,
                errorMessage: err.message
            });
            return false;
        }
    }

    private getEnvironmentForTf(): NodeJS.ProcessEnv {
        const env = { ...process.env };

        // If using Visual Studio credentials, ensure we use the VS developer command prompt environment
        if (this.useVsCredentials) {
            env['VSINSTALLDIR'] = process.env['VSINSTALLDIR'] || '';
            env['VSSDK140Install'] = process.env['VSSDK140Install'] || '';

            // Log credential environment
            this.logger.debug('VS Credential Environment', {
                vsInstallDir: env['VSINSTALLDIR'],
                vssdkInstall: env['VSSDK140Install'],
                hasVsCredentials: !!process.env['VSINSTALLDIR']
            });
        }

        // Add collection URL if available
        if (this.collectionUrl) {
            env['TF_COLLECTION_URL'] = this.collectionUrl;
            this.logger.debug('Using collection URL', { url: this.collectionUrl });
        }

        return env;
    }

    private setupAutoCheckout(): void {
        // Remove existing watchers
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        const config = vscode.workspace.getConfiguration('tfvc');
        const autoCheckout = config.get<boolean>('autoCheckout', true);
        const autoCheckoutOnSave = config.get<boolean>('autoCheckoutOnSave', false);

        if (!autoCheckout) {
            return;
        }

        if (!autoCheckoutOnSave) {
            // Watch for file changes
            this.disposables.push(
                vscode.workspace.onDidChangeTextDocument(async e => {
                    if (e.document.uri.scheme === 'file') {
                        await this.handleFileChange(e.document.uri.fsPath);
                    }
                })
            );
        }

        // Watch for file saves
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(async document => {
                if (document.uri.scheme === 'file') {
                    await this.handleFileChange(document.uri.fsPath);
                }
            })
        );
    }

    private async handleFileChange(filePath: string): Promise<void> {
        // Skip if file is already being processed
        if (this.pendingCheckouts.has(filePath)) {
            return;
        }

        try {
            // Check if the file is under version control and needs checkout
            const status = await this.getFileStatus(filePath);
            if (status !== 'edit') {
                this.pendingCheckouts.add(filePath);
                this.logger.debug('Auto-checking out file', { filePath });
                await this.checkoutFile(filePath);
                this.logger.info('Auto-checkout successful', { filePath });
            }
        } catch (error) {
            this.logger.error('Auto-checkout failed', error as Error, { filePath });
        } finally {
            this.pendingCheckouts.delete(filePath);
        }
    }

    async checkoutFile(filePath: string): Promise<void> {
        this.logger.info('Checking out file', { filePath });
        try {
            await this.executeTfCommand(['checkout', filePath]);
            this.logger.info('File checked out successfully', { filePath });
            
            // Refresh pending changes after checkout
            await this.refreshPendingChanges();
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to check out file', err, { filePath });
            throw new TfvcError('Failed to check out file', 'checkout', [filePath], undefined, err.message);
        }
    }

    private async executeTfCommand(args: string[], suppressErrors: boolean = false): Promise<CommandResult> {
        this.logger.debug(`Executing TFVC command: ${args.join(' ')}`, {
            cwd: this.workspaceRoot,
            useVsCredentials: this.useVsCredentials
        });

        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const env = this.getEnvironmentForTf();
            
            const tfProcess = cp.spawn(this.tfPath, args, {
                cwd: this.workspaceRoot,
                env
            });

            let output = '';
            let error = '';

            tfProcess.stdout.on('data', (data: Buffer) => {
                output += data.toString();
                this.logger.debug(`TFVC command output: ${data.toString()}`);
            });

            tfProcess.stderr.on('data', (data: Buffer) => {
                error += data.toString();
                this.logger.debug(`TFVC command error: ${data.toString()}`);
            });

            tfProcess.on('close', (code: number) => {
                const duration = Date.now() - startTime;
                
                if (code === 0 || suppressErrors) {
                    this.logger.debug(`TFVC command completed`, {
                        command: args.join(' '),
                        duration,
                        exitCode: code
                    });
                    resolve({ stdout: output, stderr: error, exitCode: code });
                } else {
                    // Check for common authentication errors
                    const isAuthError = error.toLowerCase().includes('authentication') || 
                                      error.toLowerCase().includes('authorized') ||
                                      error.toLowerCase().includes('tf31002') || // No workspace found
                                      error.toLowerCase().includes('tf30063'); // No server found
                    
                    if (isAuthError) {
                        this.logger.error('TFVC Authentication Error', undefined, {
                            command: args.join(' '),
                            duration,
                            exitCode: code,
                            error,
                            useVsCredentials: this.useVsCredentials,
                            vsInstallDir: process.env['VSINSTALLDIR'],
                            collectionUrl: this.collectionUrl
                        });
                    } else {
                        this.logger.error(`TFVC command failed`, undefined, {
                            command: args.join(' '),
                            duration,
                            exitCode: code,
                            error
                        });
                    }

                    const tfvcError = TfvcError.fromCommandError(args.join(' '), args, code, error);
                    reject(tfvcError);
                }
            });

            tfProcess.on('error', (err: Error) => {
                const duration = Date.now() - startTime;
                
                if (suppressErrors) {
                    resolve({ stdout: '', stderr: '', exitCode: -1 });
                } else {
                    this.logger.error(`Failed to execute TFVC command`, err, {
                        command: args.join(' '),
                        duration,
                        error: err.message,
                        tfPath: this.tfPath
                    });
                    reject(TfvcError.fromCommandError(args.join(' '), args, -1, err.message));
                }
            });
        });
    }

    private parsePendingChanges(output: string): PendingChange[] {
        const changes: PendingChange[] = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            const match = line.match(/^(add|edit|delete|rename)\s+(.+)$/i);
            if (match) {
                changes.push({
                    status: match[1].toLowerCase(),
                    path: match[2].trim(),
                    isIncluded: true
                });
            }
        }

        return changes;
    }

    async refreshPendingChanges(): Promise<void> {
        try {
            this.logger.debug('Refreshing pending changes');
            const { stdout } = await this.executeTfCommand(['status', '/format:detailed']);
            const changes = this.parsePendingChanges(stdout);
            this.filesetManager.setPendingChanges(changes);
            this.logger.info('Pending changes refreshed', { count: changes.length });
        } catch (error) {
            this.logger.error('Failed to refresh pending changes', error as Error);
            throw error;
        }
    }

    async getFileStatus(filePath: string): Promise<string> {
        try {
            this.logger.debug('Getting file status', { filePath });
            const { stdout } = await this.executeTfCommand(['status', filePath]);
            
            // Parse the status output to determine the file's status
            if (stdout.includes('edit')) {
                return 'edit';
            } else if (stdout.includes('add')) {
                return 'add';
            } else if (stdout.includes('delete')) {
                return 'delete';
            } else if (stdout.includes('rename')) {
                return 'rename';
            }
            return 'none';
        } catch (error) {
            this.logger.error('Error getting file status', error as Error, { filePath });
            throw error;
        }
    }

    async initializeWorkspace(): Promise<void> {
        try {
            this.logger.info('Initializing TFVC workspace');
            
            // Log environment details before initialization
            await this.logEnvironmentDetails();
            
            // Validate credentials
            const credentialsValid = await this.validateCredentials();
            if (!credentialsValid) {
                this.logger.warning('Proceeding with workspace initialization despite credential validation failure');
            }
            
            // Check if workspace is already initialized
            try {
                await this.executeTfCommand(['workspaces']);
                this.logger.info('Workspace already initialized');
                
                // Get and log workspace details
                const workspaceInfo = await this.getWorkspaceInfo();
                this.logger.info('Current workspace details', workspaceInfo);
            } catch {
                // If not initialized, create a new workspace
                const workspaceName = path.basename(this.workspaceRoot);
                await this.executeTfCommand(['workspace', '-new', workspaceName]);
                this.logger.info('New workspace created', { workspaceName });
            }
        } catch (error) {
            this.logger.error('Failed to initialize workspace', error as Error);
            throw error;
        }
    }

    async checkin(files: string[], comment: string): Promise<void> {
        this.logger.info('Checking in files', { files, comment });
        try {
            await this.executeTfCommand(['checkin', '-comment:', `"${comment}"`, ...files]);
            this.logger.info('Check-in completed successfully');
            this.recordCommand('checkin', true);
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to check in files', err, { files });
            this.recordCommand('checkin', false);
            throw new TfvcError('Failed to check in files', 'checkin', ['-comment:', `"${comment}"`, ...files], undefined, err.message);
        }
    }

    async checkout(): Promise<void> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const filePath = activeEditor.document.uri.fsPath;
                this.logger.info('Checking out file', { filePath });
                await this.executeTfCommand(['checkout', filePath]);
                this.logger.info('File checked out successfully', { filePath });
                
                // Refresh pending changes after checkout
                await this.refreshPendingChanges();
            } else {
                throw new Error('No active editor');
            }
        } catch (error) {
            this.logger.error('Failed to check out file', error as Error);
            throw error;
        }
    }

    async getLatest(): Promise<void> {
        try {
            this.logger.info('Getting latest version');
            await this.executeTfCommand(['get', '/recursive']);
            this.logger.info('Latest version retrieved successfully');
        } catch (error) {
            this.logger.error('Failed to get latest version', error as Error);
            throw error;
        }
    }

    async merge(sourceBranch: string, targetBranch: string): Promise<void> {
        try {
            this.logger.info('Starting merge operation', { sourceBranch, targetBranch });
            
            // First get the latest changes
            await this.getLatest();
            
            // Perform the merge
            await this.executeTfCommand(['merge', sourceBranch, targetBranch, '/recursive']);
            
            this.logger.info('Merge completed successfully', { sourceBranch, targetBranch });
        } catch (error) {
            this.logger.error('Failed to merge changes', error as Error, { sourceBranch, targetBranch });
            throw error;
        }
    }

    async createShelveset(name: string, comment: string, files: string[]): Promise<void> {
        this.logger.info('Creating shelveset', { name, comment, files });
        try {
            await this.executeTfCommand(['shelve', '-comment:', `"${comment}"`, '-name:', `"${name}"`, ...files]);
            this.logger.info('Shelveset created successfully', { name });
            this.recordCommand('shelve', true);
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to create shelveset', err, { name, files });
            this.recordCommand('shelve', false);
            throw new TfvcError('Failed to create shelveset', 'shelve', ['-comment:', `"${comment}"`, '-name:', `"${name}"`, ...files], undefined, err.message);
        }
    }

    async applyShelveset(name: string, owner: string): Promise<void> {
        try {
            this.logger.info('Applying shelveset', { name, owner });
            
            // Apply a shelveset to the current workspace
            await this.executeTfCommand(['unshelve', name, owner, '/recursive']);
            
            this.logger.info('Shelveset applied successfully', { name });
        } catch (error) {
            this.logger.error('Failed to apply shelveset', error as Error, { name, owner });
            throw error;
        }
    }

    public async getHistory(filePath: string): Promise<HistoryItem[]> {
        try {
            this.logger.debug('Getting file history', { filePath });
            const { stdout } = await this.executeTfCommand(['history', filePath, '/format:detailed']);
            this.recordCommand('history', true);
            return this.parseHistoryOutput(stdout);
        } catch (error) {
            this.logger.error('Failed to get file history', error as Error, { filePath });
            this.recordCommand('history', false);
            throw new TfvcError('Failed to get file history', 'history', [filePath], undefined, (error as Error).message);
        }
    }

    private parseHistoryOutput(output: string): HistoryItem[] {
        const history: HistoryItem[] = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            const match = line.match(/Changeset:\s*(\d+)\s*Author:\s*(.+)\s*Date:\s*(.+)/i);
            if (match) {
                history.push({
                    changesetId: match[1],
                    author: match[2].trim(),
                    date: match[3].trim()
                });
            }
        }

        return history;
    }

    public async getBranches(): Promise<string[]> {
        try {
            this.logger.debug('Getting branches');
            const { stdout } = await this.executeTfCommand(['branches']);
            this.recordCommand('branches', true);
            return this.parseBranchesOutput(stdout);
        } catch (error) {
            this.logger.error('Failed to get branches', error as Error, { command: 'branches' });
            this.recordCommand('branches', false);
            throw new TfvcError('Failed to get branches', 'branches', [], undefined, (error as Error).message);
        }
    }

    private parseBranchesOutput(output: string): string[] {
        const branches: string[] = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            const match = line.match(/Branch:\s*(.+)/i);
            if (match) {
                branches.push(match[1].trim());
            }
        }

        return branches;
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    async generateDiagnosticsReport(): Promise<string> {
        const sections: string[] = [];
        const addSection = (title: string, content: string): void => {
            sections.push(`### ${title}\n\n${content}\n`);
        };

        // System Information
        addSection('System Information', [
            `- OS: ${os.type()} ${os.release()} ${os.arch()}`,
            `- Platform: ${os.platform()}`,
            `- VS Code: ${vscode.version}`,
            `- Extension Version: ${vscode.extensions.getExtension('vscode-tfvc')?.packageJSON.version || 'unknown'}`
        ].join('\n'));

        // TFVC Configuration
        const config = vscode.workspace.getConfiguration('tfvc');
        addSection('TFVC Configuration', [
            `- TF Path: ${this.tfPath}`,
            `- Using VS Credentials: ${this.useVsCredentials}`,
            `- Auto Checkout: ${config.get('autoCheckout')}`,
            `- Auto Checkout on Save: ${config.get('autoCheckoutOnSave')}`,
            `- Log Level: ${config.get('logLevel')}`,
            `- Show Status Bar: ${config.get('showStatusBarItem')}`,
            `- Show File Status: ${config.get('showFileStatus')}`
        ].join('\n'));

        // Visual Studio Environment
        addSection('Visual Studio Environment', [
            `- VS Install Directory: ${process.env['VSINSTALLDIR'] || 'Not set'}`,
            `- VS SDK Install: ${process.env['VSSDK140Install'] || 'Not set'}`,
            `- DevEnv Path: ${process.env['DevEnvDir'] || 'Not set'}`
        ].join('\n'));

        // Workspace Information
        try {
            const workspaceInfo = await this.getWorkspaceInfo();
            addSection('Workspace Information', [
                `- Workspace Root: ${workspaceInfo.workspaceRoot}`,
                `- Collection URL: ${workspaceInfo.collectionUrl || 'Not detected'}`,
                `- Workspace Name: ${workspaceInfo.workspaceName || 'Not detected'}`,
                `- Owner: ${workspaceInfo.owner || 'Not detected'}`
            ].join('\n'));
        } catch (error) {
            addSection('Workspace Information', 'Failed to retrieve workspace information');
        }

        // TF Command-line Tool
        try {
            const versionOutput = await this.executeTfCommand(['help'], true);
            addSection('TF Command-line Tool', [
                '```',
                versionOutput.stdout.split('\n')[0],
                '```'
            ].join('\n'));
        } catch (error) {
            addSection('TF Command-line Tool', 'Failed to get version information');
        }

        // Pending Changes
        try {
            const pendingChanges = this.filesetManager.getAllFiles();
            const included = pendingChanges.filter(c => c.isIncluded);
            const excluded = pendingChanges.filter(c => !c.isIncluded);
            
            addSection('Pending Changes', [
                `Total Changes: ${pendingChanges.length}`,
                `Included: ${included.length}`,
                `Excluded: ${excluded.length}`,
                '',
                'Status Breakdown:',
                ...this.getPendingChangesBreakdown(pendingChanges)
            ].join('\n'));
        } catch (error) {
            addSection('Pending Changes', 'Failed to retrieve pending changes information');
        }

        // Recent Command History
        try {
            const recentCommands = await this.getRecentCommandHistory();
            addSection('Recent Command History', [
                '```',
                ...recentCommands,
                '```'
            ].join('\n'));
        } catch (error) {
            addSection('Recent Command History', 'Failed to retrieve command history');
        }

        // Authentication Test
        try {
            const credentialsValid = await this.validateCredentials();
            addSection('Authentication Status', credentialsValid ? 
                '✅ Authentication successful' : 
                '❌ Authentication failed');
        } catch (error) {
            addSection('Authentication Status', '❌ Authentication check failed');
        }

        return sections.join('\n\n');
    }

    private getPendingChangesBreakdown(changes: PendingChange[]): string[] {
        const breakdown = new Map<string, number>();
        changes.forEach(change => {
            breakdown.set(change.status, (breakdown.get(change.status) || 0) + 1);
        });

        return Array.from(breakdown.entries()).map(([status, count]) => 
            `- ${status}: ${count}`
        );
    }

    private commandHistory: { command: string, timestamp: number, success: boolean }[] = [];

    private async getRecentCommandHistory(): Promise<string[]> {
        return this.commandHistory
            .slice(-10) // Get last 10 commands
            .map(entry => {
                const date = new Date(entry.timestamp).toISOString();
                const status = entry.success ? '✓' : '✗';
                return `[${date}] ${status} ${entry.command}`;
            });
    }

    private recordCommand(command: string, success: boolean): void {
        this.commandHistory.push({
            command,
            timestamp: Date.now(),
            success
        });

        // Keep only last 100 commands
        if (this.commandHistory.length > 100) {
            this.commandHistory.shift();
        }
    }

    async showDiff(filePath: string): Promise<void> {
        try {
            this.logger.info('Showing diff for file', { filePath });

            // Get the file status to determine how to handle the diff
            const status = await this.getFileStatus(filePath);

            if (status === 'add') {
                // For new files, show an empty diff
                const uri = vscode.Uri.file(filePath);
                const emptyFileUri = this.createTempEmptyFile();
                
                await vscode.commands.executeCommand('vscode.diff',
                    emptyFileUri,  // Empty file for the "before" state
                    uri,           // Current file for the "after" state
                    `${path.basename(filePath)} (New File)`
                );
            } else {
                // Get the previous version of the file
                const tempFile = await this.getPreviousVersion(filePath);
                const uri = vscode.Uri.file(filePath);
                
                // Show diff between previous and current version
                await vscode.commands.executeCommand('vscode.diff',
                    vscode.Uri.file(tempFile),  // Previous version
                    uri,                        // Current version
                    `${path.basename(filePath)} (Changes)`
                );
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to show diff', err, { filePath });
            throw new TfvcError('Failed to show diff', 'difference', [filePath], undefined, err.message);
        }
    }

    private async getPreviousVersion(filePath: string): Promise<string> {
        try {
            // Create a temporary file for the previous version
            const tempFile = path.join(os.tmpdir(), `tfvc_${path.basename(filePath)}_prev`);
            
            // Get the previous version using 'tf view'
            await this.executeTfCommand(['view', filePath, `/output:${tempFile}`]);
            this.recordCommand('view', true);
            
            return tempFile;
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get previous version', err, { filePath });
            this.recordCommand('view', false);
            throw new TfvcError('Failed to get previous version', 'view', [filePath], undefined, err.message);
        }
    }

    private createTempEmptyFile(): vscode.Uri {
        // Create a temporary file URI for an empty file
        return vscode.Uri.parse(`untitled:${path.join(os.tmpdir(), 'empty_file')}`);
    }
} 