import { Setting } from "obsidian";
import { BaseSettingSection } from "./BaseSettingSection";
import { TagTemplateEditModal } from "../modals/TagTemplateEditModal";
import { TagTemplate } from "../../core/settings";

export class TagTemplatesSection extends BaseSettingSection {
    display(): void {
        this.containerEl.createEl("h1", {
            text: this.plugin.t.tagTemplates.title,
        });
        this.containerEl.createEl("p", {
            text: this.plugin.t.tagTemplates.description,
            cls: "setting-item-description",
        });

        // Add template button
        new Setting(this.containerEl).addButton((btn) => {
            btn.setButtonText(this.plugin.t.tagTemplates.addTemplate)
                .setCta()
                .onClick(() => this.openEditModal(null));
        });

        // Templates list container
        const listEl = this.containerEl.createDiv({
            cls: "tag-templates-list",
        });
        this.renderTemplatesList(listEl);
    }

    private renderTemplatesList(listEl: HTMLElement): void {
        listEl.empty();

        const templates = this.plugin.settings.tagTemplates;

        if (templates.length === 0) {
            listEl.createEl("p", {
                text: this.plugin.t.tagTemplates.noTemplates,
                cls: "tag-templates-empty",
            });
            return;
        }

        for (const template of templates) {
            const itemEl = listEl.createDiv({
                cls: "tag-template-setting-item",
            });

            const infoEl = itemEl.createDiv({ cls: "tag-template-info" });
            infoEl.createDiv({ cls: "tag-template-name", text: template.name });
            infoEl.createDiv({
                cls: "tag-template-tags",
                text: template.tags.map((t) => `#${t}`).join(" "),
            });

            const actionsEl = itemEl.createDiv({ cls: "tag-template-actions" });

            const editBtn = actionsEl.createEl("button", {
                text: this.plugin.t.tagTemplates.editTemplate,
                cls: "tag-template-btn",
            });
            editBtn.addEventListener("click", () =>
                this.openEditModal(template),
            );

            const deleteBtn = actionsEl.createEl("button", {
                text: this.plugin.t.tagTemplates.deleteTemplate,
                cls: "tag-template-btn mod-warning",
            });
            deleteBtn.addEventListener("click", () => {
                this.deleteTemplate(template, listEl).catch((error) =>
                    console.error("Template deletion failed:", error),
                );
            });
        }
    }

    private openEditModal(template: TagTemplate | null): void {
        const existingNames = this.plugin.settings.tagTemplates.map(
            (t) => t.name,
        );

        new TagTemplateEditModal(
            this.plugin.app,
            this.plugin.t,
            this.plugin.settings.tagFormat,
            existingNames,
            template,
            (savedTemplate) => {
                const templates = this.plugin.settings.tagTemplates;
                const existingIndex = templates.findIndex(
                    (t) => t.id === savedTemplate.id,
                );

                if (existingIndex >= 0) {
                    templates[existingIndex] = savedTemplate;
                } else {
                    templates.push(savedTemplate);
                }

                this.plugin
                    .saveSettings()
                    .then(() => {
                        // Re-render the list
                        const listEl = this.containerEl.querySelector(
                            ".tag-templates-list",
                        );
                        if (listEl) {
                            this.renderTemplatesList(listEl as HTMLElement);
                        }
                    })
                    .catch((error) =>
                        console.error("Saving tag templates failed:", error),
                    );
            },
        ).open();
    }

    private async deleteTemplate(
        template: TagTemplate,
        listEl: HTMLElement,
    ): Promise<void> {
        const confirmMsg = this.plugin.t.tagTemplates.deleteConfirm.replace(
            "{name}",
            template.name,
        );
        const confirmed = await this.plugin.showConfirmationDialog(confirmMsg);

        if (!confirmed) return;

        this.plugin.settings.tagTemplates =
            this.plugin.settings.tagTemplates.filter(
                (t) => t.id !== template.id,
            );
        await this.plugin.saveSettings();
        this.renderTemplatesList(listEl);
    }
}
