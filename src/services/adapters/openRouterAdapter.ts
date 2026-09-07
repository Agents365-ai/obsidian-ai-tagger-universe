import { BaseAdapter } from "./baseAdapter";
import type { BaseResponse, AdapterConfig } from "./types";
import * as endpoints from "./cloudEndpoints.json";

export class OpenRouterAdapter extends BaseAdapter {
    constructor(config: AdapterConfig) {
        super({
            ...config,
            endpoint: config.endpoint || endpoints.openrouter,
        });
        this.provider = {
            name: "openrouter",
            requestFormat: {
                body: {
                    model: this.config.modelName,
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

            const jsonContent = this.extractJsonFromContent(content);
            const matchedTags = this.getArrayField(jsonContent, "matchedTags");
            const newTags = this.getArrayField(jsonContent, "newTags");

            if (!matchedTags || !newTags) {
                throw new Error(
                    "Invalid response format: missing required arrays",
                );
            }

            return {
                text: content,
                matchedExistingTags: matchedTags,
                suggestedTags: newTags,
            };
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to parse OpenRouter response: ${message}`);
        }
    }

    public validateConfig(): string | null {
        if (!this.config.apiKey) {
            return "API key is required for OpenRouter";
        }
        if (!this.config.endpoint) {
            return "Endpoint is required for OpenRouter";
        }
        if (!this.config.modelName) {
            return "Model name is required for OpenRouter";
        }
        return null;
    }

    public extractError(error: unknown): string {
        return this.getErrorMessage(error, [
            ["error", "message"],
            ["response", "data", "error", "message"],
            ["message"],
        ]);
    }

    public getHeaders(): Record<string, string> {
        if (!this.config.apiKey) {
            throw new Error("API key is required for OpenRouter");
        }
        return {
            ...super.getHeaders(),
            Authorization: `Bearer ${this.config.apiKey}`,
            "HTTP-Referer": "https://github.com/obsidian-ai-tagger",
            "X-Title": "Obsidian AI Tagger",
        };
    }
}
