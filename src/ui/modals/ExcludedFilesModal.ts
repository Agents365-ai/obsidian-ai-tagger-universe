import { type App, Modal, ButtonComponent } from "obsidian";
import type AITaggerPlugin from "../../main";
import { ConfirmationModal } from "./ConfirmationModal";
import {
    getVaultItems,
    type VaultItem,
    getPathStrings,
} from "../../utils/vaultPathFetcher";

export class ExcludedFilesModal extends Modal {
    private excludedFolders: string[] = [];
    private filterInput!: HTMLInputElement;
    private pathDropdownContainer!: HTMLElement;
    private searchTerm: string = "";
    private cachedPaths: VaultItem[] = [];
    private hasLoadedPaths: boolean = false;

    private documentClickListener = (event: MouseEvent) => {
        const target = event.target as Node;
        if (
            this.filterInput &&
            !this.filterInput.parentElement?.contains(target) &&
            !this.pathDropdownContainer.contains(target)
        ) {
            this.pathDropdownContainer.hide();
        }
    };

    constructor(
        app: App,
        private plugin: AITaggerPlugin,
        private onSave: (excludedFolders: string[]) => void,
    ) {
        super(app);
        this.excludedFolders = [...plugin.settings.excludedFolders];
    }

    private loadCachedPaths() {
        // Only load paths if they haven't been loaded yet
        if (!this.hasLoadedPaths) {
            try {
                this.cachedPaths = getVaultItems(this.app);
                this.hasLoadedPaths = true;
            } catch (error) {
                this.cachedPaths = [];
            }
        }
    }

    onOpen() {
        const { contentEl } = this;

        // Load paths when the modal is opened
        this.loadCachedPaths();

        contentEl.addClass("excluded-files-modal");

        // Set modal title
        contentEl.createEl("h2", {
            text: this.plugin.t.modals.excludedFilesTitle,
            cls: "excluded-files-title",
        });

        contentEl.createEl("p", {
            text: this.plugin.t.modals.excludedFilesSubtitle,
            cls: "excluded-files-subtitle",
        });

        // Create container for excluded paths list
        const excludedListContainer = contentEl.createDiv({
            cls: "excluded-list",
        });
        this.renderExcludedList(excludedListContainer);

        // Create filter input container
        const filterContainer = contentEl.createDiv({
            cls: "filter-container",
        });

        // Add filter label
        filterContainer.createDiv({
            text: this.plugin.t.modals.filterLabel,
            cls: "filter-label",
        });

        // Create input container
        const inputContainer = filterContainer.createDiv({
            cls: "filter-input-container",
        });

        // Add input field
        this.filterInput = inputContainer.createEl("input", {
            type: "text",
            placeholder: this.plugin.t.modals.pathPlaceholder,
            cls: "filter-input",
            value: "",
        });

        this.searchTerm = ""; // Start with empty search term

        // Create path dropdown container (visibility toggled via hide()/show())
        this.pathDropdownContainer = inputContainer.createDiv({
            cls: "path-dropdown-container",
        });
        this.pathDropdownContainer.hide();

        // Prevent event bubbling to keep dropdown open when clicked
        this.pathDropdownContainer.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        // Add button
        const addButtonContainer = inputContainer.createDiv({
            cls: "excluded-files-add-button-container",
        });

        const addButtonEl = new ButtonComponent(addButtonContainer)
            .setButtonText(this.plugin.t.modals.addButton)
            .onClick(() => {
                const value = this.filterInput.value.trim();
                if (value && !this.excludedFolders.includes(value)) {
                    this.excludedFolders.push(value);
                    this.renderExcludedList(excludedListContainer);
                    this.filterInput.value = "";
                    this.searchTerm = "";
                    this.pathDropdownContainer.hide();
                }
            });

        addButtonEl.buttonEl.addClass("excluded-files-add-button");

        // Set up input events
        this.filterInput.addEventListener("focus", () => {
            // Show dropdown when input gets focus
            this.updatePathDropdown(this.filterInput.value);
            this.pathDropdownContainer.show();
        });

        this.filterInput.addEventListener("input", () => {
            this.searchTerm = this.filterInput.value;
            this.updatePathDropdown(this.searchTerm);

            // Make sure dropdown is visible when typing
            this.pathDropdownContainer.show();
        });

        this.filterInput.addEventListener("click", (e) => {
            // Prevent document click handler from hiding dropdown
            e.stopPropagation();

            // Show dropdown on click in the input
            this.updatePathDropdown(this.filterInput.value);
            this.pathDropdownContainer.show();
        });

        // Handle clicks outside the dropdown
        document.addEventListener("click", this.documentClickListener);

        // Create spacer element to push buttons to bottom
        contentEl.createDiv("modal-spacer");

        // Create button container for Save/Cancel
        const buttonContainer = contentEl.createDiv("modal-button-container");

        // Left-side buttons container
        const leftButtonContainer = buttonContainer.createDiv("left-buttons");

        // Add Clear All button
        const clearAllButtonEl = new ButtonComponent(leftButtonContainer)
            .setButtonText(this.plugin.t.modals.clearAllButton)
            .setDisabled(this.excludedFolders.length === 0)
            .onClick(() => {
                if (this.excludedFolders.length === 0) return;
                // Confirmation dialog to prevent accidental deletion
                new ConfirmationModal(
                    this.app,
                    this.plugin.t.modals.warning,
                    this.plugin.t.modals.clearAllConfirm,
                    () => {
                        this.excludedFolders = [];
                        this.renderExcludedList(excludedListContainer);
                    },
                    this.plugin,
                ).open();
            });

        clearAllButtonEl.buttonEl.addClass("excluded-files-clear-button");

        // Right-side buttons container
        const rightButtonContainer = buttonContainer.createDiv("right-buttons");

        // Add cancel button
        const cancelButtonEl = new ButtonComponent(rightButtonContainer)
            .setButtonText(this.plugin.t.modals.cancelButton)
            .onClick(() => {
                this.close();
            });

        cancelButtonEl.buttonEl.addClass("excluded-files-action-button");

        // Add save button
        const saveButtonEl = new ButtonComponent(rightButtonContainer)
            .setButtonText(this.plugin.t.modals.saveButton)
            .setCta()
            .onClick(() => {
                this.onSave(this.excludedFolders);
                this.close();
            });

        saveButtonEl.buttonEl.addClass("excluded-files-action-button");
    }

    private updatePathDropdown(searchTerm: string) {
        this.pathDropdownContainer.empty();

        try {
            // Make sure paths are loaded
            if (!this.hasLoadedPaths) {
                this.loadCachedPaths();
            }

            const lowerSearchTerm = searchTerm.toLowerCase().trim();
            let matchedItems: VaultItem[] = [];

            // Filter cached paths based on search term
            if (lowerSearchTerm) {
                matchedItems = this.cachedPaths.filter(
                    (item) =>
                        item.path.toLowerCase().includes(lowerSearchTerm) ||
                        item.name.toLowerCase().includes(lowerSearchTerm),
                );

                // Sort by relevance - exact matches first, then starts with, then includes
                matchedItems.sort((a, b) => {
                    const aName = a.name.toLowerCase();
                    const bName = b.name.toLowerCase();
                    const aPath = a.path.toLowerCase();
                    const bPath = b.path.toLowerCase();

                    // Exact name matches
                    if (aName === lowerSearchTerm && bName !== lowerSearchTerm)
                        return -1;
                    if (aName !== lowerSearchTerm && bName === lowerSearchTerm)
                        return 1;

                    // Name starts with
                    if (
                        aName.startsWith(lowerSearchTerm) &&
                        !bName.startsWith(lowerSearchTerm)
                    )
                        return -1;
                    if (
                        !aName.startsWith(lowerSearchTerm) &&
                        bName.startsWith(lowerSearchTerm)
                    )
                        return 1;

                    // Path starts with
                    if (
                        aPath.startsWith(lowerSearchTerm) &&
                        !bPath.startsWith(lowerSearchTerm)
                    )
                        return -1;
                    if (
                        !aPath.startsWith(lowerSearchTerm) &&
                        bPath.startsWith(lowerSearchTerm)
                    )
                        return 1;

                    // Folders first
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;

                    // Default to alphabetical
                    return aPath.localeCompare(bPath);
                });
            } else {
                // Show common folders/patterns if no search term
                const commonPatterns = [
                    { path: "Tags/", isFolder: true, name: "Tags" },
                    { path: "images/", isFolder: true, name: "images" },
                    { path: "audio/", isFolder: true, name: "audio" },
                    { path: "Excalidraw/", isFolder: true, name: "Excalidraw" },
                    {
                        path: "textgenerator/",
                        isFolder: true,
                        name: "textgenerator",
                    },
                    {
                        path: "attachments/",
                        isFolder: true,
                        name: "attachments",
                    },
                    { path: "templates/", isFolder: true, name: "templates" },
                    {
                        path: `${this.app.vault.configDir}/`,
                        isFolder: true,
                        name: this.app.vault.configDir,
                    },
                ];

                // Find actual matching folders from vault that match common patterns
                for (const pattern of commonPatterns) {
                    const existingItem = this.cachedPaths.find(
                        (item) =>
                            item.path.toLowerCase() ===
                                pattern.path.toLowerCase() ||
                            item.name.toLowerCase() ===
                                pattern.name.toLowerCase(),
                    );

                    if (existingItem) {
                        matchedItems.push(existingItem);
                    } else {
                        // Add suggestion even if not found
                        matchedItems.push(pattern);
                    }
                }
            }

            // Limit items shown for performance
            const limitedItems = matchedItems.slice(0, 10);

            if (limitedItems.length === 0) {
                // Show a message when no items match
                this.pathDropdownContainer.createDiv({
                    cls: "path-dropdown-empty",
                    text: this.plugin.t.modals.noMatchingPaths,
                });

                // Add option to use current text as a pattern
                if (lowerSearchTerm) {
                    const useCurrentTextEl =
                        this.pathDropdownContainer.createDiv({
                            cls: "path-dropdown-item path-use-current",
                            text: this.plugin.t.modals.useAsPattern.replace(
                                "{searchTerm}",
                                searchTerm,
                            ),
                        });

                    useCurrentTextEl.addEventListener("click", () => {
                        // Add current text as an exclusion pattern
                        if (!this.excludedFolders.includes(searchTerm)) {
                            this.excludedFolders.push(searchTerm);
                            const listContainer = this.contentEl.querySelector(
                                ".excluded-list",
                            ) as HTMLElement;
                            if (listContainer)
                                this.renderExcludedList(listContainer);
                            this.filterInput.value = "";
                            this.searchTerm = "";
                            this.pathDropdownContainer.hide();
                        }
                    });
                }
            } else {
                // Render all matched items
                for (const item of limitedItems) {
                    this.renderPathItem(item);
                }

                // Show total count if there are more results
                if (matchedItems.length > limitedItems.length) {
                    this.pathDropdownContainer.createDiv({
                        cls: "path-dropdown-more",
                        text: `${matchedItems.length - limitedItems.length} ${this.plugin.t.modals.moreResults}`,
                    });
                }
            }

            // Display the dropdown
            this.pathDropdownContainer.show();
        } catch (error) {
            // Show error state
            this.pathDropdownContainer.createDiv({
                cls: "path-dropdown-error",
                text: this.plugin.t.modals.errorLoadingPaths,
            });
        }
    }

    private renderPathItem(item: VaultItem) {
        const itemEl = this.pathDropdownContainer.createDiv({
            cls: "path-dropdown-item",
        });

        // Add appropriate icon
        itemEl.createSpan({
            cls: `path-item-icon ${item.isFolder ? "folder-icon" : "file-icon"}`,
        });

        // Create text element for path
        const textEl = itemEl.createSpan({
            cls: "path-item-text",
            text: item.path,
        });

        // Highlight search term if applicable
        if (this.searchTerm) {
            const searchTermLower = this.searchTerm.toLowerCase();
            const pathLower = item.path.toLowerCase();
            const index = pathLower.indexOf(searchTermLower);

            if (index >= 0) {
                textEl.empty();

                // Text before match
                if (index > 0) {
                    textEl.createSpan({
                        text: item.path.substring(0, index),
                    });
                }

                // Highlighted match
                textEl.createSpan({
                    text: item.path.substring(
                        index,
                        index + this.searchTerm.length,
                    ),
                    cls: "path-match-highlight",
                });

                // Text after match
                if (index + this.searchTerm.length < item.path.length) {
                    textEl.createSpan({
                        text: item.path.substring(
                            index + this.searchTerm.length,
                        ),
                    });
                }
            }
        }

        // Add click handler
        itemEl.addEventListener("click", () => {
            this.filterInput.value = item.path;
            this.searchTerm = item.path;
            this.pathDropdownContainer.hide();

            // Add path to excluded folders directly
            if (!this.excludedFolders.includes(item.path)) {
                this.excludedFolders.push(item.path);
                const listContainer = this.contentEl.querySelector(
                    ".excluded-list",
                ) as HTMLElement;
                if (listContainer) this.renderExcludedList(listContainer);
                this.filterInput.value = "";
                this.searchTerm = "";
            }
        });
    }

    private renderExcludedList(container: HTMLElement) {
        container.empty();

        if (this.excludedFolders.length === 0) {
            container.createDiv({
                text: this.plugin.t.modals.noExclusionsDefined,
                cls: "excluded-empty-message",
            });

            return;
        }

        const excludedList = container.createDiv({
            cls: "excluded-folders-list",
        });

        for (const folder of this.excludedFolders) {
            const item = excludedList.createDiv({
                cls: "excluded-folder-item",
            });

            // Path text with icon
            const pathContainer = item.createDiv({
                cls: "excluded-folder-path",
            });

            // Add appropriate icon based on pattern
            const isFolder = folder.endsWith("/");
            pathContainer.createSpan({
                cls: `excluded-item-icon ${isFolder ? "folder-icon" : folder.includes("*") ? "search-icon" : "file-icon"}`,
            });

            // Path text
            pathContainer.createSpan({
                text: folder,
                cls: "excluded-folder-text",
            });

            // Remove button
            const removeButton = item.createEl("button", {
                cls: "excluded-folder-remove",
                text: "×",
            });

            removeButton.addEventListener("click", (e) => {
                e.stopPropagation();
                const index = this.excludedFolders.indexOf(folder);
                if (index !== -1) {
                    this.excludedFolders.splice(index, 1);
                    this.renderExcludedList(container);
                }
            });
        }
    }

    onClose() {
        document.removeEventListener("click", this.documentClickListener);
        this.contentEl.empty();
    }
}
