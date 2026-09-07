import type { App, TFile } from "obsidian";
import { TagUtils } from "./tagUtils";

export type SimilarityType = "abbreviation" | "case" | "plural" | "similar";

export interface TagInfo {
    tag: string;
    count: number;
    files: TFile[];
}

export interface SimilarTagGroup {
    tags: TagInfo[];
    similarityType: SimilarityType;
    suggestedTarget: string;
}

// Common abbreviation mappings
const ABBREVIATIONS: Record<string, string[]> = {
    "machine-learning": ["ml"],
    "artificial-intelligence": ["ai"],
    javascript: ["js"],
    typescript: ["ts"],
    python: ["py"],
    database: ["db"],
    application: ["app"],
    configuration: ["config", "cfg"],
    development: ["dev"],
    production: ["prod"],
    environment: ["env"],
    documentation: ["docs", "doc"],
    authentication: ["auth"],
    authorization: ["authz"],
    repository: ["repo"],
    information: ["info"],
    programming: ["prog"],
    infrastructure: ["infra"],
    kubernetes: ["k8s"],
    "continuous-integration": ["ci"],
    "continuous-deployment": ["cd"],
    "user-interface": ["ui"],
    "user-experience": ["ux"],
    "application-programming-interface": ["api"],
    "natural-language-processing": ["nlp"],
    "deep-learning": ["dl"],
    "reinforcement-learning": ["rl"],
    "operating-system": ["os"],
    "object-oriented-programming": ["oop"],
    "functional-programming": ["fp"],
};

export class TagDeduplicationUtils {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async findSimilarTags(): Promise<SimilarTagGroup[]> {
        const tagInfoMap = this.buildTagInfoMap();
        const tags = Array.from(tagInfoMap.keys());
        const groups: SimilarTagGroup[] = [];
        const processed = new Set<string>();

        for (let i = 0; i < tags.length; i++) {
            const tag1 = tags[i];
            if (processed.has(tag1)) continue;

            for (let j = i + 1; j < tags.length; j++) {
                const tag2 = tags[j];
                if (processed.has(tag2)) continue;

                const similarity = this.checkSimilarity(tag1, tag2);
                if (similarity) {
                    const info1 = tagInfoMap.get(tag1)!;
                    const info2 = tagInfoMap.get(tag2)!;

                    // Suggest the more frequently used tag as target
                    const suggestedTarget =
                        info1.count >= info2.count ? tag1 : tag2;

                    groups.push({
                        tags: [info1, info2],
                        similarityType: similarity,
                        suggestedTarget,
                    });

                    processed.add(tag1);
                    processed.add(tag2);
                    break;
                }
            }
        }

        // Sort by total usage count (most used first)
        groups.sort((a, b) => {
            const countA = a.tags.reduce((sum, t) => sum + t.count, 0);
            const countB = b.tags.reduce((sum, t) => sum + t.count, 0);
            return countB - countA;
        });

        return groups;
    }

    private buildTagInfoMap(): Map<string, TagInfo> {
        const map = new Map<string, TagInfo>();
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;

            const tags = TagUtils.getExistingTags(cache.frontmatter);
            for (const tag of tags) {
                const existing = map.get(tag);
                if (existing) {
                    existing.count++;
                    existing.files.push(file);
                } else {
                    map.set(tag, { tag, count: 1, files: [file] });
                }
            }
        }

        return map;
    }

    private checkSimilarity(tag1: string, tag2: string): SimilarityType | null {
        const norm1 = this.normalize(tag1);
        const norm2 = this.normalize(tag2);

        // Case difference (e.g., "JavaScript" vs "javascript")
        if (norm1 === norm2 && tag1 !== tag2) {
            return "case";
        }

        // Abbreviation check
        if (
            this.isAbbreviation(tag1, tag2) ||
            this.isAbbreviation(tag2, tag1)
        ) {
            return "abbreviation";
        }

        // Plural form check (e.g., "tag" vs "tags")
        if (this.isPlural(tag1, tag2) || this.isPlural(tag2, tag1)) {
            return "plural";
        }

        // Levenshtein distance for similar spelling
        const distance = this.levenshteinDistance(norm1, norm2);
        const maxLen = Math.max(norm1.length, norm2.length);
        const similarity = 1 - distance / maxLen;

        // Consider similar if >= 80% similar and at least 4 chars
        if (similarity >= 0.8 && maxLen >= 4) {
            return "similar";
        }

        return null;
    }

    private normalize(tag: string): string {
        return tag.toLowerCase().replace(/[-_]/g, "");
    }

    private isAbbreviation(full: string, abbr: string): boolean {
        const normFull = this.normalize(full);
        const normAbbr = this.normalize(abbr);

        // Check predefined abbreviations
        for (const [fullForm, abbreviations] of Object.entries(ABBREVIATIONS)) {
            const normFullForm = this.normalize(fullForm);
            if (normFull === normFullForm && abbreviations.includes(normAbbr)) {
                return true;
            }
        }

        // Check if abbr could be first letters of hyphenated words
        const parts = full.toLowerCase().split(/[-_]/);
        if (parts.length > 1) {
            const initials = parts.map((p) => p[0]).join("");
            if (initials === normAbbr) {
                return true;
            }
        }

        return false;
    }

    private isPlural(singular: string, plural: string): boolean {
        const normSingular = this.normalize(singular);
        const normPlural = this.normalize(plural);

        // Simple plural rules
        if (normPlural === normSingular + "s") return true;
        if (normPlural === normSingular + "es") return true;
        if (
            normSingular.endsWith("y") &&
            normPlural === normSingular.slice(0, -1) + "ies"
        )
            return true;

        return false;
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const m = str1.length;
        const n = str2.length;
        const dp: number[][] = Array.from({ length: m + 1 }, () =>
            Array.from({ length: n + 1 }, () => 0),
        );

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] =
                        1 +
                        Math.min(
                            dp[i - 1][j], // deletion
                            dp[i][j - 1], // insertion
                            dp[i - 1][j - 1], // substitution
                        );
                }
            }
        }

        return dp[m][n];
    }
}
