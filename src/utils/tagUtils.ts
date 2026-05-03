import { TFile, Notice, App, TFolder, TAbstractFile } from 'obsidian';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConfirmationModal } from '../ui/modals/ConfirmationModal';
import { TAG_RANGE, TAG_PREDEFINED_RANGE, TAG_GENERATE_RANGE } from './constants';
import { TagFormat } from '../core/settings';

// Re-export constants for backward compatibility
export { TAG_RANGE, TAG_PREDEFINED_RANGE, TAG_GENERATE_RANGE };

// Global debug mode flag (set by plugin)
let globalDebugMode = false;

export function setGlobalDebugMode(enabled: boolean): void {
    globalDebugMode = enabled;
}

function debugLog(message: string, data?: any): void {
    if (globalDebugMode) {
        if (data !== undefined) {
            console.log(`[AI Tagger Debug] ${message}`, data);
        } else {
            console.log(`[AI Tagger Debug] ${message}`);
        }
    }
}

/**
 * Custom error type for tag-related operations
 */
export class TagError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TagError';
    }
}

/**
 * Represents the result of a tag operation
 */
export interface TagOperationResult {
    /** Whether the operation was successful */
    success: boolean;
    /** Message describing the result */
    message: string;
    /** Array of affected tags */
    tags?: string[];
}

export class TagUtils {
    /**
     * Returns the actual tag key present in the frontmatter object,
     * preferring the casing that already exists ('Tags', 'tags', etc.).
     * Falls back to 'tags' if neither is present.
     */
    static getTagKey(frontmatter: Record<string, any>): string {
        if (!frontmatter) return 'tags';
        const found = Object.keys(frontmatter).find(k => k.toLowerCase() === 'tags');
        return found ?? 'tags';
    }

    /**
     * Gets existing tags from frontmatter
     * @param frontmatter - The frontmatter object from Obsidian's metadata cache
     * @returns Array of valid tags
     */
    static getExistingTags(frontmatter: { tags?: string | string[] | null } | null): string[] {
        if (!frontmatter) return [];
        const key = this.getTagKey(frontmatter as Record<string, any>);
        if (!(key in frontmatter) || (frontmatter as any)[key] === null || (frontmatter as any)[key] === undefined) return [];

        try {
            const value = (frontmatter as any)[key];
            const tags = Array.isArray(value) ?
                value :
                typeof value === 'string' ?
                    [value] :
                    [];

            return tags.filter(tag => tag !== null && tag !== undefined)
                .map(tag => String(tag)); // Convert all tags to strings
        } catch (error) {
            //console.error('Error getting existing tags:', error);
            return [];
        }
    }

    /**
     * Merges two arrays of tags, removing duplicates and sorting
     * @param existingTags - Array of existing tags
     * @param newTags - Array of new tags to merge
     * @returns Array of unique, sorted tags
     */
    static mergeTags(existingTags: string[], newTags: string[]): string[] {
        const validExisting = existingTags.map(tag => String(tag));
        const validNew = newTags.map(tag => String(tag));
        return [...new Set([...validExisting, ...validNew])].sort();
    }

    /**
     * Converts a string to different case formats
     */
    private static toKebabCase(str: string): string {
        return str
            .replace(/\s+/g, '-')
            .replace(/[^\p{L}\p{N}/-]/gu, '-')
            .replace(/-{2,}/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase();
    }

    private static toCamelCase(str: string): string {
        const words = str.split(/[\s\-_]+/).filter(w => w.length > 0);
        if (words.length === 0) return '';
        return words[0].toLowerCase() + words.slice(1)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join('');
    }

    private static toPascalCase(str: string): string {
        const words = str.split(/[\s\-_]+/).filter(w => w.length > 0);
        return words
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join('');
    }

    private static toSnakeCase(str: string): string {
        return str
            .replace(/\s+/g, '_')
            .replace(/[^\p{L}\p{N}/_]/gu, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();
    }

    /**
     * Formats a tag to ensure consistent formatting
     * @param tag - Tag to format
     * @param format - Tag format style (default: 'kebab-case')
     * @returns Properly formatted tag
     */
    static formatTag(tag: unknown, format: TagFormat = 'kebab-case'): string {
        // Handle non-string tags by converting to string
        if (tag === null || tag === undefined) {
            return '';
        }

        const tagStr = typeof tag === 'string' ? tag : String(tag);

        // Remove leading # if present
        let formatted = tagStr.trim();
        if (formatted.startsWith('#')) {
            formatted = formatted.substring(1);
        }

        // Handle nested tags (preserve / separator)
        if (formatted.includes('/')) {
            const parts = formatted.split('/');
            const formattedParts = parts.map(part => this.formatTagPart(part, format));
            return formattedParts.filter(p => p.length > 0).join('/');
        }

        return this.formatTagPart(formatted, format);
    }

    /**
     * Formats a single tag part (without nested tag separators)
     */
    private static formatTagPart(part: string, format: TagFormat): string {
        if (!part || part.trim().length === 0) return '';

        const trimmed = part.trim();

        switch (format) {
            case 'camelCase':
                return this.toCamelCase(trimmed);
            case 'PascalCase':
                return this.toPascalCase(trimmed);
            case 'snake_case':
                return this.toSnakeCase(trimmed);
            case 'original':
                // Only remove invalid characters, preserve case and spaces->underscores
                return trimmed
                    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
                    .replace(/\s+/g, '-')
                    .trim();
            case 'kebab-case':
            default:
                return this.toKebabCase(trimmed);
        }
    }

    /**
     * Clears all tags from a file's frontmatter using Obsidian API.
     * @param app - Obsidian App instance
     * @param file - File to clear tags from
     * @returns Promise resolving to operation result
     */
    static async clearTags(app: App, file: TFile): Promise<TagOperationResult> {
        try {
            const content = await app.vault.read(file);
            const cache = app.metadataCache.getFileCache(file);
            const frontmatterPosition = cache?.frontmatterPosition;
            
            if (!frontmatterPosition) {
                return { success: true, message: "Skipped: Note has no frontmatter", tags: [] };
            }
            
            // Extract frontmatter content, handling different line endings (LF, CRLF)
            const fullFrontmatter = content.substring(
                frontmatterPosition.start.offset,
                frontmatterPosition.end.offset
            );
            // Find actual content between the --- delimiters
            const startDelimMatch = fullFrontmatter.match(/^---[\r\n]+/);
            const endDelimMatch = fullFrontmatter.match(/[\r\n]+---$/);
            const startOffset = startDelimMatch ? startDelimMatch[0].length : 4;
            const endOffset = endDelimMatch ? endDelimMatch[0].length : 4;
            const frontmatterText = fullFrontmatter.substring(
                startOffset,
                fullFrontmatter.length - endOffset
            );
            
            let frontmatter: any;
            try {
                frontmatter = yaml.load(frontmatterText) || {};
            } catch (yamlError) {
                //console.error('YAML parse error:', yamlError);
                return { 
                    success: false, 
                    message: "YAML parse error: " + (yamlError instanceof Error ? yamlError.message : String(yamlError)), 
                    tags: [] 
                };
            }
            
            if (!frontmatter || typeof frontmatter !== 'object') {
                return { success: true, message: "No valid frontmatter", tags: [] };
            }
            
            const tagKey = this.getTagKey(frontmatter);
            if (!(tagKey in frontmatter)) {
                return { success: true, message: "No tags to clear", tags: [] };
            }
            
            const tagValue = (frontmatter as any)[tagKey];
            const tagsToRemove = Array.isArray(tagValue) ?
                tagValue.map(String) :
                typeof tagValue === 'string' ?
                    [tagValue] : [];
            
            delete frontmatter[tagKey];
            
            const newFrontmatter = yaml.dump(frontmatter).trim();
            
            const newContent = 
                '---\n' + 
                newFrontmatter + 
                '\n---' + 
                content.substring(frontmatterPosition.end.offset);
            
            if (newContent !== content) {
                try {
                    await app.vault.modify(file, newContent);
                    
                    // Allow a short delay for the metadata cache to update
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (modifyError) {
                    //console.error('Error modifying file:', modifyError);
                    throw new Error(`Failed to modify file: ${modifyError instanceof Error ? modifyError.message : String(modifyError)}`);
                }
            }
            
            const removedTags = tagsToRemove.map((tag: string) => `#${tag}`);
            
            return {
                success: true,
                message: `Cleared ${removedTags.length} tag${removedTags.length === 1 ? '' : 's'}`,
                tags: removedTags
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            //console.error('Error in clearTags:', error);
            new Notice(`Error clearing tags: ${message}`, 3000);
            return {
                success: false,
                message: `Clear failed: ${message}`
            };
        }
    }

    /**
     * Updates note tags in the frontmatter using Obsidian API
     * @param app - Obsidian App instance
     * @param file - File to update tags for
     * @param newTags - Array of new tags to add
     * @param matchedTags - Array of matched existing tags to add
     * @param silent - Whether to suppress notifications
     * @param replaceTags - Whether to replace existing tags (true) or merge with them (false)
     * @param tagFormat - Tag format style (default: 'kebab-case')
     * @returns Promise resolving to operation result
     */
    static async updateNoteTags(
        app: App,
        file: TFile,
        newTags: string[],
        matchedTags: string[],
        silent: boolean = false,
        replaceTags: boolean = true,
        tagFormat: TagFormat = 'kebab-case'
    ): Promise<TagOperationResult> {
        debugLog("updateNoteTags >>>");
        const err = new Error().stack
        debugLog("updateNoteTags::: ", err);
        try {
            debugLog(`updateNoteTags called with newTags:`, newTags);
            debugLog(`updateNoteTags called with matchedTags:`, matchedTags);

            if (!Array.isArray(newTags) || !Array.isArray(matchedTags)) {
                throw new TagError('Tags parameter must be an array');
            }

            // Combine and format all tags
            const allTags = [...newTags, ...matchedTags];
            debugLog(`Combined tags before formatting:`, allTags);

            const yamlReadyTags = this.formatTags(allTags, false, tagFormat);
            debugLog(`YAML-ready tags after formatting:`, yamlReadyTags);

            if (yamlReadyTags.length === 0) {
                !silent && new Notice('No valid tags to add', 3000);
                debugLog("<<< updateNoteTags: no valid tags to add");
                return { success: true, message: 'No valid tags to add', tags: [] };
            }

            const content = await app.vault.read(file);
            
            try {
                const cache = app.metadataCache.getFileCache(file);
                const existingFrontmatter = cache?.frontmatter;
                
                // If we're not replacing tags, we need to merge with existing ones
                if (!replaceTags && existingFrontmatter) {
                    const existingTagKey = this.getTagKey(existingFrontmatter as Record<string, any>);
                    const existingTagValue = (existingFrontmatter as any)[existingTagKey];
                    const existingTags = Array.isArray(existingTagValue) ?
                        existingTagValue.map(String) :
                        typeof existingTagValue === 'string' ?
                            [existingTagValue] : [];
                    
                    // If we have existing tags and we're not replacing, combine them
                    if (existingTags.length > 0) {
                        const combined = this.mergeTags(existingTags, yamlReadyTags);
                        yamlReadyTags.length = 0;
                        yamlReadyTags.push(...combined);
                    }
                    
                    const existingSet = new Set(existingTags.map(t => t.toString().trim()));
                    const newSet = new Set(yamlReadyTags.map(t => t.toString().trim()));
                    
                    if (existingSet.size === newSet.size && 
                        [...existingSet].every(t => newSet.has(t))) {
                        const successMessage = `Tags already up to date (${yamlReadyTags.length} tag${yamlReadyTags.length === 1 ? '' : 's'})`;
                        !silent && new Notice(successMessage, 3000);
                        
                        debugLog("<<< updateNoteTags: tags already up to date");
                        return {
                            success: true,
                            message: successMessage,
                            tags: yamlReadyTags.map(tag => `#${tag}`)
                        };
                    }
                }
            } catch (compareError) {
                //console.error('Error comparing tags:', compareError);
                debugLog("<<< updateNoteTags: compare error");
            }
            
            try {
                const processor = app.metadataCache.getFileCache(file);
                const frontmatterPosition = processor?.frontmatterPosition;
                let newContent: string;
                
                if (frontmatterPosition) {
                    const frontmatterText = content.substring(
                        frontmatterPosition.start.offset + 4, // Skip '---\n'
                        frontmatterPosition.end.offset - 4    // Skip '\n---'
                    );
                    
                    let frontmatter: any;
                    try {
                        frontmatter = yaml.load(frontmatterText) || {};
                    } catch (e) {
                        //console.error('Error parsing frontmatter:', e);
                        debugLog("updateNoteTags::: error parsing frontmatter");
                        frontmatter = {};
                    }
                    
                    frontmatter[TagUtils.getTagKey(frontmatter)] = yamlReadyTags;
                    
                    const newFrontmatter = yaml.dump(frontmatter).trim();
                    
                    newContent = 
                        '---\n' + 
                        newFrontmatter + 
                        '\n---' + 
                        content.substring(frontmatterPosition.end.offset);
                } else {
                    const frontmatter = { tags: yamlReadyTags };
                    const newFrontmatter = yaml.dump(frontmatter).trim();
                    
                    newContent = '---\n' + newFrontmatter + '\n---\n\n' + content;
                }
                
                if (newContent !== content) {
                    await app.vault.modify(file, newContent);
                    
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
            } catch (updateError) {
                //console.error('Error updating frontmatter:', updateError);
                debugLog("<<< updateNoteTags: failed to update frontmatter", updateError);
                throw new Error(`Failed to update frontmatter: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
            }

            const successMessage = `${replaceTags ? "Replaced" : "Added"} ${yamlReadyTags.length} tag${yamlReadyTags.length === 1 ? '' : 's'}`;
            !silent && new Notice(successMessage, 3000);

            debugLog("<<< updateNoteTags: frontmatter updated successfully");
            return {
                success: true,
                message: successMessage,
                tags: yamlReadyTags.map(tag => `#${tag}`)
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            debugLog('Error in updateNoteTags:', error);
            !silent && new Notice(`Error updating tags: ${message}`, 3000);
            debugLog("<<< updateNoteTags: update failed");
            return {
                success: false,
                message: `Update failed: ${message}`
            };
        }
    }
    
    /**
     * Waits for Obsidian's metadata cache to update for a file
     * @param app - Obsidian App instance
     * @param file - File to wait for
     * @returns Promise that resolves when metadata is updated
     */
    private static async waitForMetadataUpdate(app: App, file: TFile): Promise<void> {
        return new Promise<void>((resolve) => {
            // Set a timeout to resolve anyway after a maximum wait time
            const timeout = setTimeout(() => {
                app.metadataCache.off('changed', eventHandler);
                console.warn('Metadata update timeout, continuing anyway');
                resolve();
            }, 2000);

            // Define event handler with proper type annotation
            const eventHandler = (...args: unknown[]) => {
                try {
                    const changedFile = args[0] as TFile;
                    if (changedFile?.path === file.path) {
                        clearTimeout(timeout);
                        app.metadataCache.off('changed', eventHandler);
                        // Add small delay to ensure cache is fully updated
                        setTimeout(resolve, 50);
                    }
                } catch (error) {
                    console.warn('Error in metadata change handler:', error);
                    clearTimeout(timeout);
                    app.metadataCache.off('changed', eventHandler);
                    // Resolve anyway to prevent hanging
                    resolve();
                }
            };
            
            app.metadataCache.on('changed', eventHandler);
            
            // Trigger the event if possible, but with a try/catch to handle any errors
            try {
                app.metadataCache.trigger('changed', file);
            } catch (error) {
                console.warn('Error triggering metadata change:', error);
                setTimeout(resolve, 50);
            }
        });
    }
    
    /**
     * Gets all unique tags from all markdown files in the vault
     * @param app - Obsidian App instance
     * @returns Array of unique tags, sorted alphabetically
     */
    static getAllTagsFromFrontmatter(app: App): string[] {
        const tags = new Set<string>();
        debugLog("getAllTagsFromFrontmatter >>>");
        const err = new Error().stack
        debugLog("getAllTagsFromFrontmatter::: ", err);

        app.vault.getMarkdownFiles().forEach((file) => {
            const cache = app.metadataCache.getFileCache(file);
            if (cache?.frontmatter?.tags) {
                debugLog("getAllTagsFromFrontmatter:tags:1/2:", tags);
                this.getExistingTags(cache.frontmatter).forEach(tag => tags.add(tag));
                debugLog("getAllTagsFromFrontmatter:tags:2/2:", tags);
            }
        });
        debugLog("<<< getAllTagsFromFrontmatter");
        return Array.from(tags).sort();
    }

    static getAllTags(app: App): string[] {
        return this.getAllTagsFromFrontmatter(app);
    }
    
    /**
     * Saves all unique tags to a markdown file in the specified directory
     * @param app - Obsidian App instance
     * @param tagDir - Directory to save tags file in (default: 'tags')
     * @throws {TagError} If file operations fail
     */
    static async saveAllTags(app: App, tagDir: string = 'tags'): Promise<void> {
        const tags = this.getAllTagsFromFrontmatter(app);
        const formattedTags = tags.map(tag => tag.startsWith('#') ? tag.substring(1) : tag).join('\n');
    
        const vault = app.vault;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;
    
        const folderPath = tagDir;
        const filePath = path.join(folderPath, `tags_${dateStr}.md`);

        // Show confirmation dialog
        const modal = new ConfirmationModal(
            app,
            'Save Tags',
            `Tags will be saved to: ${filePath}\nDo you want to continue?`,
            async () => {
                try {
                    // Try to create folder if it doesn't exist (ignore if already exists)
                    const folder = vault.getAbstractFileByPath(folderPath);
                    if (!folder) {
                        try {
                            await vault.createFolder(folderPath);
                        } catch (e) {
                            // Ignore folder exists error
                            if (!(e instanceof Error) || !e.message.includes('already exists')) {
                                throw e;
                            }
                        }
                    }
                    
                    // Create or modify file
                    const file = vault.getAbstractFileByPath(filePath);
                    if (!file) {
                        await vault.create(filePath, formattedTags);
                    } else {
                        await vault.modify(file as TFile, formattedTags);
                    }
                    
                    new Notice(`Tags saved to ${filePath}`, 3000);
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    new Notice(`Error saving tags: ${message}`, 3000);
                    throw new TagError(`Failed to save tags: ${message}`);
                }
            }
        );
        
        modal.open();
    }

    /**
     * Gets tags from a specified file
     * @param app - Obsidian App instance
     * @param filePath - Path to the tags file
     * @returns Promise resolving to an array of tags, or null if file not found
     */
    static async getTagsFromFile(app: App, filePath: string, format: TagFormat = 'kebab-case'): Promise<string[] | null> {
        try {
            if (!filePath) {
                return null;
            }
            
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                return null;
            }
            
            let content = await app.vault.read(file);

            // Strip YAML frontmatter (content between opening and closing ---)
            const frontmatterMatch = content.match(/^---[\r\n][\s\S]*?[\r\n]---[\r\n]/);
            if (frontmatterMatch) {
                content = content.slice(frontmatterMatch[0].length);
            }

            // Only extract markdown list items (lines starting with "- ")
            // This safely ignores headings, prose, blank lines, and code blocks
            return content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('- '))
                .map(line => line.slice(2).trim())  // strip the leading "- "
                .filter(Boolean)
                .map(tag => this.formatTag(tag, format));
        } catch (error) {
            //console.error('Error reading tags file:', error);
            return null;
        }
    }
    
    /**
     * Formats an array of tags, filtering out invalid ones
     * @param tags - Array of tags to format
     * @param keepHashPrefix - Whether to keep # prefix in the returned tags
     * @param format - Tag format style (default: 'kebab-case')
     * @returns Array of formatted valid tags
     */
    static formatTags(tags: unknown[], keepHashPrefix: boolean = false, format: TagFormat = 'kebab-case'): string[] {
        if (!Array.isArray(tags)) {
            return [];
        }

        debugLog(`formatTags called with:`, tags);

        const result = tags
            .filter(tag => tag !== null && tag !== undefined)
            .map(tag => {
                try {
                    const formatted = this.formatTag(tag, format);
                    if (formatted !== tag) {
                        debugLog(`formatTag transformed: "${tag}" -> "${formatted}"`);
                    }
                    return keepHashPrefix ? `#${formatted}` : formatted;
                } catch (error) {
                    return null;
                }
            })
            .filter((tag): tag is string => tag !== null && tag.length > 0);

        debugLog(`formatTags result:`, result);
        return result;
    }

    /**
     * Writes tags to a note's frontmatter
     * @param app - Obsidian App instance
     * @param file - File to update
     * @param tags - Array of tags to add
     * @param replace - Whether to replace existing tags (default: false)
     * @param tagFormat - Tag format style (default: 'kebab-case')
     * @returns Promise resolving to operation result
     */
    static async writeTagsToFrontmatter(
        app: App,
        file: TFile,
        tags: string[],
        replace: boolean = false,
        tagFormat: TagFormat = 'kebab-case'
    ): Promise<TagOperationResult> {
        try {
            if (!Array.isArray(tags)) {
                throw new Error('Tags parameter must be an array');
            }

            // Format and sanitize tags
            const formattedTags = this.formatTags(tags, false, tagFormat);
            
            if (formattedTags.length === 0) {
                return { 
                    success: true, 
                    message: 'No valid tags to add', 
                    tags: [] 
                };
            }

            const content = await app.vault.read(file);
            const cache = app.metadataCache.getFileCache(file);
            
            // Get existing tags if we're not replacing them
            let finalTags: string[];
            if (replace) {
                finalTags = formattedTags;
            } else {
                // Safely get existing tags even if frontmatter is undefined
                const existingTags = cache && cache.frontmatter 
                    ? this.getExistingTags(cache.frontmatter) 
                    : [];
                finalTags = this.mergeTags(existingTags, formattedTags);
            }
            
            // Create new content with updated frontmatter
            let newContent: string;
            const frontmatterPosition = cache?.frontmatterPosition;
            
            if (frontmatterPosition) {
                try {
                    // Extract and modify existing frontmatter
                    const frontmatterText = content.substring(
                        frontmatterPosition.start.offset + 4, // Skip '---\n'
                        frontmatterPosition.end.offset - 4    // Skip '\n---'
                    );
                    
                    let frontmatter: any;
                    try {
                        frontmatter = yaml.load(frontmatterText) || {};
                    } catch (yamlError) {
                        //console.error('YAML parse error:', yamlError);
                        throw new Error(`YAML parse error: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`);
                    }
                    
                    // Update tags in frontmatter
                    frontmatter[TagUtils.getTagKey(frontmatter)] = finalTags;
                    
                    // Convert back to YAML
                    const newFrontmatter = yaml.dump(frontmatter).trim();
                    
                    // Reconstruct the file content
                    newContent = 
                        '---\n' + 
                        newFrontmatter + 
                        '\n---' + 
                        content.substring(frontmatterPosition.end.offset);
                } catch (error) {
                    //console.error('Error processing existing frontmatter:', error);
                    // Fall back to creating new frontmatter
                    const yamlTags = finalTags.map(tag => `  - ${tag}`).join('\n');
                    newContent = `---\ntags:\n${yamlTags}\n---\n${content}`;
                }
            } else {
                // Create new frontmatter
                const yamlTags = finalTags.map(tag => `  - ${tag}`).join('\n');
                newContent = `---\ntags:\n${yamlTags}\n---\n${content}`;
            }
            
            // Write changes to file
            await app.vault.modify(file, newContent);
            
            // Instead of waiting for metadata cache update which could fail,
            // just add a simple delay to allow file system operations to complete
            await new Promise(resolve => setTimeout(resolve, 300));
            
            return {
                success: true,
                message: `Added ${finalTags.length} tag${finalTags.length === 1 ? '' : 's'}`,
                tags: finalTags.map(tag => `#${tag}`)
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            //console.error('Error writing tags to frontmatter:', error);
            return {
                success: false,
                message: `Failed to update tags: ${message}`
            };
        }
    }

    /**
     * Checks if a file should be excluded based on patterns
     * @param file - The file to check
     * @param excludePatterns - Array of exclusion patterns
     * @returns True if the file should be excluded, false otherwise
     */
    static isFileExcluded(file: TAbstractFile, excludePatterns: string[]): boolean {
        if (!excludePatterns || excludePatterns.length === 0) {
            return false;
        }

        const filePath = file.path;
        
        for (const pattern of excludePatterns) {
            try {
                // Simple wildcard pattern matching
                if (this.matchesGlobPattern(filePath, pattern)) {
                    return true;
                }
                
                // Path pattern matching - use startsWith for precise matching
                if (filePath.toLowerCase().startsWith(pattern.toLowerCase())) {
                    return true;
                }
                
                // Regex pattern (enclosed in slashes)
                if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
                    const regexPattern = pattern.slice(1, -1);
                    // Validate regex complexity to prevent ReDoS attacks
                    // Reject patterns with nested quantifiers or excessive length
                    if (regexPattern.length > 100 || /(\+|\*|\{)\s*(\+|\*|\{)/.test(regexPattern)) {
                        continue; // Skip potentially dangerous patterns
                    }
                    try {
                        const regex = new RegExp(regexPattern, 'i');
                        if (regex.test(filePath)) {
                            return true;
                        }
                    } catch {
                        // Invalid regex pattern - silently ignore and continue to next pattern
                    }
                }
            } catch (error) {
                // If any pattern fails, log it but continue with other patterns
                //console.error(`Error checking pattern "${pattern}":`, error);
            }
        }
        
        return false;
    }

    /**
     * Gets all markdown files from a folder recursively, including nested files
     * @param folder - The folder to search in
     * @returns Array of TFile objects that are markdown files
     */
    private static getMarkdownFilesFromFolder(folder: TFolder): TFile[] {
        const markdownFiles: TFile[] = [];
        
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                markdownFiles.push(child);
            } else if (child instanceof TFolder) {
                // Recursively get files from subfolders
                markdownFiles.push(...this.getMarkdownFilesFromFolder(child));
            }
        }
        
        return markdownFiles;
    }

    /**
     * Gets non-excluded markdown files from vault or specific folder
     * @param app - Obsidian App instance
     * @param excludePatterns - Array of exclusion patterns
     * @param folder - Optional folder to limit search to (includes nested files)
     * @returns Array of TFile objects that are markdown files and not excluded
     */
    static getNonExcludedMarkdownFiles(
        app: App, 
        excludePatterns: string[] = [], 
        folder?: TFolder
    ): TFile[] {
        let allFiles: TFile[];
        
        if (folder) {
            // Get all markdown files from the specified folder (including nested)
            allFiles = this.getMarkdownFilesFromFolder(folder);
        } else {
            // Get all markdown files from the vault
            allFiles = app.vault.getMarkdownFiles();
        }
        
        // Filter out excluded files
        return allFiles.filter(file => !this.isFileExcluded(file, excludePatterns));
    }
    
    /**
     * Flattens hierarchical tags (e.g., a/b/c) into separate tags (a, b, c)
     * @param app - Obsidian App instance
     * @param file - File to flatten tags in
     * @param tagFormat - Tag format style (default: 'kebab-case')
     * @returns Promise resolving to operation result with count of flattened tags
     */
    static async flattenHierarchicalTags(
        app: App,
        file: TFile,
        tagFormat: TagFormat = 'kebab-case'
    ): Promise<TagOperationResult> {
        try {
            const cache = app.metadataCache.getFileCache(file);
            const existingTags = cache?.frontmatter ? this.getExistingTags(cache.frontmatter) : [];

            if (existingTags.length === 0) {
                return { success: true, message: 'No tags found', tags: [] };
            }

            // Check if any tags are hierarchical
            const hasHierarchicalTags = existingTags.some(tag => tag.includes('/'));
            if (!hasHierarchicalTags) {
                return { success: true, message: 'No hierarchical tags found', tags: existingTags };
            }

            // Flatten all hierarchical tags
            const flattenedTags = new Set<string>();
            for (const tag of existingTags) {
                if (tag.includes('/')) {
                    // Split hierarchical tag and add each part
                    const parts = tag.split('/').filter(p => p.trim().length > 0);
                    for (const part of parts) {
                        flattenedTags.add(this.formatTag(part, tagFormat));
                    }
                } else {
                    flattenedTags.add(this.formatTag(tag, tagFormat));
                }
            }

            const newTags = Array.from(flattenedTags).sort();

            // Update the file with flattened tags
            const content = await app.vault.read(file);
            const frontmatterPosition = cache?.frontmatterPosition;

            if (!frontmatterPosition) {
                return { success: true, message: 'No frontmatter found', tags: [] };
            }

            const frontmatterText = content.substring(
                frontmatterPosition.start.offset + 4,
                frontmatterPosition.end.offset - 4
            );

            let frontmatter: any;
            try {
                frontmatter = yaml.load(frontmatterText) || {};
            } catch (yamlError) {
                return {
                    success: false,
                    message: 'YAML parse error',
                    tags: []
                };
            }

            frontmatter[TagUtils.getTagKey(frontmatter)] = newTags;
            const newFrontmatter = yaml.dump(frontmatter).trim();
            const newContent =
                '---\n' +
                newFrontmatter +
                '\n---' +
                content.substring(frontmatterPosition.end.offset);

            if (newContent !== content) {
                await app.vault.modify(file, newContent);
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            return {
                success: true,
                message: `Flattened to ${newTags.length} tags`,
                tags: newTags.map(t => `#${t}`)
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                message: `Flatten failed: ${message}`
            };
        }
    }

    /**
     * Simple glob pattern matching implementation
     * Supports * (any characters) and ? (single character)
     * @param str - String to test
     * @param pattern - Glob pattern
     * @returns True if the string matches the pattern
     */
    private static matchesGlobPattern(str: string, pattern: string): boolean {
        // Convert glob pattern to regex
        let regexPattern = pattern
            .replace(/\./g, '\\.') // Escape dots
            .replace(/\*\*/g, '###GLOBSTAR###') // Temporarily replace ** with placeholder
            .replace(/\*/g, '[^/]*') // Replace * with regex that doesn't match path separator
            .replace(/\?/g, '[^/]') // Replace ? with regex for any character except path separator
            .replace(/###GLOBSTAR###/g, '.*'); // Replace placeholder with regex for any characters
        
        // If pattern doesn't start with *, add ^ to match start of string
        if (!pattern.startsWith('*')) {
            regexPattern = '^' + regexPattern;
        }
        
        // If pattern doesn't end with *, add $ to match end of string
        if (!pattern.endsWith('*')) {
            regexPattern = regexPattern + '$';
        }
        
        try {
            const regex = new RegExp(regexPattern, 'i');
            return regex.test(str);
        } catch (e) {
            //console.error('Error creating regex from pattern:', pattern, e);
            return false;
        }
    }

    /**
     * Renames a tag across all files in the vault
     * @param app - Obsidian App instance
     * @param oldTag - Tag to rename (without # prefix)
     * @param newTag - New tag name (without # prefix)
     * @param files - Optional array of files to process (defaults to all markdown files)
     * @param tagFormat - Tag format style
     * @returns Promise resolving to operation result with count of affected files
     */
    static async renameTagInVault(
        app: App,
        oldTag: string,
        newTag: string,
        files?: TFile[],
        tagFormat: TagFormat = 'kebab-case'
    ): Promise<TagOperationResult & { affectedFiles: number }> {
        const normalizedOldTag = oldTag.startsWith('#') ? oldTag.substring(1).toLowerCase() : oldTag.toLowerCase();
        const formattedNewTag = this.formatTag(newTag, tagFormat);

        if (!normalizedOldTag || !formattedNewTag) {
            return { success: false, message: 'Invalid tag names', affectedFiles: 0 };
        }

        if (normalizedOldTag === formattedNewTag.toLowerCase()) {
            return { success: false, message: 'Old and new tag names are the same', affectedFiles: 0 };
        }

        const markdownFiles = files || app.vault.getMarkdownFiles();
        let affectedFiles = 0;
        let errorCount = 0;

        for (const file of markdownFiles) {
            try {
                const cache = app.metadataCache.getFileCache(file);
                const existingTags = cache?.frontmatter ? this.getExistingTags(cache.frontmatter) : [];

                if (existingTags.length === 0) continue;

                // Check if this file has the tag to rename
                const normalizedTags = existingTags.map(t =>
                    t.startsWith('#') ? t.substring(1).toLowerCase() : t.toLowerCase()
                );
                const tagIndex = normalizedTags.indexOf(normalizedOldTag);

                if (tagIndex === -1) continue;

                // Replace the old tag with the new one
                const newTags = existingTags.map((tag, idx) => {
                    if (idx === tagIndex) {
                        return formattedNewTag;
                    }
                    return this.formatTag(tag, tagFormat);
                });

                // Remove duplicates (in case new tag already exists)
                const uniqueTags = [...new Set(newTags)];

                // Update the file
                const content = await app.vault.read(file);
                const frontmatterPosition = cache?.frontmatterPosition;

                if (!frontmatterPosition) continue;

                const frontmatterText = content.substring(
                    frontmatterPosition.start.offset + 4,
                    frontmatterPosition.end.offset - 4
                );

                let frontmatter: any;
                try {
                    frontmatter = yaml.load(frontmatterText) || {};
                } catch {
                    continue;
                }

                frontmatter[TagUtils.getTagKey(frontmatter)] = uniqueTags;
                const newFrontmatter = yaml.dump(frontmatter).trim();
                const newContent =
                    '---\n' +
                    newFrontmatter +
                    '\n---' +
                    content.substring(frontmatterPosition.end.offset);

                if (newContent !== content) {
                    await app.vault.modify(file, newContent);
                    affectedFiles++;
                }
            } catch {
                errorCount++;
            }
        }

        // Small delay to allow file system to settle
        if (affectedFiles > 0) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (errorCount > 0) {
            return {
                success: true,
                message: `Renamed tag in ${affectedFiles} files (${errorCount} errors)`,
                affectedFiles
            };
        }

        return {
            success: true,
            message: `Renamed #${normalizedOldTag} to #${formattedNewTag} in ${affectedFiles} files`,
            affectedFiles
        };
    }
}
