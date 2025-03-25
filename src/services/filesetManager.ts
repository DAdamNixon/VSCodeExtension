import * as vscode from 'vscode';
import { Logger } from './logger';

export interface PendingChange {
    path: string;
    status: string;
    isIncluded: boolean;
}

export class FilesetManager implements vscode.Disposable {
    private static instance: FilesetManager;
    private pendingChanges: Map<string, PendingChange>;
    private logger: Logger;
    private _onDidChangeFileset = new vscode.EventEmitter<void>();
    readonly onDidChangeFileset = this._onDidChangeFileset.event;

    private constructor() {
        this.pendingChanges = new Map();
        this.logger = Logger.getInstance();
    }

    static getInstance(): FilesetManager {
        if (!FilesetManager.instance) {
            FilesetManager.instance = new FilesetManager();
        }
        return FilesetManager.instance;
    }

    setPendingChanges(changes: PendingChange[]): void {
        this.logger.info('Setting pending changes', { count: changes.length });
        this.pendingChanges.clear();
        changes.forEach(change => {
            this.pendingChanges.set(change.path, { ...change, isIncluded: true });
        });
        this._onDidChangeFileset.fire();
    }

    toggleFileInclusion(path: string): void {
        const change = this.pendingChanges.get(path);
        if (change) {
            change.isIncluded = !change.isIncluded;
            this.pendingChanges.set(path, change);
            this._onDidChangeFileset.fire();
            this.logger.info('Toggled file inclusion', { path, isIncluded: change.isIncluded });
        }
    }

    setFileInclusion(path: string, included: boolean): void {
        const change = this.pendingChanges.get(path);
        if (change) {
            change.isIncluded = included;
            this.pendingChanges.set(path, change);
            this._onDidChangeFileset.fire();
            this.logger.info('Set file inclusion', { path, isIncluded: included });
        }
    }

    getIncludedFiles(): PendingChange[] {
        return Array.from(this.pendingChanges.values()).filter(change => change.isIncluded);
    }

    getExcludedFiles(): PendingChange[] {
        return Array.from(this.pendingChanges.values()).filter(change => !change.isIncluded);
    }

    getAllFiles(): PendingChange[] {
        return Array.from(this.pendingChanges.values());
    }

    isFileIncluded(path: string): boolean {
        return this.pendingChanges.get(path)?.isIncluded ?? false;
    }

    clear(): void {
        this.pendingChanges.clear();
        this._onDidChangeFileset.fire();
        this.logger.info('Cleared pending changes');
    }

    dispose(): void {
        this._onDidChangeFileset.dispose();
        this.pendingChanges.clear();
    }
} 