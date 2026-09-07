import { type App, TFile, parseYaml, stringifyYaml } from "obsidian";
import { TagUtils } from "./tagUtils";
import type { TagFormat } from "../core/settings";

export interface TagExportEntry {
    path: string;
    tags: string[];
}

export interface TagExportData {
    version: string;
    exportedAt: string;
    totalFiles: number;
    totalTags: number;
    entries: TagExportEntry[];
}

export class TagImportExport {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    // Export all tags from vault to JSON format
    async exportToJSON(files?: TFile[]): Promise<string> {
        const entries = await this.collectTagData(files);
        const uniqueTags = new Set<string>();
        entries.forEach((e) => e.tags.forEach((t) => uniqueTags.add(t)));

        const data: TagExportData = {
            version: "1.0",
            exportedAt: new Date().toISOString(),
            totalFiles: entries.length,
            totalTags: uniqueTags.size,
            entries,
        };

        return JSON.stringify(data, null, 2);
    }

    // Export all tags from vault to CSV format
    async exportToCSV(files?: TFile[]): Promise<string> {
        const entries = await this.collectTagData(files);

        const headers = ["File Path", "Tags"];
        const rows = entries.map((entry) => [
            entry.path,
            entry.tags.join("; "),
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((row) =>
                row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
            ),
        ].join("\n");

        return csvContent;
    }

    // Collect tag data from files
    private async collectTagData(files?: TFile[]): Promise<TagExportEntry[]> {
        const markdownFiles = files || this.app.vault.getMarkdownFiles();
        const entries: TagExportEntry[] = [];

        for (const file of markdownFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            const tags = cache?.frontmatter
                ? TagUtils.getExistingTags(cache.frontmatter)
                : [];

            if (tags.length > 0) {
                entries.push({
                    path: file.path,
                    tags: tags.map((t) =>
                        t.startsWith("#") ? t.substring(1) : t,
                    ),
                });
            }
        }

        return entries.sort((a, b) => a.path.localeCompare(b.path));
    }

    // Import tags from JSON
    async importFromJSON(
        jsonContent: string,
        mode: "merge" | "replace",
        tagFormat: TagFormat,
    ): Promise<{ success: number; failed: number; skipped: number }> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonContent);
        } catch {
            throw new Error("Invalid JSON format");
        }

        if (typeof parsed !== "object" || parsed === null) {
            throw new Error("Invalid tag export format");
        }
        const data = parsed as TagExportData;

        if (!data.entries || !Array.isArray(data.entries)) {
            throw new Error("Invalid tag export format");
        }

        return this.applyTags(data.entries, mode, tagFormat);
    }

    // Import tags from CSV
    async importFromCSV(
        csvContent: string,
        mode: "merge" | "replace",
        tagFormat: TagFormat,
    ): Promise<{ success: number; failed: number; skipped: number }> {
        const lines = csvContent.split("\n").filter((l) => l.trim());
        if (lines.length < 2) {
            throw new Error("CSV file is empty or has no data rows");
        }

        // Skip header row
        const entries: TagExportEntry[] = [];
        for (let i = 1; i < lines.length; i++) {
            const parsed = this.parseCSVLine(lines[i]);
            if (parsed.length >= 2) {
                const path = parsed[0];
                const tagsStr = parsed[1];
                const tags = tagsStr
                    .split(/[;,]/)
                    .map((t) => t.trim())
                    .filter((t) => t);
                if (path && tags.length > 0) {
                    entries.push({ path, tags });
                }
            }
        }

        return this.applyTags(entries, mode, tagFormat);
    }

    // Parse a single CSV line handling quoted fields
    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === "," && !inQuotes) {
                result.push(current);
                current = "";
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    // Apply tags to files
    private async applyTags(
        entries: TagExportEntry[],
        mode: "merge" | "replace",
        tagFormat: TagFormat,
    ): Promise<{ success: number; failed: number; skipped: number }> {
        let success = 0;
        let failed = 0;
        let skipped = 0;

        for (const entry of entries) {
            const file = this.app.vault.getAbstractFileByPath(entry.path);
            if (!file || !(file instanceof TFile)) {
                skipped++;
                continue;
            }

            try {
                const content = await this.app.vault.read(file);
                const cache = this.app.metadataCache.getFileCache(file);

                let newTags: string[];
                if (mode === "merge") {
                    const existingTags = cache?.frontmatter
                        ? TagUtils.getExistingTags(cache.frontmatter)
                        : [];
                    const combined = [...existingTags, ...entry.tags];
                    newTags = [
                        ...new Set(
                            combined
                                .map(
                                    (t) =>
                                        TagUtils.formatTags(
                                            [t],
                                            false,
                                            tagFormat,
                                        )[0],
                                )
                                .filter(Boolean),
                        ),
                    ];
                } else {
                    newTags = TagUtils.formatTags(entry.tags, false, tagFormat);
                }

                // Update frontmatter
                const frontmatterPosition = cache?.frontmatterPosition;
                let newContent: string;

                if (frontmatterPosition) {
                    const frontmatterText = content.substring(
                        frontmatterPosition.start.offset + 4,
                        frontmatterPosition.end.offset - 4,
                    );
                    const parsed: unknown = parseYaml(frontmatterText) ?? {};
                    if (typeof parsed !== "object" || Array.isArray(parsed)) {
                        throw new Error("Frontmatter must be a YAML mapping");
                    }
                    const frontmatter = parsed as Record<string, unknown>;
                    frontmatter.tags = newTags;
                    const newFrontmatter = stringifyYaml(frontmatter).trim();
                    newContent =
                        "---\n" +
                        newFrontmatter +
                        "\n---" +
                        content.substring(frontmatterPosition.end.offset);
                } else {
                    // No frontmatter, create one
                    const frontmatter = { tags: newTags };
                    const newFrontmatter = stringifyYaml(frontmatter).trim();
                    newContent = "---\n" + newFrontmatter + "\n---\n" + content;
                }

                if (newContent === content) {
                    skipped++;
                } else {
                    await this.app.vault.modify(file, newContent);
                    success++;
                }
            } catch {
                failed++;
            }
        }

        // Small delay to allow file system to settle
        if (success > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 300));
        }

        return { success, failed, skipped };
    }

    // Download helper for browser
    downloadFile(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = createEl("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
