import { App, Modal, Setting, Notice } from "obsidian";
import { Translations } from "../../i18n/types";
import { TagTemplate, TagFormat } from "../../core/settings";
import { TagUtils } from "../../utils/tagUtils";

export class TagTemplateEditModal extends Modal {
    private t: Translations;
    private template: TagTemplate | null;
    private tagFormat: TagFormat;
    private existingNames: string[];
    private onSave: (template: TagTemplate) => void;
    private nameInput = "";
    private tagsInput = "";

    constructor(
        app: App,
        t: Translations,
        tagFormat: TagFormat,
        existingNames: string[],
        template: TagTemplate | null,
        onSave: (template: TagTemplate) => void,
    ) {
        super(app);
        this.t = t;
        this.tagFormat = tagFormat;
        this.existingNames = existingNames;
        this.template = template;
        this.onSave = onSave;
        if (template) {
            this.nameInput = template.name;
            this.tagsInput = template.tags.join(", ");
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("tag-template-edit-modal");

        contentEl.createEl("h3", {
            text: this.template
                ? this.t.tagTemplates.editTemplate
                : this.t.tagTemplates.addTemplate,
        });

        new Setting(contentEl)
            .setName(this.t.tagTemplates.templateName)
            .addText((text) => {
                text.setPlaceholder(this.t.tagTemplates.templateNamePlaceholder)
                    .setValue(this.nameInput)
                    .onChange((value) => (this.nameInput = value));
                text.inputEl.addClass("ai-tagger-template-name");
            });

        new Setting(contentEl)
            .setName(this.t.tagTemplates.templateTags)
            .setDesc(this.t.tagTemplates.templateTagsDesc)
            .addTextArea((text) => {
                text.setPlaceholder(this.t.tagTemplates.templateTagsPlaceholder)
                    .setValue(this.tagsInput)
                    .onChange((value) => (this.tagsInput = value));
                text.inputEl.addClass("ai-tagger-template-tags");
            });

        const buttonContainer = contentEl.createDiv({
            cls: "tag-template-buttons",
        });

        buttonContainer
            .createEl("button", { text: this.t.tagTemplates.cancel })
            .addEventListener("click", () => this.close());

        const saveBtn = buttonContainer.createEl("button", {
            text: this.t.tagTemplates.save,
            cls: "mod-cta",
        });
        saveBtn.addEventListener("click", () => this.handleSave());
    }

    private handleSave(): void {
        const name = this.nameInput.trim();
        if (!name) {
            new Notice(this.t.tagTemplates.emptyName);
            return;
        }

        // Check for duplicate name (excluding current template if editing)
        const isDuplicate = this.existingNames.some(
            (n) =>
                n.toLowerCase() === name.toLowerCase() &&
                (!this.template ||
                    n.toLowerCase() !== this.template.name.toLowerCase()),
        );
        if (isDuplicate) {
            new Notice(this.t.tagTemplates.duplicateName);
            return;
        }

        const rawTags = this.tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t);
        if (rawTags.length === 0) {
            new Notice(this.t.tagTemplates.emptyTags);
            return;
        }

        const tags = TagUtils.formatTags(rawTags, false, this.tagFormat);

        const template: TagTemplate = {
            id: this.template?.id || crypto.randomUUID(),
            name,
            tags,
        };

        this.onSave(template);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
