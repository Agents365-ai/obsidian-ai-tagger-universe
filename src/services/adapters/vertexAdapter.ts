import { BaseAdapter } from "./baseAdapter";
import type { BaseResponse, AdapterConfig } from "./types";
import * as endpoints from "./cloudEndpoints.json";
import { SYSTEM_PROMPT } from "../../utils/constants";

export class VertexAdapter extends BaseAdapter {
    private readonly defaultConfig = {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.8,
        topK: 40,
    };

    constructor(config: AdapterConfig) {
        super({
            ...config,
            endpoint: config.endpoint || endpoints.vertex,
        });
        this.provider = {
            name: "vertex",
            requestFormat: {
                url: "/predict",
                headers: {},
                body: {
                    instances: [
                        {
                            messages: [],
                        },
                    ],
                    parameters: this.defaultConfig,
                },
            },
            responseFormat: {
                path: ["predictions", "0", "candidates", "0", "content"],
                errorPath: ["error", "message"],
            },
        };
    }

    public formatRequest(prompt: string): Record<string, unknown> {
        const messages = [
            {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: prompt,
            },
        ];
        const temperature =
            this.getTemperatureOverride() ?? this.defaultConfig.temperature;
        const vertexParameters = {
            ...this.defaultConfig,
            temperature,
        };

        // Use basic formatting then add Vertex AI specific fields
        const baseRequest = super.formatRequest(prompt);

        return {
            ...baseRequest,
            model: this.config.modelName || "gemini-pro",
            maxTokens: this.defaultConfig.maxOutputTokens,
            ...this.defaultConfig,
            temperature,
            _vertex: {
                instances: [
                    {
                        messages: messages.map((m) => ({
                            author: m.role,
                            content: m.content,
                        })),
                    },
                ],
                parameters: vertexParameters,
            },
        };
    }

    public parseResponse(response: unknown): BaseResponse {
        try {
            const content = this.getStringPath(response, [
                "predictions",
                0,
                "candidates",
                0,
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
            throw new Error(`Failed to parse Vertex AI response: ${message}`);
        }
    }

    public validateConfig(): string | null {
        if (!this.config.apiKey) {
            return "API key is required for Vertex AI";
        }
        if (!this.config.endpoint) {
            return "Endpoint is required for Vertex AI";
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
            throw new Error("API key is required for Vertex AI");
        }
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            "x-goog-user-project": this.extractProjectId(),
            "x-goog-api-key": this.config.apiKey,
        };
    }

    private extractProjectId(): string {
        const match = this.config.endpoint?.match(/projects\/([^/]+)/);
        return match?.[1] || "";
    }
}
