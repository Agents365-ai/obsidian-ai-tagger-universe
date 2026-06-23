import { LLMServiceConfig, LLMResponse, ConnectionTestResult, ConnectionTestError } from './types';
import { buildTagPrompt } from './prompts/tagPrompts';
import { TaggingMode } from './prompts/types';
import { SYSTEM_PROMPT } from '../utils/constants';
import { LanguageCode } from './types';
import { App, Notice } from 'obsidian';

/**
 * Base class for LLM service implementations
 * Provides common functionality for tag analysis and request handling
 */
export abstract class BaseLLMService {
    protected endpoint: string;
    protected modelName: string;
    protected readonly TIMEOUT: number;
    private activeRequests = new Set<{ controller: AbortController; timeoutId?: NodeJS.Timeout }>();
    protected readonly app: App | null;
    protected debugMode: boolean = false;

    constructor(config: LLMServiceConfig, app: App | null) {
        this.endpoint = config.endpoint.trim();
        this.modelName = config.modelName.trim();
        this.app = app;
        this.TIMEOUT = (config.requestTimeout || 60) * 1000;
    }

    /**
     * Sets debug mode for verbose logging
     * @param enabled - Whether to enable debug logging
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Logs a debug message if debug mode is enabled
     * @param message - Message to log
     * @param data - Optional data to log
     */
    protected debugLog(message: string, data?: any): void {
        if (this.debugMode) {
            if (data !== undefined) {
                console.log(`[AI Tagger Debug] ${message}`, data);
            } else {
                console.log(`[AI Tagger Debug] ${message}`);
            }
        }
    }

    /**
     * Formats a request for the LLM service
     * This serves as a default implementation. Specific service adapters should override as needed.
     * @param prompt - The prompt to send to the LLM
     * @param language - Optional language code
     * @returns Formatted request body
     */
    public formatRequest(prompt: string, language?: string): any {
        // Default OpenAI-compatible format
        return {
            model: this.modelName,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3
        };
    }

    /**
     * Registers an active request for cleanup
     * @param controller - AbortController for the request
     * @param timeoutId - Optional timeout ID
     * @returns Cleanup function
     */
    protected registerRequest(controller: AbortController, timeoutId?: NodeJS.Timeout): () => void {
        const request = { controller, timeoutId };
        this.activeRequests.add(request);
        return () => {
            if (request.timeoutId) {
                clearTimeout(request.timeoutId);
            }
            this.activeRequests.delete(request);
        };
    }

    /**
     * Creates an AbortController with timeout for a request
     * @param timeoutMs - Timeout in milliseconds
     * @returns Controller and cleanup function
     */
    protected createRequestController(timeoutMs: number): { controller: AbortController; cleanup: () => void } {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort(new Error('Request timeout'));
        }, timeoutMs);
        const cleanup = this.registerRequest(controller, timeoutId);
        return { controller, cleanup };
    }

    /**
     * Cleans up all active requests
     * Should be called when the service is no longer needed
     */
    public async dispose(): Promise<void> {
        // Cancel all active requests
        this.activeRequests.forEach(request => {
            if (request.timeoutId) {
                clearTimeout(request.timeoutId);
            }
            request.controller.abort(new Error('Service disposed'));
        });
        this.activeRequests.clear();
    }

    /**
     * Validates the service configuration
     * @returns Error message if invalid, null if valid
     */
    protected validateConfig(): string | null {
        if (!this.endpoint) {
            return "API endpoint is not configured";
        }
        if (!this.modelName) {
            return "Model name is not configured";
        }
        
        try {
            new URL(this.endpoint);
        } catch {
            return "Invalid API endpoint URL format";
        }

        return null;
    }

    /**
     * Extracts JSON content from an LLM response
     * @param response - Raw response from LLM
     * @param retryCount - Number of retries attempted
     * @returns Extracted JSON string
     * @throws Error if no valid JSON found
     */
    protected extractJSONFromResponse(response: string, retryCount = 0): string {
        // Try to find JSON content within markdown code blocks
        const markdownJsonRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/;
        const markdownMatch = response.match(markdownJsonRegex);
        if (markdownMatch) {
            try {
                // Validate JSON is parseable
                JSON.parse(markdownMatch[1]);
                return markdownMatch[1];
            } catch (e) {
                // Continue to next attempt if JSON is invalid
                if (this.debugMode) {
                    console.debug('Failed to parse markdown JSON:', e);
                }
            }
        }

        // Try to find standalone JSON object
        const jsonRegex = /\{[\s\S]*\}/;
        const jsonMatch = response.match(jsonRegex);
        if (jsonMatch) {
            try {
                // Validate JSON is parseable
                JSON.parse(jsonMatch[0]);
                return jsonMatch[0];
            } catch (e) {
                // Continue to next attempt if JSON is invalid
                if (this.debugMode) {
                    console.debug('Failed to parse standalone JSON:', e);
                }
            }
        }
        
        // If we can't find JSON, try to manually construct it from the response
        if (retryCount === 0) {
            return this.extractJSONFromResponse(response.replace(/\n/g, ' '), 1);
        } else if (retryCount === 1) {
            // Try to extract tags directly if JSON parsing fails
            const tags = new Set<string>();
            
            // Look for hashtags in the response
            const hashtagRegex = /#[\p{Letter}\p{Number}-]+/gu;
            const hashtags = response.match(hashtagRegex);
            if (hashtags) {
                hashtags.forEach(tag => {
                    tags.add(tag);
                });
            }
            
            // Look for any words that might be tags (without the # symbol)
            const potentialTagsRegex = /["']([a-zA-Z0-9-]+)["']/g;
            let match;
            while ((match = potentialTagsRegex.exec(response)) !== null) {
                const tag = `#${match[1]}`;
                tags.add(tag);
            }
            
            if (tags.size > 0) {
                // Construct a JSON object with the extracted tags
                return JSON.stringify({
                    matchedTags: [],
                    newTags: Array.from(tags)
                });
            }
        }
        
        //console.error('Failed to extract JSON from response:', response);
        throw new Error('No valid JSON or tags found in response');
    }

    /**
     * Builds a prompt for tag analysis based on the specified mode
     * @param content - Content to analyze
     * @param candidateTags - Array of candidate tags
     * @param mode - Tagging mode
     * @param maxTags - Maximum number of tags to return
     * @param language - Language code for generated tags
     * @returns Formatted prompt string
     */
    protected buildPrompt(
        content: string, 
        candidateTags: string[], 
        mode: TaggingMode,
        maxTags: number,
        language?: LanguageCode
    ): string {
        return buildTagPrompt(content, candidateTags, mode, maxTags, language);
    }

    /**
     * Parses and validates LLM response
     * @param response - Raw response from LLM
     * @param mode - Tagging mode
     * @param maxTags - Maximum number of tags to return
     * @returns Parsed and validated response
     * @throws Error if response is invalid
     */
    protected parseResponse(response: string, mode: TaggingMode, maxTags: number): LLMResponse {
        try {
            this.debugLog(`Parsing LLM response for mode: ${mode}`);
            this.debugLog(`Raw response:`, response.substring(0, 500));

            // First, check if the response is already in JSON format
            try {
                const jsonResponse = JSON.parse(response.trim());
                this.debugLog(`Parsed JSON response:`, JSON.stringify(jsonResponse, null, 2));
                
                // For Hybrid mode, check for both matched and suggested tags
                if (mode === TaggingMode.Hybrid) {
                    // Check if the response has the expected hybrid format
                    if (Array.isArray(jsonResponse.matchedExistingTags) && Array.isArray(jsonResponse.suggestedTags)) {
                        this.debugLog(`Found hybrid format - matchedExistingTags:`, jsonResponse.matchedExistingTags);
                        this.debugLog(`Found hybrid format - suggestedTags:`, jsonResponse.suggestedTags);

                        const sanitizedMatched = jsonResponse.matchedExistingTags
                            .map((tag: any) => this.sanitizeTag(String(tag)))
                            .filter((tag: string) => tag.length > 0)
                            .slice(0, maxTags);

                        const sanitizedSuggested = jsonResponse.suggestedTags
                            .map((tag: any) => this.sanitizeTag(String(tag)))
                            .filter((tag: string) => tag.length > 0)
                            .slice(0, maxTags);

                        this.debugLog(`After sanitization - matchedExistingTags:`, sanitizedMatched);
                        this.debugLog(`After sanitization - suggestedTags:`, sanitizedSuggested);

                        return {
                            matchedExistingTags: sanitizedMatched,
                            suggestedTags: sanitizedSuggested
                        };
                    }

                    // Alternative fields that might be used
                    if (Array.isArray(jsonResponse.matchedTags) && Array.isArray(jsonResponse.newTags)) {
                        return {
                            matchedExistingTags: jsonResponse.matchedTags
                                .map((tag: any) => this.sanitizeTag(String(tag)))
                                .filter((tag: string) => tag.length > 0)
                                .slice(0, maxTags),
                            suggestedTags: jsonResponse.newTags
                                .map((tag: any) => this.sanitizeTag(String(tag)))
                                .filter((tag: string) => tag.length > 0)
                                .slice(0, maxTags)
                        };
                    }
                    
                    // If we have a tags array but no clear separation, try to extract both
                    if (Array.isArray(jsonResponse.tags)) {
                        // In this case, we don't know which are matched vs suggested
                        // We'll use the whole list as suggested tags (better than nothing)
                        const processedTags = this.processTagsFromResponse(jsonResponse);
                        return {
                            matchedExistingTags: [],
                            suggestedTags: processedTags.tags.slice(0, maxTags)
                        };
                    }
                }
                
                // If we have a valid JSON response with tags
                if (Array.isArray(jsonResponse.tags)) {
                    const processedTags = this.processTagsFromResponse(jsonResponse);
                    
                    // Apply tags according to mode
                    switch (mode) {
                        case TaggingMode.PredefinedTags:
                            return {
                                matchedExistingTags: processedTags.tags.slice(0, maxTags),
                                suggestedTags: []
                            };
                        
                        case TaggingMode.GenerateNew:
                        default:
                            return {
                                matchedExistingTags: [],
                                suggestedTags: processedTags.tags.slice(0, maxTags)
                            };
                    }
                }
                
                // Check for matchedTags or newTags fields (backward compatibility)
                if (Array.isArray(jsonResponse.matchedTags) && mode === TaggingMode.PredefinedTags) {
                    return {
                        matchedExistingTags: jsonResponse.matchedTags
                            .map((tag: any) => this.sanitizeTag(String(tag)))
                            .filter((tag: string) => tag.length > 0)
                            .slice(0, maxTags),
                        suggestedTags: []
                    };
                }

                if (Array.isArray(jsonResponse.newTags) && mode === TaggingMode.GenerateNew) {
                    return {
                        matchedExistingTags: [],
                        suggestedTags: jsonResponse.newTags
                            .map((tag: any) => this.sanitizeTag(String(tag)))
                            .filter((tag: string) => tag.length > 0)
                            .slice(0, maxTags)
                    };
                }
            } catch (e) {
                // Not JSON, might be wrapped in markdown code fences
                this.debugLog(`Initial JSON parse failed, trying to extract from markdown`);
            }

            // Try to extract JSON from markdown code blocks
            const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
            const codeBlockMatch = response.match(codeBlockRegex);

            if (codeBlockMatch) {
                this.debugLog(`Found markdown code block, extracting JSON`);
                try {
                    const jsonResponse = JSON.parse(codeBlockMatch[1].trim());
                    this.debugLog(`Successfully parsed JSON from code block:`, JSON.stringify(jsonResponse, null, 2));

                    // For Hybrid mode, check for both matched and suggested tags
                    if (mode === TaggingMode.Hybrid) {
                        if (Array.isArray(jsonResponse.matchedExistingTags) && Array.isArray(jsonResponse.suggestedTags)) {
                            this.debugLog(`Found hybrid format in code block - matchedExistingTags:`, jsonResponse.matchedExistingTags);
                            this.debugLog(`Found hybrid format in code block - suggestedTags:`, jsonResponse.suggestedTags);

                            const sanitizedMatched = jsonResponse.matchedExistingTags
                                .map((tag: any) => this.sanitizeTag(String(tag)))
                                .filter((tag: string) => tag.length > 0)
                                .slice(0, maxTags);

                            const sanitizedSuggested = jsonResponse.suggestedTags
                                .map((tag: any) => this.sanitizeTag(String(tag)))
                                .filter((tag: string) => tag.length > 0)
                                .slice(0, maxTags);

                            this.debugLog(`After sanitization - matchedExistingTags:`, sanitizedMatched);
                            this.debugLog(`After sanitization - suggestedTags:`, sanitizedSuggested);

                            return {
                                matchedExistingTags: sanitizedMatched,
                                suggestedTags: sanitizedSuggested
                            };
                        }
                    }

                    // Handle other modes from code block
                    if (Array.isArray(jsonResponse.tags)) {
                        const processedTags = this.processTagsFromResponse(jsonResponse);
                        switch (mode) {
                            case TaggingMode.PredefinedTags:
                                return {
                                    matchedExistingTags: processedTags.tags.slice(0, maxTags),
                                    suggestedTags: []
                                };
                            case TaggingMode.GenerateNew:
                            default:
                                return {
                                    matchedExistingTags: [],
                                    suggestedTags: processedTags.tags.slice(0, maxTags)
                                };
                        }
                    }
                } catch (jsonError) {
                    this.debugLog(`Failed to parse JSON from code block:`, jsonError);
                }
            }

            // Clean up the response for text parsing fallback
            let cleanedResponse = response
                .replace(/^```.*$/gm, '') // Remove code blocks
                .replace(/^\s*[\-\*]\s+/gm, '') // Remove list markers
                .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
                .trim();

            // Process the text response
            const processedResponse = this.processTagsFromResponse(cleanedResponse);
            
            // Return tags according to mode
            switch (mode) {
                case TaggingMode.PredefinedTags:
                    return {
                        matchedExistingTags: processedResponse.tags.slice(0, maxTags),
                        suggestedTags: []
                    };
                
                case TaggingMode.Hybrid:
                    // For text responses in hybrid mode, we don't know which are matched vs suggested
                    // We'll conservatively use them all as suggested tags
                    return {
                        matchedExistingTags: [],
                        suggestedTags: processedResponse.tags.slice(0, maxTags)
                    };
                
                case TaggingMode.GenerateNew:
                default:
                    return {
                        matchedExistingTags: [],
                        suggestedTags: processedResponse.tags.slice(0, maxTags)
                    };
            }
        } catch (error) {
            //console.error('Error parsing LLM response:', error);
            throw new Error(`Invalid response format: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Sanitizes a tag by removing common malformed prefixes
     * @param tag - Tag to sanitize
     * @returns Cleaned tag
     */
    protected sanitizeTag(tag: string): string {
        if (!tag || typeof tag !== 'string') return '';

        const original = tag;
        let cleaned = tag.trim();

        // Remove common malformed prefixes that LLMs sometimes add
        const prefixPatterns = [
            /^tag:/i,
            /^matchedExistingTags-/i,
            /^suggestedTags-/i,
            /^matchedTags-/i,
            /^newTags-/i,
            /^tags-/i
        ];

        for (const pattern of prefixPatterns) {
            const beforeReplace = cleaned;
            cleaned = cleaned.replace(pattern, '');
            if (beforeReplace !== cleaned) {
                this.debugLog(`Sanitized tag: "${original}" -> "${cleaned}" (removed pattern: ${pattern})`);
            }
        }

        // Remove # symbol if present
        cleaned = cleaned.replace(/^#/, '');

        if (original !== cleaned) {
            this.debugLog(`Tag sanitization: "${original}" -> "${cleaned}"`);
        }

        return cleaned.trim();
    }

    /**
     * Process raw response content to extract tags
     * @param content - Raw content to process (string or object)
     * @returns Object with tags array
     */
    protected processTagsFromResponse(content: any): { tags: string[] } {
        try {
            // console.log('Processing tags from raw response:', JSON.stringify(content));
            
            // If content is empty, return empty array
            if (!content) {
                // console.log('Content is empty, returning empty tags array');
                return { tags: [] };
            }
            
            // Convert any input to a processable string
            let textContent: string = '';
            
            if (typeof content === 'string') {
                // Use string content directly
                textContent = content;
                //console.log('Response is string:', textContent);
            } else if (Array.isArray(content)) {
                // Convert array to comma-separated string
                textContent = content
                    .filter(item => item !== null && item !== undefined)
                    .join(', ');
                // console.log('Response is array, joined as:', textContent);
            } else if (typeof content === 'object' && content !== null) {
                //console.log('Response is object:', JSON.stringify(content));
                // Try multiple ways to extract tags
                // First check for standard tag fields
                const candidateFields = ['tags', 'tag', 'matchedExistingTags', 'suggestedTags', 'matchedTags', 'newTags', 'content', 'results'];
                
                for (const field of candidateFields) {
                    if (Array.isArray(content[field])) {
                        // Prioritize array fields
                        textContent = content[field]
                            .filter((tag: any) => tag !== null && tag !== undefined)
                            .join(', ');
                        //console.log(`Found array field "${field}":`, textContent);
                        break;
                    } else if (typeof content[field] === 'string' && content[field].trim()) {
                        // String fields can also be used
                        textContent = content[field].trim();
                        //console.log(`Found string field "${field}":`, textContent);
                        break;
                    }
                }
                
                // If no standard fields, try to extract any possible string
                if (!textContent) {
                    for (const [key, value] of Object.entries(content)) {
                        if (typeof value === 'string' && value.trim()) {
                            textContent = value.trim();
                            //console.log(`Using string value from field "${key}":`, textContent);
                            break;
                        } else if (Array.isArray(value) && value.length > 0) {
                            // Try simple arrays
                            textContent = value
                                .filter((item: any) => item !== null && item !== undefined)
                                .join(', ');
                            //console.log(`Using array value from field "${key}":`, textContent);
                            break;
                        }
                    }
                }
            }
            
            // Return empty array for empty content
            if (!textContent.trim()) {
                //console.log('No valid text content extracted, returning empty tags array');
                return { tags: [] };
            }
            
            // Extract tags
            let tags: string[] = [];
            
            // Check if JSON format
            if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
                try {
                    const jsonContent = JSON.parse(textContent);
                    if (Array.isArray(jsonContent)) {
                        // Use JSON array directly
                        tags = jsonContent
                            .map(item => typeof item === 'string' ? item.trim() : String(item).trim())
                            .filter(tag => tag.length > 0);
                        //console.log('Parsed JSON array format:', tags);
                    } else if (typeof jsonContent === 'object' && jsonContent !== null && Array.isArray(jsonContent.tags)) {
                        // Use JSON object with tags field
                        tags = jsonContent.tags
                            .map((tag: any) => typeof tag === 'string' ? tag.trim() : String(tag).trim())
                            .filter((tag: string) => tag.length > 0);
                        //console.log('Parsed JSON object with tags field:', tags);
                    }
                } catch (jsonError) {
                    // Not valid JSON, continue with text parsing
                    //console.log('Failed to parse as JSON, continuing with text parsing:', jsonError);
                }
            }
            
            // If JSON parsing yielded no results, use text parsing
            if (tags.length === 0) {
                // Parse by comma (preferred)
                if (textContent.includes(',')) {
                    tags = textContent.split(',')
                        .map(tag => tag.trim())
                        .filter(tag => tag.length > 0);
                    //console.log('Parsed comma-separated tags:', tags);
                } else {
                    // Try splitting by line
                    tags = textContent.split(/[\n\r]+/)
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                    
                    // If line splitting produced long or sentence-containing lines, process further
                    if (tags.some(line => line.length > 30 || line.includes('.'))) {
                        // Try to find short words that look like tags
                        const potentialTags = [];
                        for (const line of tags) {
                            // Sentences might contain comma-separated tags
                            if (line.includes(',')) {
                                const parts = line.split(',')
                                    .map(part => part.trim())
                                    .filter(part => part.length > 0 && part.length < 30);
                                potentialTags.push(...parts);
                            } else if (line.length < 30) {
                                // Short lines might be tags
                                potentialTags.push(line);
                            }
                        }
                        
                        if (potentialTags.length > 0) {
                            tags = potentialTags;
                            // console.log('Extracted potential tags from long lines:', tags);
                        }
                    }
                    
                    // console.log('Parsed line-separated tags:', tags);
                }
            }
            
            // Remove duplicates, sanitize, and ensure strings. Drop absurdly
            // long entries: when a model returns prose/reasoning instead of a
            // tag list, this text fallback would otherwise turn whole sentences
            // into single hyphenated tags (issue #61).
            const uniqueTags = [...new Set(tags.map(tag => this.sanitizeTag(tag.toString())))]
                .filter(tag => tag.length > 0 && tag.length <= 50);

            // console.log('Final extracted tags:', uniqueTags);
            return { tags: uniqueTags };
        } catch (error) {
            //console.error('Failed to process tags from response:', error);
            return { tags: [] };
        }
    }

    /**
     * Handles errors consistently across the service
     * @param error - Error to handle
     * @param operation - Operation that failed
     * @throws Error with consistent format
     */
    protected handleError(error: unknown, operation: string): never {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                throw new Error(`Operation timed out: ${operation}`);
            }
            throw new Error(`${operation} failed: ${error.message}`);
        }
        throw new Error(`${operation} failed with unknown error`);
    }

    /**
     * Analyzes content and generates tags
     * Template method implementation that handles common logic
     * @param content - Content to analyze
     * @param candidateTags - Array of candidate tags
     * @param mode - Tagging mode
     * @param maxTags - Maximum number of tags to return
     * @param language - Language code for tag generation
     * @returns Promise resolving to tag analysis result
     */
    async analyzeTags(
        content: string, 
        candidateTags: string[], 
        mode: TaggingMode = TaggingMode.GenerateNew,
        maxTags: number = 10,
        language?: LanguageCode
    ): Promise<LLMResponse> {
        try {
            // Validate content
            if (!content.trim()) {
                throw new Error('Empty content provided for analysis');
            }

            // Truncate overly long content
            const maxContentLength = this.getMaxContentLength();
            if (content.length > maxContentLength) {
                content = content.slice(0, maxContentLength) + '...';
            }

            // Build prompt based on mode
            let prompt: string;
            switch (mode) {
                case TaggingMode.GenerateNew:
                    // For new tag generation, ignore candidateTags and pass empty array
                    prompt = this.buildPrompt(content, [], mode, maxTags, language);
                    break;
                    
                case TaggingMode.PredefinedTags:
                    // For predefined tags mode, validate candidate tags exist
                    if (!candidateTags || candidateTags.length === 0) {
                        throw new Error('Predefined tags mode requires candidate tags');
                    }
                    prompt = this.buildPrompt(content, candidateTags, mode, maxTags, language);
                    break;
                    
                case TaggingMode.Hybrid:
                    // For hybrid mode, handle both predefined and new tags
                    if (!candidateTags || candidateTags.length === 0) {
                        // If no candidate tags are provided, fall back to GenerateNew mode
                        prompt = this.buildPrompt(content, [], TaggingMode.GenerateNew, maxTags, language);
                    } else {
                        // Use the hybrid mode prompt with candidate tags
                        prompt = this.buildPrompt(content, candidateTags, mode, maxTags, language);
                    }
                    break;
                    
                case TaggingMode.Custom:
                    // For custom mode, build prompt using the custom prompt from settings
                    // buildTagPrompt will access pluginSettings directly
                    prompt = this.buildPrompt(content, candidateTags, mode, maxTags, language);
                    break;
                default:
                    // Default behavior for future or unknown modes
                    prompt = this.buildPrompt(content, candidateTags, mode, maxTags, language);
            }

            if (!prompt.trim()) {
                throw new Error('Failed to build analysis prompt');
            }

            // Send request and get response
            const response = await this.sendRequest(prompt);

            // Parse response
            const parsed = this.parseResponse(response, mode, maxTags);

            // Predefined mode must never emit tags outside the candidate set.
            // Weak models sometimes invent tags or echo prompt text as tags
            // (issue #61), so deterministically intersect the matches with the
            // candidate list and return the canonical candidate spelling.
            if (mode === TaggingMode.PredefinedTags) {
                const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
                const canonical = new Map(candidateTags.map(t => [normalize(t), t]));
                const matched = [...new Set(
                    (parsed.matchedExistingTags || [])
                        .map(t => canonical.get(normalize(t)))
                        .filter((t): t is string => t !== undefined)
                )];
                return { matchedExistingTags: matched, suggestedTags: [] };
            }

            return parsed;
        } catch (error) {
            // Avoid double error handling
            if (error instanceof Error && error.message.startsWith('Tag analysis failed:')) {
                throw error;
            }
            throw this.handleError(error, 'Tag analysis');
        }
    }
    
    /**
     * Gets the maximum content length for the service implementation
     * Can be overridden by derived classes
     * @returns Maximum content length
     */
    protected getMaxContentLength(): number {
        return 4000; // Default maximum content length
    }
    
    /**
     * Sends a request to the LLM service
     * Must be implemented by derived classes
     * @param prompt - The prompt to send
     * @returns Promise resolving to the response
     */
    protected abstract sendRequest(prompt: string): Promise<string>;

    /**
     * Tests connection to the LLM service
     * Must be implemented by derived classes
     * @returns Promise resolving to connection test result
     */
    abstract testConnection(): Promise<{ result: ConnectionTestResult; error?: ConnectionTestError }>;
}
