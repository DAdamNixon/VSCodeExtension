import * as vscode from 'vscode';
import { FilesetManager, PendingChange } from '../services/filesetManager';
import { Logger } from '../services/logger';

export class PendingChangesTreeProvider implements vscode.TreeDataProvider<PendingChangeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<PendingChangeNode | undefined> = new vscode.EventEmitter<PendingChangeNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<PendingChangeNode | undefined> = this._onDidChangeTreeData.event;
    private filesetManager: FilesetManager;
    private logger: Logger;

    constructor() {
        this.filesetManager = FilesetManager.getInstance();
        this.logger = Logger.getInstance();

        // Listen for changes in the fileset manager
        this.filesetManager.onDidChangeFileset(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: PendingChangeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PendingChangeNode): Promise<PendingChangeNode[]> {
        if (element) {
            return [];
        }

        try {
            const allFiles = this.filesetManager.getAllFiles();
            const includedFiles = allFiles.filter(f => f.isIncluded);
            const excludedFiles = allFiles.filter(f => !f.isIncluded);

            const nodes: PendingChangeNode[] = [];

            if (includedFiles.length > 0) {
                nodes.push(new PendingChangeGroupNode('Included Files', includedFiles));
            }

            if (excludedFiles.length > 0) {
                nodes.push(new PendingChangeGroupNode('Excluded Files', excludedFiles));
            }

            return nodes;
        } catch (error) {
            this.logger.error('Error getting pending changes', error as Error);
            return [];
        }
    }
}

class PendingChangeNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

class PendingChangeGroupNode extends PendingChangeNode {
    constructor(
        public readonly label: string,
        public readonly changes: PendingChange[]
    ) {
        super(
            `${label} (${changes.length})`,
            vscode.TreeItemCollapsibleState.Expanded
        );

        this.tooltip = `${changes.length} files`;
        this.contextValue = 'pendingChangeGroup';
    }

    async getChildren(): Promise<PendingChangeFileNode[]> {
        return this.changes.map(change => new PendingChangeFileNode(change));
    }
}

class PendingChangeFileNode extends PendingChangeNode {
    constructor(
        public readonly change: PendingChange
    ) {
        super(change.path, vscode.TreeItemCollapsibleState.None);

        this.description = change.status;
        this.tooltip = `${change.path} (${change.status})`;
        this.contextValue = 'pendingChangeFile';

        // Set the appropriate icon based on the change status
        this.iconPath = this.getIconForStatus(change.status);

        // Add commands for the file
        this.command = {
            command: 'vscode-tfvc.showDiff', 
            title: 'Show Changes',
            arguments: [vscode.Uri.file(change.path)]
        };
    }

    private getIconForStatus(status: string): vscode.ThemeIcon {
        switch (status.toLowerCase()) {
            case 'add':
                return new vscode.ThemeIcon('add');
            case 'edit':
                return new vscode.ThemeIcon('edit');
            case 'delete':
                return new vscode.ThemeIcon('trash');
            case 'rename':
                return new vscode.ThemeIcon('arrow-right');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
} 