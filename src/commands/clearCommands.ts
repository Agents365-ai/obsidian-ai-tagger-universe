import {
    Editor,
    MarkdownFileInfo,
    MarkdownView,
    Notice,
    TFile,
} from "obsidian";
import AITaggerPlugin from "../main";

export function registerClearCommands(plugin: AITaggerPlugin) {
    // Command to clear tags in current note
    plugin.addCommand({
        id: "clear-tags-for-current-note",
        name: plugin.t.commands.clearTagsForCurrentNote,
        icon: "eraser",
        editorCallback: (
            editor: Editor,
            ctx: MarkdownView | MarkdownFileInfo,
        ) => {
            const view = ctx instanceof MarkdownView ? ctx : null;
            if (view?.file) {
                plugin.clearNoteTags().catch(console.error);
            } else {
                new Notice(plugin.t.messages.openNoteFirst);
            }
        },
    });

    // Command to clear tags in current folder
    plugin.addCommand({
        id: "clear-tags-for-current-folder",
        name: plugin.t.commands.clearTagsForCurrentFolder,
        icon: "eraser",
        callback: async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice(plugin.t.messages.openNoteFirst);
                return;
            }

            const parentFolder = activeFile.parent;
            if (!parentFolder) {
                new Notice(plugin.t.messages.noParentFolderFound);
                return;
            }

            const filesInFolder =
                plugin.getNonExcludedMarkdownFilesFromFolder(parentFolder);

            if (filesInFolder.length === 0) {
                new Notice(plugin.t.messages.noMarkdownFilesFound);
                return;
            }

            const confirmed = await plugin.showConfirmationDialog(
                `${plugin.t.messages.clearTagsForFolderConfirm.replace("{count}", String(filesInFolder.length))}`,
            );

            if (!confirmed) {
                new Notice(plugin.t.messages.operationCancelled);
                return;
            }

            const result = await plugin.clearDirectoryTags(filesInFolder);
            if (result.success) {
                new Notice(
                    `${plugin.t.messages.tagsClearedFrom.replace("{count}", String(result.successCount))}`,
                );
            } else {
                new Notice(plugin.t.messages.failedToClearTags);
            }
        },
    });

    // Command to clear tags in vault
    plugin.addCommand({
        id: "clear-tags-for-vault",
        name: plugin.t.commands.clearTagsForVault,
        icon: "eraser",
        callback: async () => {
            await plugin.clearAllNotesTags();
        },
    });
}
