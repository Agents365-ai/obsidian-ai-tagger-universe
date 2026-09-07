import {
    type App,
    ItemView,
    Notice,
    type WorkspaceLeaf,
    setIcon,
} from "obsidian";
import {
    type AnalyticsData,
    TagAnalyticsManager,
    type TagStats,
} from "../../utils/tagAnalyticsUtils";
import type { Translations } from "../../i18n/types";

export const TAG_ANALYTICS_VIEW_TYPE = "tag-analytics-view";

type SortField = "name" | "frequency" | "status";
type SortDirection = "asc" | "desc";

export class TagAnalyticsView extends ItemView {
    private analyticsManager: TagAnalyticsManager;
    private t: Translations;
    private cleanup: (() => void)[] = [];
    private metadataDebounceTimer: number | null = null;
    private readonly DEBOUNCE_DELAY = 500;
    private sortField: SortField = "frequency";
    private sortDirection: SortDirection = "desc";

    constructor(
        leaf: WorkspaceLeaf,
        app: App,
        t: Translations,
        analyticsManager?: TagAnalyticsManager,
    ) {
        super(leaf);
        this.analyticsManager =
            analyticsManager || new TagAnalyticsManager(app);
        this.t = t;
    }

    getViewType(): string {
        return TAG_ANALYTICS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.t.tagAnalytics.title;
    }

    getIcon(): string {
        return "bar-chart-2";
    }

    async onOpen(): Promise<void> {
        await this.analyticsManager.buildAnalytics();
        this.render();

        // Register metadata cache listener for real-time updates
        const metadataCacheHandler = this.app.metadataCache.on(
            "changed",
            () => {
                if (this.metadataDebounceTimer) {
                    window.clearTimeout(this.metadataDebounceTimer);
                }
                this.metadataDebounceTimer = window.setTimeout(() => {
                    this.metadataDebounceTimer = null;
                    this.refreshAnalytics().catch((error) =>
                        console.error("Error refreshing tag analytics:", error),
                    );
                }, this.DEBOUNCE_DELAY);
            },
        );

        this.cleanup.push(() => {
            if (this.metadataDebounceTimer) {
                window.clearTimeout(this.metadataDebounceTimer);
            }
            this.app.metadataCache.offref(metadataCacheHandler);
        });
    }

    async onClose(): Promise<void> {
        this.cleanup.forEach((fn) => fn());
        this.cleanup = [];
        this.contentEl.empty();
    }

    private async refreshAnalytics(): Promise<void> {
        await this.analyticsManager.buildAnalytics();
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("tag-analytics-view");

        const data = this.analyticsManager.getAnalyticsData();

        // Header with buttons
        const header = contentEl.createDiv({ cls: "tag-analytics-header" });
        header.createEl("h2", { text: this.t.tagAnalytics.title });

        const btnContainer = header.createDiv({ cls: "tag-analytics-buttons" });
        const refreshBtn = btnContainer.createEl("button", {
            text: this.t.tagAnalytics.refresh,
            cls: "tag-analytics-btn",
        });
        const exportBtn = btnContainer.createEl("button", {
            text: this.t.tagAnalytics.exportCSV,
            cls: "tag-analytics-btn",
        });

        refreshBtn.addEventListener("click", () => {
            this.refreshAnalytics().catch((error) =>
                console.error("Error refreshing tag analytics:", error),
            );
        });

        exportBtn.addEventListener("click", () => this.handleExport());

        contentEl.createEl("p", {
            text: this.t.tagAnalytics.description,
            cls: "tag-analytics-desc",
        });

        // Summary cards
        this.renderSummary(contentEl, data);

        // Tag usage table
        this.renderTagTable(contentEl, data);

        // Health section
        this.renderHealthSection(contentEl, data);
    }

    private renderSummary(container: HTMLElement, data: AnalyticsData): void {
        const summary = container.createDiv({ cls: "tag-analytics-summary" });
        summary.createEl("h3", { text: this.t.tagAnalytics.summary });

        const cards = summary.createDiv({ cls: "tag-analytics-cards" });

        this.createStatCard(
            cards,
            String(data.totalUniqueTags),
            this.t.tagAnalytics.totalUniqueTags,
            "tags",
        );
        this.createStatCard(
            cards,
            String(data.totalTaggedNotes),
            this.t.tagAnalytics.totalTaggedNotes,
            "file-check",
        );
        this.createStatCard(
            cards,
            String(data.averageTagsPerNote),
            this.t.tagAnalytics.averageTagsPerNote,
            "divide",
        );
        this.createStatCard(
            cards,
            String(data.orphanedTagsCount),
            this.t.tagAnalytics.orphanedTags,
            "alert-triangle",
        );
    }

    private createStatCard(
        container: HTMLElement,
        value: string,
        label: string,
        icon: string,
    ): void {
        const card = container.createDiv({ cls: "tag-analytics-stat-card" });
        const iconEl = card.createDiv({ cls: "tag-analytics-stat-icon" });
        setIcon(iconEl, icon);
        card.createDiv({ cls: "tag-analytics-stat-value", text: value });
        card.createDiv({ cls: "tag-analytics-stat-label", text: label });
    }

    private renderTagTable(container: HTMLElement, data: AnalyticsData): void {
        const section = container.createDiv({
            cls: "tag-analytics-table-section",
        });
        section.createEl("h3", { text: this.t.tagAnalytics.tagUsage });

        if (data.tags.length === 0) {
            section.createEl("p", {
                text: this.t.tagAnalytics.noOrphanedTags,
                cls: "tag-analytics-empty",
            });
            return;
        }

        const table = section.createEl("table", { cls: "tag-analytics-table" });
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");

        const headers: { field: SortField; label: string }[] = [
            { field: "name", label: this.t.tagAnalytics.tagName },
            { field: "frequency", label: this.t.tagAnalytics.frequency },
            { field: "status", label: this.t.tagAnalytics.status },
        ];

        headers.forEach(({ field, label }) => {
            const th = headerRow.createEl("th", {
                cls: "tag-analytics-sortable",
            });
            th.createSpan({ text: label });
            if (this.sortField === field) {
                th.createSpan({
                    text: this.sortDirection === "asc" ? " ▲" : " ▼",
                    cls: "sort-indicator",
                });
            }
            th.addEventListener("click", () => this.handleSort(field));
        });

        const tbody = table.createEl("tbody");
        const sortedTags = this.getSortedTags(data.tags);

        sortedTags.forEach((tag) => {
            const row = tbody.createEl("tr");

            const nameCell = row.createEl("td", {
                cls: "tag-analytics-tag-name",
            });
            nameCell.createSpan({ text: `#${tag.name}` });
            nameCell.addEventListener("click", () =>
                this.showNotesWithTag(tag),
            );

            row.createEl("td", { text: String(tag.frequency) });

            const statusCell = row.createEl("td");
            const statusBadge = statusCell.createSpan({
                cls: `tag-analytics-status tag-analytics-status-${tag.status}`,
            });
            statusBadge.textContent = this.getStatusLabel(tag.status);
        });
    }

    private renderHealthSection(
        container: HTMLElement,
        data: AnalyticsData,
    ): void {
        const section = container.createDiv({
            cls: "tag-analytics-health-section",
        });
        section.createEl("h3", { text: this.t.tagAnalytics.health });

        // Orphaned tags
        const orphanedDiv = section.createDiv({
            cls: "tag-analytics-health-item",
        });
        orphanedDiv.createEl("h4", {
            text: this.t.tagAnalytics.orphanedTagsSection,
        });

        const orphanedTags = data.tags.filter((t) => t.status === "orphaned");
        if (orphanedTags.length === 0) {
            orphanedDiv.createEl("p", {
                text: this.t.tagAnalytics.noOrphanedTags,
                cls: "tag-analytics-empty",
            });
        } else {
            const tagList = orphanedDiv.createDiv({
                cls: "tag-analytics-tag-list",
            });
            orphanedTags.slice(0, 20).forEach((tag) => {
                const tagEl = tagList.createSpan({
                    cls: "tag-analytics-orphan-tag",
                });
                tagEl.textContent = `#${tag.name}`;
                tagEl.addEventListener("click", () =>
                    this.showNotesWithTag(tag),
                );
            });
            if (orphanedTags.length > 20) {
                tagList.createSpan({
                    text: `... +${orphanedTags.length - 20} more`,
                    cls: "tag-analytics-more",
                });
            }
        }

        // Untagged notes
        const untaggedDiv = section.createDiv({
            cls: "tag-analytics-health-item",
        });
        untaggedDiv.createEl("h4", {
            text: `${this.t.tagAnalytics.untaggedNotesSection} (${data.untaggedNotes.length})`,
        });

        if (data.untaggedNotes.length === 0) {
            untaggedDiv.createEl("p", {
                text: this.t.tagAnalytics.noUntaggedNotes,
                cls: "tag-analytics-empty",
            });
        } else {
            const noteList = untaggedDiv.createDiv({
                cls: "tag-analytics-note-list",
            });
            data.untaggedNotes.slice(0, 10).forEach((path) => {
                const noteEl = noteList.createDiv({
                    cls: "tag-analytics-note-item",
                });
                const fileName = path.split("/").pop() || path;
                noteEl.textContent = fileName.replace(".md", "");
                noteEl.addEventListener("click", () => {
                    this.app.workspace
                        .openLinkText(path, "", false)
                        .catch((error) =>
                            console.error("Error opening note:", error),
                        );
                });
            });
            if (data.untaggedNotes.length > 10) {
                noteList.createSpan({
                    text: `... +${data.untaggedNotes.length - 10} more`,
                    cls: "tag-analytics-more",
                });
            }
        }
    }

    private getSortedTags(tags: TagStats[]): TagStats[] {
        const sorted = [...tags];
        sorted.sort((a, b) => {
            let cmp = 0;
            switch (this.sortField) {
                case "name":
                    cmp = a.name.localeCompare(b.name);
                    break;
                case "frequency":
                    cmp = a.frequency - b.frequency;
                    break;
                case "status": {
                    const order = { healthy: 0, "low-use": 1, orphaned: 2 };
                    cmp = order[a.status] - order[b.status];
                    break;
                }
            }
            return this.sortDirection === "asc" ? cmp : -cmp;
        });
        return sorted;
    }

    private handleSort(field: SortField): void {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
        } else {
            this.sortField = field;
            this.sortDirection = field === "name" ? "asc" : "desc";
        }
        this.render();
    }

    private getStatusLabel(status: "healthy" | "low-use" | "orphaned"): string {
        switch (status) {
            case "healthy":
                return this.t.tagAnalytics.statusHealthy;
            case "low-use":
                return this.t.tagAnalytics.statusLowUse;
            case "orphaned":
                return this.t.tagAnalytics.statusOrphaned;
        }
    }

    private showNotesWithTag(tag: TagStats): void {
        const notes = tag.notes;
        if (notes.length === 0) return;

        if (notes.length === 1) {
            this.app.workspace
                .openLinkText(notes[0], "", false)
                .catch((error) => console.error("Error opening note:", error));
            return;
        }

        // Show a list modal for multiple notes
        const modal = new TagNotesModal(this.app, tag.name, notes, this.t);
        modal.open();
    }

    private handleExport(): void {
        const csv = this.analyticsManager.exportToCSV();
        if (!csv) return;

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = createEl("a");
        a.href = url;
        a.download = `tag-analytics-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        new Notice(this.t.tagAnalytics.exportSuccess);
    }
}

// Simple modal to show notes with a tag
import { Modal } from "obsidian";

class TagNotesModal extends Modal {
    private tagName: string;
    private notes: string[];
    private t: Translations;

    constructor(app: App, tagName: string, notes: string[], t: Translations) {
        super(app);
        this.tagName = tagName;
        this.notes = notes;
        this.t = t;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("tag-analytics-modal");

        contentEl.createEl("h3", {
            text: `${this.t.tagAnalytics.notesWithTag}: #${this.tagName}`,
        });

        const list = contentEl.createDiv({ cls: "tag-analytics-modal-list" });
        this.notes.forEach((path) => {
            const item = list.createDiv({ cls: "tag-analytics-modal-item" });
            const fileName = path.split("/").pop() || path;
            item.textContent = fileName.replace(".md", "");
            item.addEventListener("click", () => {
                this.app.workspace
                    .openLinkText(path, "", false)
                    .catch((error) =>
                        console.error("Error opening note:", error),
                    );
                this.close();
            });
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
