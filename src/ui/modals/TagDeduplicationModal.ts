import { App, Modal, Notice } from "obsidian";
import { Translations } from "../../i18n/types";
import {
    TagDeduplicationUtils,
    SimilarTagGroup,
    SimilarityType,
} from "../../utils/tagDeduplicationUtils";
import { TagUtils } from "../../utils/tagUtils";
import { TagFormat } from "../../core/settings";

export class TagDeduplicationModal extends Modal {
    private t: Translations;
    private tagFormat: TagFormat;
    private deduplicationUtils: TagDeduplicationUtils;
    private groups: SimilarTagGroup[] = [];
    private currentIndex = 0;

    constructor(app: App, t: Translations, tagFormat: TagFormat) {
        super(app);
        this.t = t;
        this.tagFormat = tagFormat;
        this.deduplicationUtils = new TagDeduplicationUtils(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("tag-deduplication-modal");

        contentEl.createEl("h3", { text: this.t.tagDeduplication.title });
        contentEl.createEl("p", {
            text: this.t.tagDeduplication.description,
            cls: "tag-dedup-description",
        });

        const statusEl = contentEl.createDiv({ cls: "tag-dedup-status" });
        statusEl.setText(this.t.tagDeduplication.scanning);

        this.scanAndRender().catch((error) => {
            console.error("Error scanning for duplicate tags:", error);
        });
    }

    private async scanAndRender(): Promise<void> {
        const { contentEl } = this;
        const statusEl = contentEl.querySelector(
            ".tag-dedup-status",
        ) as HTMLElement;

        // Scan for similar tags
        this.groups = await this.deduplicationUtils.findSimilarTags();

        if (this.groups.length === 0) {
            statusEl.empty();
            statusEl.addClass("tag-dedup-success");
            statusEl.setText(this.t.tagDeduplication.noDuplicates);

            const closeBtn = contentEl.createEl("button", {
                text: this.t.modals.confirm,
                cls: "mod-cta tag-dedup-close-btn",
            });
            closeBtn.addEventListener("click", () => this.close());
            return;
        }

        statusEl.setText(
            this.t.tagDeduplication.duplicatesFound.replace(
                "{count}",
                String(this.groups.length),
            ),
        );

        this.renderCurrentGroup();
    }

    private renderCurrentGroup(): void {
        const existingContent =
            this.contentEl.querySelector(".tag-dedup-content");
        if (existingContent) existingContent.remove();

        const existingButtons =
            this.contentEl.querySelector(".tag-dedup-buttons");
        if (existingButtons) existingButtons.remove();

        if (this.currentIndex >= this.groups.length) {
            this.showCompletion();
            return;
        }

        const group = this.groups[this.currentIndex];
        const contentEl = this.contentEl.createDiv({
            cls: "tag-dedup-content",
        });

        // Progress indicator
        const progressEl = contentEl.createDiv({ cls: "tag-dedup-progress" });
        progressEl.setText(`${this.currentIndex + 1} / ${this.groups.length}`);

        // Similarity type badge
        const typeEl = contentEl.createDiv({ cls: "tag-dedup-type" });
        typeEl.createSpan({
            text: this.t.tagDeduplication.similarityType + ": ",
        });
        typeEl.createSpan({
            text: this.getSimilarityTypeLabel(group.similarityType),
            cls: `tag-dedup-type-badge tag-dedup-type-${group.similarityType}`,
        });

        // Tags comparison
        const comparisonEl = contentEl.createDiv({
            cls: "tag-dedup-comparison",
        });

        for (const tagInfo of group.tags) {
            const tagEl = comparisonEl.createDiv({
                cls: `tag-dedup-tag ${tagInfo.tag === group.suggestedTarget ? "is-suggested" : ""}`,
            });

            const radioId = `tag-${tagInfo.tag.replace(/[^a-z0-9]/gi, "-")}`;
            const radio = tagEl.createEl("input", {
                type: "radio",
                attr: {
                    name: "target-tag",
                    id: radioId,
                    value: tagInfo.tag,
                },
            });
            if (tagInfo.tag === group.suggestedTarget) {
                radio.checked = true;
            }

            const label = tagEl.createEl("label", { attr: { for: radioId } });
            label.createSpan({
                text: `#${tagInfo.tag}`,
                cls: "tag-dedup-tag-name",
            });
            label.createSpan({
                text: this.t.tagDeduplication.usageCount.replace(
                    "{count}",
                    String(tagInfo.count),
                ),
                cls: "tag-dedup-tag-count",
            });

            if (tagInfo.tag === group.suggestedTarget) {
                label.createSpan({
                    text: ` (${this.t.tagDeduplication.keepTag})`,
                    cls: "tag-dedup-suggested",
                });
            }
        }

        // Action buttons
        const buttonsEl = this.contentEl.createDiv({
            cls: "tag-dedup-buttons",
        });

        const skipBtn = buttonsEl.createEl("button", {
            text: this.t.tagDeduplication.skip,
        });
        skipBtn.addEventListener("click", () => {
            this.currentIndex++;
            this.renderCurrentGroup();
        });

        const mergeBtn = buttonsEl.createEl("button", {
            text: this.t.tagDeduplication.merge,
            cls: "mod-cta",
        });
        mergeBtn.addEventListener("click", () => {
            this.mergeCurrentGroup().catch((error) =>
                console.error("Tag merge failed:", error),
            );
        });

        if (this.groups.length > 1 && this.currentIndex === 0) {
            const mergeAllBtn = buttonsEl.createEl("button", {
                text: this.t.tagDeduplication.mergeAll,
                cls: "mod-warning",
            });
            mergeAllBtn.addEventListener("click", () => {
                this.mergeAll().catch((error) =>
                    console.error("Merge-all failed:", error),
                );
            });
        }
    }

    private getSimilarityTypeLabel(type: SimilarityType): string {
        switch (type) {
            case "abbreviation":
                return this.t.tagDeduplication.typeAbbreviation;
            case "case":
                return this.t.tagDeduplication.typeCaseDiff;
            case "plural":
                return this.t.tagDeduplication.typePlural;
            case "similar":
                return this.t.tagDeduplication.typeSimilar;
        }
    }

    private async mergeCurrentGroup(): Promise<void> {
        const group = this.groups[this.currentIndex];
        const selectedRadio = this.contentEl.querySelector(
            'input[name="target-tag"]:checked',
        ) as HTMLInputElement;
        const targetTag = selectedRadio?.value || group.suggestedTarget;

        const sourceTags = group.tags.filter((t) => t.tag !== targetTag);

        for (const sourceInfo of sourceTags) {
            const result = await TagUtils.renameTagInVault(
                this.app,
                sourceInfo.tag,
                targetTag,
                undefined,
                this.tagFormat,
            );

            if (result.success) {
                const message = this.t.tagDeduplication.mergeSuccess
                    .replace("{source}", sourceInfo.tag)
                    .replace("{target}", targetTag)
                    .replace("{count}", String(result.affectedFiles));
                new Notice(message);
            }
        }

        this.currentIndex++;
        this.renderCurrentGroup();
    }

    private async mergeAll(): Promise<void> {
        new Notice(this.t.tagDeduplication.merging);

        for (let i = this.currentIndex; i < this.groups.length; i++) {
            const group = this.groups[i];
            const targetTag = group.suggestedTarget;
            const sourceTags = group.tags.filter((t) => t.tag !== targetTag);

            for (const sourceInfo of sourceTags) {
                await TagUtils.renameTagInVault(
                    this.app,
                    sourceInfo.tag,
                    targetTag,
                    undefined,
                    this.tagFormat,
                );
            }
        }

        this.currentIndex = this.groups.length;
        this.renderCurrentGroup();
    }

    private showCompletion(): void {
        const existingContent =
            this.contentEl.querySelector(".tag-dedup-content");
        if (existingContent) existingContent.remove();

        const existingButtons =
            this.contentEl.querySelector(".tag-dedup-buttons");
        if (existingButtons) existingButtons.remove();

        const statusEl = this.contentEl.querySelector(".tag-dedup-status");
        if (statusEl) {
            statusEl.empty();
            statusEl.addClass("tag-dedup-success");
            statusEl.setText(this.t.tagDeduplication.noDuplicates);
        }

        const closeBtn = this.contentEl.createEl("button", {
            text: this.t.modals.confirm,
            cls: "mod-cta tag-dedup-close-btn",
        });
        closeBtn.addEventListener("click", () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
