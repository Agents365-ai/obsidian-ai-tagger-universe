import { BaseAdapter } from "./baseAdapter";
import type { BaseResponse, AdapterConfig, ParsedJsonValue } from "./types";
import * as endpoints from "./cloudEndpoints.json";

export class AliyunAdapter extends BaseAdapter {
    constructor(config: AdapterConfig) {
        super({
            ...config,
            endpoint: config.endpoint || endpoints.aliyun,
            modelName: config.modelName || "qwen-max",
        });
        this.provider = {
            name: "aliyun",
            requestFormat: {
                body: {
                    model: this.config.modelName || "qwen-max",
                },
            },
            responseFormat: {
                path: ["choices", "0", "message", "content"],
                errorPath: ["error", "message"],
            },
        };
    }

    public parseResponse(response: unknown): BaseResponse {
        try {
            const content = this.getStringPath(response, [
                "choices",
                0,
                "message",
                "content",
            ]);
            if (!content) {
                throw new Error("Invalid response format: missing content");
            }

            // Try to extract JSON from the content
            let jsonContent: ParsedJsonValue | undefined;
            try {
                jsonContent = this.extractJsonFromContent(content);
            } catch {
                // Fallback: try to parse the content directly if it might be JSON already
                const trimmed = content.trim();
                if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                    try {
                        jsonContent = JSON.parse(trimmed) as ParsedJsonValue;
                    } catch {
                        // Fall through to hashtag extraction
                    }
                }

                // If still no valid JSON, try to extract tags manually
                if (!jsonContent) {
                    // Extract hashtags from the content
                    const hashtagRegex = /#[\p{L}\p{N}-]+/gu;
                    const hashtags = content.match(hashtagRegex) || [];

                    return {
                        text: content,
                        matchedExistingTags: [],
                        suggestedTags: hashtags,
                    };
                }
            }

            // Check if the expected arrays exist
            const matchedTags = this.getArrayField(jsonContent, "matchedTags");
            const newTags = this.getArrayField(jsonContent, "newTags");
            if (matchedTags === null && newTags === null) {
                // Try alternative field names that might be used
                const altMatchedTags =
                    this.getArrayField(jsonContent, "matchedExistingTags") ??
                    this.getArrayField(jsonContent, "existingTags") ??
                    [];
                const altNewTags =
                    this.getArrayField(jsonContent, "suggestedTags") ??
                    this.getArrayField(jsonContent, "generatedTags") ??
                    [];

                if (altMatchedTags.length > 0 || altNewTags.length > 0) {
                    return {
                        text: content,
                        matchedExistingTags: altMatchedTags,
                        suggestedTags: altNewTags,
                    };
                }

                // If we have a tags array but not separated into matched/new
                const tags = this.getArrayField(jsonContent, "tags");
                if (tags) {
                    return {
                        text: content,
                        matchedExistingTags: [],
                        suggestedTags: tags,
                    };
                }

                throw new Error(
                    "Invalid response format: missing required arrays",
                );
            }

            return {
                text: content,
                matchedExistingTags: matchedTags ?? [],
                suggestedTags: newTags ?? [],
            };
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to parse Aliyun response: ${message}`);
        }
    }

    public validateConfig(): string | null {
        if (!this.config.apiKey) {
            return "API key is required for Aliyun";
        }
        if (!this.config.endpoint) {
            return "Endpoint is required for Aliyun";
        }
        return null;
    }

    public extractError(error: unknown): string {
        return this.getErrorMessage(error, [
            ["response", "data", "error", "message"],
            ["message"],
        ]);
    }

    public getHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            ...(this.provider?.requestFormat.headers || {}),
        };
    }
}
