import { App, TFile, Notice } from 'obsidian';
import { BatchProcessor, BatchProcessResult } from './batchProcessor';
import { TagUtils, TagOperationResult } from './tagUtils';

export class TagOperations {
    private app: App;
    private batchProcessor: BatchProcessor;

    constructor(app: App) {
        this.app = app;
        this.batchProcessor = new BatchProcessor();
    }

    /**
     * Clear tags from a single note
     */
    public async clearNoteTags(file: TFile): Promise<TagOperationResult> {
        try {
            const result = await TagUtils.clearTags(this.app, file);
            if (result.success && result.message !== "Skipped: Note has no frontmatter") {
                this.app.vault.trigger('modify', file);
            }
            return result;
        } catch (error) {
            return {
                success: false,
                message: `Failed to clear tags: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Clear tags from all notes in a directory
     */
    public async clearDirectoryTags(directory: TFile[]): Promise<BatchProcessResult> {
        if (directory.length === 0) {
            return {
                success: true,
                processed: 0,
                successCount: 0,
                errors: []
            };
        }

        const result = await this.batchProcessor.processBatch(
            directory,
            async (file: TFile) => {
                const result = await this.clearNoteTags(file);
                if (!result.success && result.message !== "Skipped: Note has no frontmatter") {
                    return { success: false, message: result.message };
                }
            }
        );

        this.app.workspace.trigger('layout-change');
        return result;
    }

    /**
     * Cancel any ongoing batch operations
     */
    public cancelOperations(): void {
        this.batchProcessor.cancel();
    }

    /**
     * Refresh metadata cache for multiple files
     */
    private async refreshMetadataCache(files: TFile[]): Promise<void> {
        files.forEach(file => {
            this.app.metadataCache.trigger('changed', file);
        });
        this.app.workspace.trigger('layout-change');
        await new Promise(resolve => window.setTimeout(resolve, 500));
    }
}
