import { TaggingMode } from '../services/prompts/types';
import { LanguageCode } from '../services/types';
import { AdapterType } from '../services/adapters';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n';

export type TagFormat = 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case' | 'original';

export interface TagTemplate {
    id: string;
    name: string;
    tags: string[];
}

export interface AITaggerSettings {
    serviceType: 'local' | 'cloud';
    localEndpoint: string;
    localModel: string;
    localServiceType?: 'ollama' | 'lm_studio' | 'localai' | 'openai_compatible';
    cloudEndpoint: string;
    cloudApiKey: string;
    cloudModel: string;
    cloudServiceType: AdapterType;
    llmTemperatureOverride: number | null;
    taggingMode: TaggingMode;
    customPrompt: string;
    excludedFolders: string[];
    excludedTags: string[];
    language: LanguageCode;
    interfaceLanguage: SupportedLanguage;
    predefinedTagsPath: string;
    tagSourceType: 'file' | 'vault';
    replaceTags: boolean;
    tagDir: string;
    /** @deprecated Kept for backward compatibility only */
    tagRangeMatchMax: number;
    tagRangeGenerateMax: number;
    tagRangePredefinedMax: number;
    debugMode: boolean;
    // Nested Tags Settings
    enableNestedTags: boolean;           // Enable nested tag generation
    nestedTagsMaxDepth: number;          // Max hierarchy depth (1-3)
    // Tag Format Settings
    tagFormat: TagFormat;                // Tag naming convention
    // Tag Templates
    tagTemplates: TagTemplate[];         // User-defined tag templates
    // Request timeout in seconds
    requestTimeout: number;
}

export const DEFAULT_SETTINGS: AITaggerSettings = {
    serviceType: 'cloud',
    localEndpoint: 'http://localhost:11434/v1/chat/completions',
    localModel: 'mistral',
    cloudEndpoint: 'https://api.openai.com/v1/chat/completions',
    cloudApiKey: '',
    cloudModel: 'gpt-4',
    cloudServiceType: 'openai',
    llmTemperatureOverride: null,
    taggingMode: TaggingMode.GenerateNew,
    customPrompt: `Focus on main topics and key concepts from the content.

Generate tags that are:
- Specific enough to be useful for searching
- General enough to connect related notes
- Based on actual content, not assumptions

Prefer technical terms and domain-specific vocabulary when appropriate.`,
    excludedFolders: [],
    excludedTags: [],
    language: 'default',
    interfaceLanguage: DEFAULT_LANGUAGE,
    predefinedTagsPath: '',
    tagSourceType: 'vault',
    tagDir: '',
    tagRangeMatchMax: 5,
    tagRangeGenerateMax: 5,
    tagRangePredefinedMax: 5,
    replaceTags: true,
    debugMode: false,
    enableNestedTags: false,
    nestedTagsMaxDepth: 2,
    tagFormat: 'kebab-case',
    tagTemplates: [],
    requestTimeout: 60,
};
