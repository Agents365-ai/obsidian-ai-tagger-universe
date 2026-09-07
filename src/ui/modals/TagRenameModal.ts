import { App, Modal, ButtonComponent, TextComponent, Notice } from "obsidian";
import { Translations } from "../../i18n/types";
import { TagUtils } from "../../utils/tagUtils";
import { TagFormat } from "../../core/settings";

export class TagRenameModal extends Modal {
    private oldTagInput!: TextComponent;
    private newTagInput!: TextComponent;
    private t: Translations;
    private tagFormat: TagFormat;
    private onSuccess?: () => void;

    constructor(
        app: App,
        t: Translations,
        tagFormat: TagFormat,
        onSuccess?: () => void,
    ) {
        super(app);
        this.t = t;
        this.tagFormat = tagFormat;
        this.onSuccess = onSuccess;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("tag-rename-modal");

        contentEl.createEl("h3", { text: this.t.tagRename.title });

        // Old tag input
        const oldTagContainer = contentEl.createDiv({
            cls: "tag-rename-input-group",
        });
        oldTagContainer.createEl("label", {
            text: this.t.tagRename.oldTagLabel,
        });
        this.oldTagInput = new TextComponent(oldTagContainer);
        this.oldTagInput.setPlaceholder(this.t.tagRename.oldTagPlaceholder);
        this.oldTagInput.inputEl.addClass("tag-rename-input");

        // New tag input
        const newTagContainer = contentEl.createDiv({
            cls: "tag-rename-input-group",
        });
        newTagContainer.createEl("label", {
            text: this.t.tagRename.newTagLabel,
        });
        this.newTagInput = new TextComponent(newTagContainer);
        this.newTagInput.setPlaceholder(this.t.tagRename.newTagPlaceholder);
        this.newTagInput.inputEl.addClass("tag-rename-input");

        // Buttons
        const buttonContainer = contentEl.createDiv({
            cls: "tag-rename-buttons",
        });

        new ButtonComponent(buttonContainer)
            .setButtonText(this.t.modals.cancel)
            .onClick(() => this.close());

        new ButtonComponent(buttonContainer)
            .setButtonText(this.t.tagRename.rename)
            .setCta()
            .onClick(() => this.handleRename());

        // Focus old tag input
        this.oldTagInput.inputEl.focus();

        // Enter key to submit
        this.newTagInput.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this.handleRename().catch((error) =>
                    console.error("Tag rename failed:", error),
                );
            }
        });
    }

    private async handleRename(): Promise<void> {
        const oldTag = this.oldTagInput.getValue().trim();
        const newTag = this.newTagInput.getValue().trim();

        if (!oldTag || !newTag) {
            new Notice(this.t.tagRename.noTagSpecified);
            return;
        }

        const normalizedOld = oldTag.startsWith("#")
            ? oldTag.substring(1)
            : oldTag;
        const normalizedNew = newTag.startsWith("#")
            ? newTag.substring(1)
            : newTag;

        if (normalizedOld.toLowerCase() === normalizedNew.toLowerCase()) {
            new Notice(this.t.tagRename.sameTagError);
            return;
        }

        new Notice(this.t.tagRename.renaming);

        const result = await TagUtils.renameTagInVault(
            this.app,
            normalizedOld,
            normalizedNew,
            undefined,
            this.tagFormat,
        );

        if (result.success) {
            new Notice(
                this.t.tagRename.success.replace(
                    "{count}",
                    String(result.affectedFiles),
                ),
            );
            this.onSuccess?.();
            this.close();
        } else {
            new Notice(result.message);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
