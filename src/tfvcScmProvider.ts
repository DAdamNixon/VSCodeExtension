import * as vscode from 'vscode';
import { TfvcProvider } from './tfvcProvider';

export class TfvcScmProvider implements vscode.SourceControl {
    private _onDidChange = new vscode.EventEmitter<void>();
    private _statusBarItem: vscode.StatusBarItem;
    private _decorations: vscode.FileDecorationProvider;
    private _tfvcProvider: TfvcProvider;
    private _resourceGroups: Map<string, vscode.SourceControlResourceGroup> = new Map();
    private _sourceControl: vscode.SourceControl;

    readonly onDidChange = this._onDidChange.event;
    readonly id = 'tfvc';
    readonly label = 'TFVC';
    readonly rootUri = vscode.workspace.workspaceFolders?.[0].uri;
    readonly inputBox: vscode.SourceControlInputBox;

    constructor() {
        this._tfvcProvider = new TfvcProvider();
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this._decorations = this.createFileDecorationProvider();
        this._sourceControl = vscode.scm.createSourceControl('tfvc', 'TFVC');
        this.inputBox = this._sourceControl.inputBox;
        
        // Register the decoration provider
        vscode.window.registerFileDecorationProvider(this._decorations);
        
        // Update status bar
        this.updateStatusBar();
    }

    createResourceGroup(id: string, label: string): vscode.SourceControlResourceGroup {
        const group = this._sourceControl.createResourceGroup(id, label);
        this._resourceGroups.set(id, group);
        return group;
    }

    private createFileDecorationProvider(): vscode.FileDecorationProvider {
        return {
            provideFileDecoration: async (uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> => {
                if (!vscode.workspace.getConfiguration('tfvc').get('showFileStatus')) {
                    return undefined;
                }

                try {
                    const status = await this._tfvcProvider.getFileStatus(uri.fsPath);
                    return {
                        badge: this.getStatusBadge(status),
                        color: this.getStatusColor(status),
                        tooltip: this.getStatusTooltip(status)
                    };
                } catch {
                    return undefined;
                }
            }
        };
    }

    private getStatusBadge(status: string): string {
        switch (status.toLowerCase()) {
            case 'edit':
                return '●';
            case 'add':
                return '+';
            case 'delete':
                return '×';
            case 'rename':
                return '↷';
            default:
                return '';
        }
    }

    private getStatusColor(status: string): vscode.ThemeColor {
        switch (status.toLowerCase()) {
            case 'edit':
                return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
            case 'add':
                return new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
            case 'delete':
                return new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
            case 'rename':
                return new vscode.ThemeColor('gitDecoration.renamedResourceForeground');
            default:
                return new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
        }
    }

    private getStatusTooltip(status: string): string {
        return `TFVC Status: ${status}`;
    }

    private updateStatusBar(): void {
        if (!vscode.workspace.getConfiguration('tfvc').get('showStatusBarItem')) {
            this._statusBarItem.hide();
            return;
        }

        this._statusBarItem.text = "$(source-control) TFVC";
        this._statusBarItem.tooltip = "Team Foundation Version Control";
        this._statusBarItem.show();
    }

    public dispose(): void {
        this._onDidChange.dispose();
        this._statusBarItem.dispose();
        this._resourceGroups.forEach(group => group.dispose());
        this._resourceGroups.clear();
    }
} 