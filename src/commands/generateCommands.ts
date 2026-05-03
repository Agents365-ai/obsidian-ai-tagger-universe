import { Editor, MarkdownFileInfo, MarkdownView, Menu, Notice, TFile } from 'obsidian';
import type AITaggerPlugin from '../main';
import { TagUtils } from '../utils/tagUtils';
import { TaggingMode } from '../services/prompts/types';

export function registerGenerateCommands(plugin: AITaggerPlugin) {
    // Command to generate tags for current note (with selection support)
    plugin.addCommand({
        id: 'generate-tags-for-current-note',
        name: plugin.t.commands.generateTagsForCurrentNote,
        icon: 'tag',
        editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
            const view = ctx instanceof MarkdownView ? ctx : null;
            if (!view?.file) {
                new Notice(plugin.t.messages.openNote);
                return;
            }
            // Capture target file at command time — view.file mutates if the
            // user switches notes while the LLM call is in flight (issue #59).
            const targetFile: TFile = view.file;

            const selectedText = editor.getSelection();
            const content = selectedText || await plugin.app.vault.read(targetFile);

            if (!content.trim()) {
                new Notice(plugin.t.messages.noContentToAnalyze);
                return;
            }

            const existingTags = TagUtils.getAllTags(plugin.app);
            new Notice(plugin.t.messages.analyzing);

            try {
                let maxTags = plugin.settings.tagRangeGenerateMax;
                if (plugin.settings.taggingMode === TaggingMode.PredefinedTags) {
                    maxTags = plugin.settings.tagRangePredefinedMax;
                } else if (plugin.settings.taggingMode === TaggingMode.Hybrid) {
                    maxTags = plugin.settings.tagRangePredefinedMax + plugin.settings.tagRangeGenerateMax;
                }

                const analysis = await plugin.llmService.analyzeTags(
                    content,
                    existingTags,
                    plugin.settings.taggingMode,
                    maxTags,
                    plugin.settings.language
                );

                const suggestedTags = analysis.suggestedTags;
                const matchedTags = analysis.matchedExistingTags || [];

                const result = await TagUtils.updateNoteTags(plugin.app, targetFile, suggestedTags, matchedTags, true, plugin.settings.replaceTags, plugin.settings.tagFormat);

                if (selectedText && result.success) {
                    editor.replaceSelection(selectedText);
                }
                plugin.handleTagUpdateResult(result);
            } catch (error) {
                // console.error('Error generating tags:', error);
                new Notice(plugin.t.messages.failedToGenerateTags);
            }
        }
    });

    // Command to generate tags for current folder
    plugin.addCommand({
        id: 'generate-tags-for-current-folder',
        name: plugin.t.commands.generateTagsForCurrentFolder,
        icon: 'tag',
        callback: async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice(plugin.t.messages.openNote);
                return;
            }

            const parentFolder = activeFile.parent;
            if (!parentFolder) {
                new Notice(plugin.t.messages.noParentFolder);
                return;
            }

            const filesInFolder = plugin.getNonExcludedMarkdownFilesFromFolder(parentFolder);

            if (filesInFolder.length === 0) {
                new Notice(plugin.t.messages.noMdFiles);
                return;
            }

            const confirmed = await plugin.showConfirmationDialog(
                `${plugin.t.messages.generateTagsForFolderConfirm.replace('{count}', String(filesInFolder.length))}`
            );

            if (!confirmed) {
                new Notice(plugin.t.messages.operationCancelled);
                return;
            }

            await plugin.analyzeAndTagFiles(filesInFolder);
        }
    });

    // Command to generate tags for vault
    plugin.addCommand({
        id: 'generate-tags-for-vault',
        name: plugin.t.commands.generateTagsForVault,
        icon: 'tag',
        callback: async () => {
            const files = plugin.getNonExcludedMarkdownFiles();
            if (files.length === 0) {
                new Notice(plugin.t.messages.noMdFiles);
                return;
            }

            const confirmed = await plugin.showConfirmationDialog(
                `${plugin.t.messages.generateTagsForVaultConfirm.replace('{count}', String(files.length))}`
            );

            if (!confirmed) {
                new Notice(plugin.t.messages.operationCancelled);
                return;
            }

            await plugin.analyzeAndTagFiles(files);
        }
    });

    // Register file menu items for batch tagging
    plugin.registerEvent(
        // @ts-ignore - File menu event is not properly typed in Obsidian API
        plugin.app.workspace.on('file-menu', (menu: Menu, file: TFile, source: string, files?: TFile[]) => {
            if (files && files.length > 0) {
                // Multiple files selected
                const markdownFiles = files.filter(f => f.extension === 'md');
                if (markdownFiles.length > 0) {
                    menu.addItem((item) => {
                        item
                            .setTitle(`${plugin.t.commands.aiTagSelectedNotes.replace('{count}', String(markdownFiles.length))}`)
                            .setIcon('tag')
                            .onClick(async () => {
                                const confirmed = await plugin.showConfirmationDialog(
                                    `${plugin.t.messages.generateTagsForSelectedConfirm.replace('{count}', String(markdownFiles.length))}`
                                );

                                if (!confirmed) {
                                    new Notice(plugin.t.messages.operationCancelled);
                                    return;
                                }

                                await plugin.analyzeAndTagFiles(markdownFiles);
                            });
                    });
                }
            } else if (file.extension === 'md') {
                // Single file selected
                menu.addItem((item) => {
                    item
                        .setTitle(plugin.t.commands.aiTagThisNote)
                        .setIcon('tag')
                        .onClick(() => plugin.analyzeAndTagFiles([file]));
                });
            }
        })
    );
}
