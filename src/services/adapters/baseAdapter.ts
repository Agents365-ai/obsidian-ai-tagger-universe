import { BaseLLMService } from "../baseService";
import type {
    AdapterConfig,
    LLMServiceProvider,
    ParsedJsonValue,
} from "./types";
import { SYSTEM_PROMPT } from "../../utils/constants";
import { TaggingMode } from "../prompts/types";

export abstract class BaseAdapter extends BaseLLMService {
    protected config: AdapterConfig;
    protected provider: LLMServiceProvider | null = null;

    protected getTemperatureOverride(): number | null {
        const value = this.config.llmTemperatureOverride;
        if (typeof value !== "number" || !Number.isFinite(value)) {
            return null;
        }
        return value;
    }

    /**
     * Narrows an unknown value to a record (objects and arrays pass, matching
     * the tolerant property access used throughout the adapters), or null.
     */
    protected asRecord(value: unknown): Record<string, unknown> | null {
        return value !== null && typeof value === "object"
            ? (value as Record<string, unknown>)
            : null;
    }

    protected applyTemperatureOverride(body: Record<string, unknown>): void {
        const override = this.getTemperatureOverride();
        if (override === null) {
            return;
        }

        // Common OpenAI-compatible providers
        body.temperature = override;

        // Vertex AI style: { parameters: { temperature } } or { _vertex: { parameters: { temperature } } }
        const parameters = this.asRecord(body.parameters);
        if (parameters) {
            parameters.temperature = override;
        }
        const vertex = this.asRecord(body._vertex);
        if (vertex) {
            const vertexParameters = this.asRecord(vertex.parameters);
            if (vertexParameters) {
                vertexParameters.temperature = override;
            }
        }

        // AWS Bedrock Titan style: { textGenerationConfig: { temperature } }
        const textGenerationConfig = this.asRecord(body.textGenerationConfig);
        if (textGenerationConfig) {
            textGenerationConfig.temperature = override;
        }

        // Gemini style (non-OpenAI endpoints): { generationConfig: { temperature } }
        const generationConfig = this.asRecord(body.generationConfig);
        if (generationConfig) {
            generationConfig.temperature = override;
        }
    }

    /**
     * Reads a nested value from an unknown response payload along a path,
     * returning undefined when any intermediate step is not an object.
     */
    protected getPathValue(
        source: unknown,
        path: (string | number)[],
    ): ParsedJsonValue | undefined {
        let current: unknown = source;
        for (const key of path) {
            const record = this.asRecord(current);
            if (!record) {
                return undefined;
            }
            current = record[key];
        }
        return current as ParsedJsonValue | undefined;
    }

    /**
     * Reads a nested string value, or '' when missing or not a string.
     */
    protected getStringPath(
        source: unknown,
        path: (string | number)[],
    ): string {
        const value = this.getPathValue(source, path);
        return typeof value === "string" ? value : "";
    }

    /**
     * Reads an array field from an unknown parsed JSON payload and coerces
     * every element to a string. Returns null when the field is missing or
     * not an array.
     */
    protected getArrayField(source: unknown, key: string): string[] | null {
        const record = this.asRecord(source);
        const value = record ? record[key] : undefined;
        if (!Array.isArray(value)) {
            return null;
        }
        return value.map((tag) => String(tag));
    }

    /**
     * Extracts an error message from an unknown error payload by trying each
     * path in order, then falling back to Error.message.
     */
    protected getErrorMessage(
        source: unknown,
        paths: (string | number)[][],
    ): string {
        for (const path of paths) {
            const value = this.getPathValue(source, path);
            if (typeof value === "string" && value) {
                return value;
            }
        }
        if (source instanceof Error && source.message) {
            return source.message;
        }
        return "Unknown error occurred";
    }

    /**
     * Formats a request for the cloud service
     * Handles provider-specific request formats
     * @param prompt - The prompt to send to the LLM
     * @param language - Optional language code
     * @returns Formatted request body
     */
    public formatRequest(
        prompt: string,
        language?: string,
    ): Record<string, unknown> {
        let requestBody: Record<string, unknown>;
        if (this.provider?.requestFormat?.body) {
            // For providers that need specific request format
            requestBody = {
                ...this.provider.requestFormat.body,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt },
                ],
            };
        } else {
            // If no provider-specific format, use the parent class implementation
            const parentBody: unknown = super.formatRequest(prompt, language);
            requestBody = this.asRecord(parentBody) ?? {
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt },
                ],
            };
        }

        this.applyTemperatureOverride(requestBody);

        return requestBody;
    }

    public parseResponse(response: unknown): any {
        if (!this.provider?.responseFormat?.path) {
            throw new Error("Provider response format not configured");
        }

        try {
            if (
                this.getPathValue(response, ["error"]) &&
                this.provider.responseFormat.errorPath
            ) {
                const errorMsg = this.getPathValue(
                    response,
                    this.provider.responseFormat.errorPath,
                );
                throw new Error(
                    typeof errorMsg === "string" ? errorMsg : "Unknown error",
                );
            }

            let result: unknown = response;
            for (const key of this.provider.responseFormat.path) {
                const record = this.asRecord(result);
                if (!record) {
                    throw new Error("Invalid response structure");
                }
                result = record[key];
            }

            // Extract JSON from content if needed
            if (typeof result === "string") {
                const text = result;
                try {
                    result = this.extractJsonFromContent(text);
                } catch {
                    // If JSON parsing fails, try to extract tags directly
                    const tags = this.extractTagsFromText(text);
                    result = {
                        matchedTags: [],
                        newTags: tags,
                    };
                }
            }

            // Ensure both matchedTags and newTags are arrays of strings
            const record = this.asRecord(result);
            if (!record) {
                throw new Error("Invalid response structure");
            }

            const matchedTags = Array.isArray(record.matchedTags)
                ? record.matchedTags
                : [];
            const newTags = Array.isArray(record.newTags) ? record.newTags : [];

            return {
                ...record,
                matchedTags: matchedTags.map((tag) => String(tag).trim()),
                newTags: newTags.map((tag) => String(tag).trim()),
            };
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to parse response: ${message}`);
        }
    }

    private extractTagsFromText(text: string): string[] {
        // Look for hashtags in the response
        const hashtagRegex = /#[\p{L}\p{N}-]+/gu;
        const hashtags = text.match(hashtagRegex) || [];

        if (hashtags.length > 0) {
            return hashtags;
        }

        // If no hashtags found, look for potential tags in quotes or lists
        const potentialTagsRegex =
            /["']([a-zA-Z0-9-]+)["']|\s+[-*]\s+([a-zA-Z0-9-]+)/g;
        const potentialTags: string[] = [];
        let match;

        while ((match = potentialTagsRegex.exec(text)) !== null) {
            const tag = match[1] || match[2];
            if (tag) {
                potentialTags.push(`#${tag}`);
            }
        }

        return potentialTags;
    }

    public validateConfig(): string | null {
        return super.validateConfig();
    }

    constructor(config: AdapterConfig) {
        super(
            {
                ...config,
                endpoint: config.endpoint ?? "",
                modelName: config.modelName ?? "",
            },
            null,
        ); // Adapters don't need the Obsidian app instance
        this.config = config;
    }

    async analyzeTags(content: string, existingTags: string[]): Promise<any> {
        const prompt = this.buildPrompt(
            content,
            existingTags,
            TaggingMode.Hybrid,
            10,
            this.config.language,
        );
        const response = await this.makeRequest(prompt);
        return this.parseResponse(response);
    }

    async testConnection(): Promise<{ result: any; error?: any }> {
        try {
            await this.makeRequest("test");
            return { result: { success: true } };
        } catch (error) {
            return { result: { success: false }, error };
        }
    }

    protected async makeRequest(prompt: string): Promise<unknown> {
        // This method should not be called directly.
        // HTTP requests should be made through CloudLLMService which uses Obsidian's requestUrl
        // to avoid CORS issues. Adapters are meant to format/parse requests, not make them.
        throw new Error(
            "BaseAdapter.makeRequest should not be called directly. Use CloudLLMService instead.",
        );
    }

    getEndpoint(): string {
        return this.config.endpoint ?? "";
    }

    getHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
        };
    }

    protected extractJsonFromContent(content: string): ParsedJsonValue {
        try {
            const jsonMatch = content.match(
                /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
            );
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]) as ParsedJsonValue;
            }
            const standaloneJson = content.match(/\{[\s\S]*\}/);
            if (standaloneJson) {
                return JSON.parse(standaloneJson[0]) as ParsedJsonValue;
            }
            throw new Error("No JSON found in response");
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to parse JSON: ${message}`);
        }
    }

    /**
     * Extracts the main content from a cloud provider response
     * @param response The response object from the cloud provider
     * @returns The extracted content as a string
     */
    public parseResponseContent(response: unknown): string {
        try {
            if (!this.provider?.responseFormat?.contentPath) {
                // Default OpenAI-like format
                const content = this.getPathValue(response, [
                    "choices",
                    0,
                    "message",
                    "content",
                ]);
                return typeof content === "string" ? content : "";
            }

            // Follow provider-specific content path
            let content: unknown = response;
            for (const key of this.provider.responseFormat.contentPath) {
                const record = this.asRecord(content);
                if (!record) {
                    throw new Error("Invalid response structure");
                }
                content = record[key];
            }

            return typeof content === "string"
                ? content
                : JSON.stringify(content);
        } catch {
            return "";
        }
    }

    /**
     * Sends a request to the LLM service
     * Abstract method implementation required by BaseLLMService
     * @param prompt - The prompt to send
     * @returns Promise resolving to the response
     */
    protected async sendRequest(prompt: string): Promise<string> {
        const response = await this.makeRequest(prompt);
        return this.parseResponseContent(response);
    }
}
