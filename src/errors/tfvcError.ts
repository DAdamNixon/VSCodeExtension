export class TfvcError extends Error {
    constructor(
        message: string,
        public readonly command: string,
        public readonly args: string[],
        public readonly exitCode?: number,
        public readonly output?: string
    ) {
        super(message);
        this.name = 'TfvcError';
    }

    public static fromCommandError(
        command: string,
        args: string[],
        exitCode: number,
        output: string
    ): TfvcError {
        let message = `TFVC command failed: ${command} ${args.join(' ')}`;
        if (exitCode !== undefined) {
            message += `\nExit code: ${exitCode}`;
        }
        if (output) {
            message += `\nOutput: ${output}`;
        }
        return new TfvcError(message, command, args, exitCode, output);
    }

    public static fromWorkspaceError(message: string): TfvcError {
        return new TfvcError(message, 'workspace', []);
    }

    public static fromConfigurationError(message: string): TfvcError {
        return new TfvcError(message, 'config', []);
    }
} 