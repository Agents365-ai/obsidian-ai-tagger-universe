import { TFile, Notice } from 'obsidian';

export interface BatchProcessorOptions {
    batchSize: number;
    progressUpdateInterval: number;
    silent?: boolean;
    delayBetweenBatches?: number;  // Rate limiting delay in ms
    delayBetweenFiles?: number;    // Delay between files within a batch
}

export interface BatchProcessResult {
    success: boolean;
    processed: number;
    successCount: number;
    errors: Array<{ file: string; error: string }>;
}

export class BatchProcessor {
    private readonly options: BatchProcessorOptions;
    private isCancelled: boolean = false;

    constructor(options: Partial<BatchProcessorOptions> = {}) {
        this.options = {
            batchSize: 5,  // Reduced default for rate limiting
            progressUpdateInterval: 5000,
            silent: false,
            delayBetweenBatches: 1000,  // 1 second between batches
            delayBetweenFiles: 200,     // 200ms between files
            ...options
        };
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    public cancel(): void {
        this.isCancelled = true;
    }

    public async processBatch<T>(
        files: TFile[],
        processor: (file: TFile) => Promise<T>
    ): Promise<BatchProcessResult> {
        const totalFiles = files.length;
        let processedCount = 0;
        let successCount = 0;
        let lastNoticeTime = Date.now();
        const errors: Array<{ file: string; error: string }> = [];

        // Split files into batches
        const batches: TFile[][] = [];
        for (let i = 0; i < files.length; i += this.options.batchSize) {
            batches.push(files.slice(i, i + this.options.batchSize));
        }

        // Process batches sequentially
        for (const batch of batches) {
            if (this.isCancelled) {
                break;
            }

            try {
                // Process files sequentially with rate limiting to avoid API exhaustion
                const batchResults: boolean[] = [];
                for (let i = 0; i < batch.length; i++) {
                    const file = batch[i];
                    // Check cancellation before processing each file
                    if (this.isCancelled) {
                        batchResults.push(false);
                        continue;
                    }
                    try {
                        await processor(file);
                        batchResults.push(true);
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        errors.push({ file: file.path, error: errorMessage });
                        batchResults.push(false);
                    }
                    // Rate limiting: delay between files (except for last file in batch)
                    if (i < batch.length - 1 && this.options.delayBetweenFiles) {
                        await this.delay(this.options.delayBetweenFiles);
                    }
                }

                // Update counts
                const batchSuccesses = batchResults.filter(Boolean).length;
                successCount += batchSuccesses;
                processedCount += batch.length;

                // Show progress update if enough time has passed or we're done
                const currentTime = Date.now();
                if (!this.options.silent && (currentTime - lastNoticeTime >= this.options.progressUpdateInterval || processedCount === totalFiles)) {
                    new Notice(`${Math.round((processedCount/totalFiles) * 100)}%`);
                    lastNoticeTime = currentTime;
                }

            } catch (error) {
                //console.error('Error processing batch:', error);
            }

            // Rate limiting: delay between batches (except for last batch)
            if (this.options.delayBetweenBatches && batches.indexOf(batch) < batches.length - 1) {
                await this.delay(this.options.delayBetweenBatches);
            }
        }

        if (!this.options.silent && successCount > 0) {
            new Notice(`Cleared ${successCount} notes`);
        }

        return {
            success: errors.length === 0,
            processed: processedCount,
            successCount,
            errors
        };
    }
}
