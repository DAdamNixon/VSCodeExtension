import * as vscode from 'vscode';

export class TfvcCommand implements vscode.Command {
    title: string;
    command: string;
    tooltip?: string;
    arguments?: unknown[];

    constructor(command: string, title: string) {
        this.command = `vscode-tfvc.${command}`;
        this.title = title;
    }
} 