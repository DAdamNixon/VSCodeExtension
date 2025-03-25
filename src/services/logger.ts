import * as vscode from 'vscode';

export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warning = 2,
    Error = 3
}

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TFVC');
        
        // Get the log level from configuration, defaulting to Info
        const configLevel = vscode.workspace.getConfiguration('tfvc').get<number>('logLevel', LogLevel.Info);
        
        // Ensure we have a valid LogLevel enum value
        if (configLevel !== undefined && 
            configLevel >= LogLevel.Debug && 
            configLevel <= LogLevel.Error) {
            this.logLevel = configLevel;
        } else {
            this.logLevel = LogLevel.Info;
        }
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    public debug(message: string, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.Debug) {
            this.log('DEBUG', message, ...args);
        }
    }

    public info(message: string, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.Info) {
            this.log('INFO', message, ...args);
        }
    }

    public warning(message: string, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.Warning) {
            this.log('WARNING', message, ...args);
        }
    }

    public error(message: string, error?: Error, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.Error) {
            this.log('ERROR', message, ...args);
            if (error) {
                this.log('ERROR', `Stack trace: ${error.stack}`);
            }
        }
    }

    private log(level: string, message: string, ...args: unknown[]): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${level}] ${message}`;
        
        // Log to output channel
        this.outputChannel.appendLine(formattedMessage);
        if (args.length > 0) {
            this.outputChannel.appendLine(JSON.stringify(args, null, 2));
        }

        // Show notifications for errors and warnings
        if (level === 'ERROR') {
            vscode.window.showErrorMessage(message);
        } else if (level === 'WARNING') {
            vscode.window.showWarningMessage(message);
        }
    }

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
} 