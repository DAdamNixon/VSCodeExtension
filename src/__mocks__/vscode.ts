// Mock implementation of the vscode module for testing

export const LogLevel = {
    None: 0,
    Error: 1,
    Warn: 2,
    Info: 3,
    Debug: 4
};

class EventEmitter<T = void> {
    private listeners: Array<(e: T) => void> = [];

    constructor() {
        this.listeners = [];
    }

    public event = (listener: (e: T) => void): { dispose: () => void } => {
        this.listeners.push(listener);
        return {
            dispose: (): void => {
                const index = this.listeners.indexOf(listener);
                if (index > -1) {
                    this.listeners.splice(index, 1);
                }
            }
        };
    };

    public fire = (event?: T): void => {
        this.listeners.forEach(listener => listener(event as T));
    };

    public dispose = (): void => {
        this.listeners = [];
    };
}

interface ConfigurationValue {
    get<T>(key: string, defaultValue?: T): T;
}

interface StatusBarItem {
    text: string;
    tooltip: string;
    show(): void;
    hide(): void;
    dispose(): void;
}

interface OutputChannel {
    appendLine(value: string): void;
    show(): void;
    dispose(): void;
}

const vscode = {
    EventEmitter,
    Uri: {
        file: (path: string): { fsPath: string; scheme: string } => ({ fsPath: path, scheme: 'file' }),
        parse: (uri: string): { fsPath: string; scheme: string } => ({ fsPath: uri, scheme: 'untitled' })
    },
    ThemeColor: class {
        constructor(public id: string) {}
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
        getConfiguration: (section?: string): ConfigurationValue => {
            return {
                get: <T>(key: string, defaultValue?: T): T => {
                    // Configuration values based on section
                    if (section === 'tfvc') {
                        const tfvcConfig: Record<string, unknown> = {
                            'logLevel': 1, // Info level
                            'showFileStatus': true,
                            'showStatusBarItem': true,
                            'autoCheckout': true,
                            'autoCheckoutOnSave': false,
                            'useVisualStudioCredentials': true,
                            'tfPath': 'tf'
                        };
                        
                        return tfvcConfig[key] !== undefined 
                            ? tfvcConfig[key] as T 
                            : defaultValue as T;
                    } else {
                        // Default configs for other sections
                        return defaultValue as T;
                    }
                }
            };
        }
    },
    window: {
        createStatusBarItem: (): StatusBarItem => ({
            text: '',
            tooltip: '',
            show: (): void => {},
            hide: (): void => {},
            dispose: (): void => {}
        }),
        createOutputChannel: (_name: string): OutputChannel => ({
            appendLine: (_value: string): void => {},
            show: (): void => {},
            dispose: (): void => {}
        }),
        registerFileDecorationProvider: (_provider: unknown): { dispose: () => void } => ({ 
            dispose: (): void => {} 
        }),
        showErrorMessage: (_message: string): void => {},
        showWarningMessage: (_message: string): void => {}
    },
    scm: {
        createSourceControl: (): {
            createResourceGroup: () => { dispose: () => void };
            dispose: () => void;
            inputBox: Record<string, unknown>;
        } => ({
            createResourceGroup: (): { dispose: () => void } => ({
                dispose: (): void => {}
            }),
            dispose: (): void => {},
            inputBox: {}
        })
    },
    SourceControlInputBox: class {},
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    FileDecoration: class {
        constructor(
            public badge?: string,
            public tooltip?: string,
            public color?: { id: string }
        ) {}
    }
};

module.exports = vscode;
module.exports.LogLevel = LogLevel; 