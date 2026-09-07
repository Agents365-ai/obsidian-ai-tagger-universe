import { App, Modal, Notice, TFile } from "obsidian";
import { Translations } from "../../i18n/types";
import { TagTemplate } from "../../core/settings";
import { TagUtils } from "../../utils/tagUtils";

export class TagTemplateApplyModal extends Modal {
    private t: Translations;
    private templates: TagTemplate[];
    private file: TFile;
    private selectedTemplate: TagTemplate | null = null;

    constructor(
        app: App,
        t: Translations,
        templates: TagTemplate[],
        file: TFile,
    ) {
        super(app);
        this.t = t;
        this.templates = templates;
        this.file = file;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("tag-template-apply-modal");

        contentEl.createEl("h3", { text: this.t.tagTemplates.applyTemplate });
        contentEl.createEl("p", {
            text: this.t.tagTemplates.selectTemplate,
            cls: "tag-template-description",
        });

        if (this.templates.length === 0) {
            contentEl.createEl("p", {
                text: this.t.tagTemplates.noTemplates,
                cls: "tag-template-empty",
            });
            return;
        }

        const listEl = contentEl.createDiv({ cls: "tag-template-list" });

        for (const template of this.templates) {
            const itemEl = listEl.createDiv({ cls: "tag-template-item" });
            itemEl.addEventListener("click", () =>
                this.selectTemplate(template, itemEl),
            );

            const nameEl = itemEl.createDiv({ cls: "tag-template-item-name" });
            nameEl.setText(template.name);

            const tagsEl = itemEl.createDiv({ cls: "tag-template-item-tags" });
            tagsEl.setText(template.tags.map((t) => `#${t}`).join(" "));
        }

        const buttonContainer = contentEl.createDiv({
            cls: "tag-template-buttons",
        });

        buttonContainer
            .createEl("button", { text: this.t.tagTemplates.cancel })
            .addEventListener("click", () => this.close());

        const applyBtn = buttonContainer.createEl("button", {
            text: this.t.tagTemplates.applyTemplate,
            cls: "mod-cta",
        });
        applyBtn.addEventListener("click", () => {
            this.handleApply().catch((error) =>
                console.error("Template apply failed:", error),
            );
        });
    }

    private selectTemplate(template: TagTemplate, element: HTMLElement): void {
        this.contentEl.querySelectorAll(".tag-template-item").forEach((el) => {
            el.removeClass("is-selected");
        });
        element.addClass("is-selected");
        this.selectedTemplate = template;
    }

    private async handleApply(): Promise<void> {
        if (!this.selectedTemplate) {
            new Notice(this.t.tagTemplates.selectTemplate);
            return;
        }

        const result = await TagUtils.updateNoteTags(
            this.app,
            this.file,
            this.selectedTemplate.tags,
            [], // matchedTags (empty for templates)
            false, // silent
            false, // replaceTags (merge mode)
        );

        if (result.success) {
            const message = this.t.tagTemplates.templateApplied
                .replace("{name}", this.selectedTemplate.name)
                .replace("{count}", String(this.selectedTemplate.tags.length));
            new Notice(message);
            this.close();
        } else {
            new Notice(result.message);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
