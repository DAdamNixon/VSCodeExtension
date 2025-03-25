// Mock the vscode module first
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        fire: jest.fn(),
        event: jest.fn().mockReturnValue(jest.fn()),
        dispose: jest.fn()
    }))
}));

// Mock the Logger module
jest.mock('../logger', () => {
    return {
        LogLevel: {
            Debug: 0,
            Info: 1,
            Warning: 2,
            Error: 3
        },
        Logger: {
            getInstance: jest.fn().mockImplementation(() => ({
                info: jest.fn(),
                debug: jest.fn(),
                warning: jest.fn(),
                error: jest.fn(),
                setLogLevel: jest.fn(),
                show: jest.fn(),
                dispose: jest.fn()
            }))
        }
    };
});

import { FilesetManager } from '../filesetManager';
import { PendingChange } from '../filesetManager';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const expect: any;

describe('FilesetManager', () => {
    let filesetManager: FilesetManager;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        // Reset singleton
        (FilesetManager as any).instance = undefined;
        
        filesetManager = FilesetManager.getInstance();
        filesetManager.clear(); // Clear any existing state
    });

    test('should be a singleton', () => {
        const instance1 = FilesetManager.getInstance();
        const instance2 = FilesetManager.getInstance();
        expect(instance1).toBe(instance2);
    });

    test('should set pending changes', () => {
        const changes: PendingChange[] = [
            { path: 'file1.txt', status: 'edit', isIncluded: true },
            { path: 'file2.txt', status: 'add', isIncluded: true }
        ];

        filesetManager.setPendingChanges(changes);
        expect(filesetManager.getAllFiles()).toEqual(changes);
    });

    test('should toggle file inclusion', () => {
        const changes: PendingChange[] = [
            { path: 'file1.txt', status: 'edit', isIncluded: true },
            { path: 'file2.txt', status: 'add', isIncluded: true }
        ];

        filesetManager.setPendingChanges(changes);
        filesetManager.toggleFileInclusion('file1.txt');
        
        const updatedFiles = filesetManager.getAllFiles();
        expect(updatedFiles.find(f => f.path === 'file1.txt')?.isIncluded).toBe(false);
        expect(updatedFiles.find(f => f.path === 'file2.txt')?.isIncluded).toBe(true);
    });

    test('should get included and excluded files', () => {
        // Manually set up the internal state since setPendingChanges overrides isIncluded to true
        filesetManager.setPendingChanges([
            { path: 'file1.txt', status: 'edit', isIncluded: true },
            { path: 'file3.txt', status: 'delete', isIncluded: true }
        ]);
        
        // Add another file and set it to excluded
        filesetManager.setPendingChanges([
            ...filesetManager.getAllFiles(),
            { path: 'file2.txt', status: 'add', isIncluded: true }
        ]);
        filesetManager.setFileInclusion('file2.txt', false);
        
        expect(filesetManager.getIncludedFiles()).toHaveLength(2);
        expect(filesetManager.getExcludedFiles()).toHaveLength(1);
        expect(filesetManager.getIncludedFiles().map(f => f.path)).toContain('file1.txt');
        expect(filesetManager.getExcludedFiles().map(f => f.path)).toContain('file2.txt');
    });

    test('should clear all pending changes', () => {
        const changes: PendingChange[] = [
            { path: 'file1.txt', status: 'edit', isIncluded: true },
            { path: 'file2.txt', status: 'add', isIncluded: false }
        ];

        filesetManager.setPendingChanges(changes);
        filesetManager.clear();
        
        expect(filesetManager.getAllFiles()).toHaveLength(0);
    });
}); 