import { BaseAdapter } from "./baseAdapter";
import type { BaseResponse, AdapterConfig } from "./types";
import { SYSTEM_PROMPT } from "../../utils/constants";

export class OpenAICompatibleAdapter extends BaseAdapter {
    constructor(config: AdapterConfig) {
        super(config);
        this.provider = {
            name: "openai-compatible",
            requestFormat: {
                url: config.endpoint || "/v1/chat/completions",
                headers: {},
                body: {
                    model: this.config.modelName,
                    messages: [],
                },
            },
            responseFormat: {
                path: ["choices", "0", "message", "content"],
                errorPath: ["error", "message"],
            },
        };
    }

    public formatRequest(prompt: string): Record<string, unknown> {
        const body: Record<string, unknown> = {
            model: this.config.modelName,
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT,
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        };

        // Add any additional parameters from config
        for (const [key, value] of Object.entries(this.config)) {
            if (
                [
                    "endpoint",
                    "apiKey",
                    "modelName",
                    "llmTemperatureOverride",
                ].includes(key)
            ) {
                continue;
            }
            if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
            ) {
                body[key] = value;
            }
        }

        const temperature = this.getTemperatureOverride();
        if (temperature !== null) {
            body.temperature = temperature;
        }

        return body;
    }

    public parseResponse(response: unknown): BaseResponse {
        try {
            let content = this.getStringPath(response, [
                "choices",
                0,
                "message",
                "content",
            ]);
            if (!content) {
                // Some OpenAI-compatible APIs might use 'text' instead of 'message.content'
                content = this.getStringPath(response, ["choices", 0, "text"]);
            }
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
            throw new Error(`Failed to parse response: ${message}`);
        }
    }

    public validateConfig(): string | null {
        if (!this.config.apiKey) {
            return "API key is required";
        }
        if (!this.config.modelName) {
            return "Model name is required";
        }
        if (!this.config.endpoint) {
            return "Endpoint is required";
        }
        return null;
    }

    public extractError(error: unknown): string {
        return this.getErrorMessage(error, [
            ["response", "data", "error", "message"],
            ["response", "data", "message"],
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
