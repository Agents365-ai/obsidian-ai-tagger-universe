import { App, MarkdownView, Modal, Notice, Plugin, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import {
    ConnectionTestError,
    ConnectionTestResult,
    LLMService,
    LocalLLMService,
    CloudLLMService,
    LLMResponse
} from './services';
import { setSettings } from './services/prompts/tagPrompts';
import { ConfirmationModal } from './ui/modals/ConfirmationModal';
import { TagUtils, TagOperationResult, setGlobalDebugMode } from './utils/tagUtils';
import { TaggingMode } from './services/prompts/types';
import { registerCommands } from './commands/index';
import { AITaggerSettings, DEFAULT_SETTINGS } from './core/settings';
import { AITaggerSettingTab } from './ui/settings/AITaggerSettingTab';
import { EventHandlers } from './utils/eventHandlers';
import { TagNetworkManager } from './utils/tagNetworkUtils';
import { TagNetworkView, TAG_NETWORK_VIEW_TYPE } from './ui/views/TagNetworkView';
import { TagAnalyticsManager } from './utils/tagAnalyticsUtils';
import { TagAnalyticsView, TAG_ANALYTICS_VIEW_TYPE } from './ui/views/TagAnalyticsView';
import { TagOperations } from './utils/tagOperations';
import { BatchProcessResult } from './utils/batchProcessor';
import { getTranslations, SupportedLanguage } from './i18n';

export default class AITaggerPlugin extends Plugin {
    public settings = {...DEFAULT_SETTINGS};
    public llmService: LLMService;
    private eventHandlers: EventHandlers;
    private tagNetworkManager: TagNetworkManager;
    private tagAnalyticsManager: TagAnalyticsManager;
    private tagOperations: TagOperations;
    public t = getTranslations(this.settings.interfaceLanguage);

    constructor(app: App, manifest: any) {
        super(app, manifest);
        this.llmService = new LocalLLMService({
            endpoint: DEFAULT_SETTINGS.localEndpoint,
            modelName: DEFAULT_SETTINGS.localModel,
            language: DEFAULT_SETTINGS.language,
            llmTemperatureOverride: DEFAULT_SETTINGS.llmTemperatureOverride,
            requestTimeout: DEFAULT_SETTINGS.requestTimeout
        }, app);
        this.eventHandlers = new EventHandlers(app);
        this.tagNetworkManager = new TagNetworkManager(app);
        this.tagAnalyticsManager = new TagAnalyticsManager(app);
        this.tagOperations = new TagOperations(app);
    }

    public async loadSettings(): Promise<void> {
        const oldSettings = await this.loadData();

        if (oldSettings?.serviceType === 'ollama') {
            oldSettings.serviceType = 'local';
            oldSettings.localEndpoint = oldSettings.ollamaEndpoint;
            oldSettings.localModel = oldSettings.ollamaModel;
            delete oldSettings.ollamaEndpoint;
            delete oldSettings.ollamaModel;
        }

        this.settings = Object.assign({}, DEFAULT_SETTINGS, oldSettings);

        // Migrate empty customPrompt to default template
        if (!this.settings.customPrompt || this.settings.customPrompt.trim() === '') {
            this.settings.customPrompt = DEFAULT_SETTINGS.customPrompt;
        }

        // Initialize translations
        this.t = getTranslations(this.settings.interfaceLanguage);
    }

    public async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        await this.initializeLLMService();

        // Update translations
        this.t = getTranslations(this.settings.interfaceLanguage);
    }

    private async initializeLLMService(): Promise<void> {
        await this.llmService?.dispose();

        this.llmService = this.settings.serviceType === 'local'
            ? new LocalLLMService({
                endpoint: this.settings.localEndpoint,
                modelName: this.settings.localModel,
                language: this.settings.language,
                llmTemperatureOverride: this.settings.llmTemperatureOverride,
                requestTimeout: this.settings.requestTimeout
            }, this.app)
            : new CloudLLMService({
                endpoint: this.settings.cloudEndpoint,
                apiKey: this.settings.cloudApiKey,
                modelName: this.settings.cloudModel,
                type: this.settings.cloudServiceType,
                language: this.settings.language,
                llmTemperatureOverride: this.settings.llmTemperatureOverride,
                requestTimeout: this.settings.requestTimeout
            }, this.app);

        // Set debug mode on the LLM service and globally
        this.llmService.setDebugMode(this.settings.debugMode);
        setGlobalDebugMode(this.settings.debugMode);
    }

    public async onload(): Promise<void> {
        await this.loadSettings();
        await this.initializeLLMService();
        
        // Set settings for prompt generation
        setSettings(this.settings);

        // Register event handlers
        this.eventHandlers.registerEventHandlers();
        
        // Add settings tab
        this.addSettingTab(new AITaggerSettingTab(this.app, this));
        
        // Register commands
        registerCommands(this);

        // Register view type for tag network
        this.registerView(
            TAG_NETWORK_VIEW_TYPE,
            (leaf) => new TagNetworkView(leaf, this.tagNetworkManager.getNetworkData(), this.app, this.t, this.tagNetworkManager)
        );

        // Register view type for tag analytics
        this.registerView(
            TAG_ANALYTICS_VIEW_TYPE,
            (leaf) => new TagAnalyticsView(leaf, this.app, this.t, this.tagAnalyticsManager)
        );

        // Add ribbon icons with descriptive tooltips
        this.addRibbonIcon(
            'tags',
            this.t.messages.analyzeTagCurrentNote,
            (evt: MouseEvent) => {
                this.analyzeAndTagCurrentNote();
            }
        );

        this.addRibbonIcon(
            'git-graph',
            this.t.messages.viewTagNetwork,
            (evt: MouseEvent) => {
                this.showTagNetwork();
            }
        );
    }

    public async onunload(): Promise<void> {
        // Clean up resources
        await this.llmService?.dispose();
        this.eventHandlers.cleanup();
        
        // Unregister views
        this.app.workspace.detachLeavesOfType(TAG_NETWORK_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(TAG_ANALYTICS_VIEW_TYPE);
        
        // Trigger layout refresh
        this.app.workspace.trigger('layout-change');
    }
    
    public async showTagNetwork(): Promise<void> {
        try {
            const statusNotice = new Notice(this.t.messages.buildingTagNetwork, 0);

            const files = this.getNonExcludedMarkdownFiles();
            await this.tagNetworkManager.buildTagNetwork(files);
            const networkData = this.tagNetworkManager.getNetworkData();

            statusNotice.hide();

            if (!networkData.nodes.length) {
                new Notice(this.t.messages.noTagsInVault, 3000);
                return;
            }

            if (!networkData.edges.length) {
                new Notice(this.t.messages.noTagConnections, 4000);
            }

            // Try to find existing network view
            let leaf = this.app.workspace.getLeavesOfType(TAG_NETWORK_VIEW_TYPE)[0];
            
            if (!leaf) {
                // Create new view in right sidebar
                const newLeaf = await this.app.workspace.getRightLeaf(false);
                if (!newLeaf) {
                    throw new Error('Failed to create new workspace leaf');
                }
                
                await newLeaf.setViewState({
                    type: TAG_NETWORK_VIEW_TYPE,
                    active: true
                });
                
                leaf = this.app.workspace.getLeavesOfType(TAG_NETWORK_VIEW_TYPE)[0];
                if (!leaf) {
                    throw new Error('Failed to initialize tag network view');
                }
            }
            
            this.app.workspace.revealLeaf(leaf);
        } catch (error) {
            //console.error('Failed to show tag network:', error);
            new Notice(this.t.messages.failedToBuildNetwork, 4000);
        }
    }

    public async showTagAnalytics(): Promise<void> {
        try {
            // Try to find existing analytics view
            let leaf = this.app.workspace.getLeavesOfType(TAG_ANALYTICS_VIEW_TYPE)[0];

            if (!leaf) {
                // Create new view in right sidebar
                const newLeaf = await this.app.workspace.getRightLeaf(false);
                if (!newLeaf) {
                    throw new Error('Failed to create new workspace leaf');
                }

                await newLeaf.setViewState({
                    type: TAG_ANALYTICS_VIEW_TYPE,
                    active: true
                });

                leaf = this.app.workspace.getLeavesOfType(TAG_ANALYTICS_VIEW_TYPE)[0];
                if (!leaf) {
                    throw new Error('Failed to initialize tag analytics view');
                }
            }

            this.app.workspace.revealLeaf(leaf);
        } catch (error) {
            new Notice('Failed to open tag analytics', 4000);
        }
    }

    /**
     * Test connection to the configured LLM service
     */
    public async testConnection(): Promise<{ result: ConnectionTestResult; error?: ConnectionTestError }> {
        return await this.llmService.testConnection();
    }

    public async showConfirmationDialog(message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new ConfirmationModal(
                this.app,
                this.t.modals.warning,
                message,
                () => resolve(true),
                this
            );
            modal.onClose = () => resolve(false);
            modal.open();
        });
    }

    /**
     * Get all markdown files in the vault, excluding those that match exclusion patterns
     */
    public getNonExcludedMarkdownFiles(): TFile[] {
        return TagUtils.getNonExcludedMarkdownFiles(this.app, this.settings.excludedFolders);
    }

    /**
     * Get non-excluded markdown files from a specific folder (includes nested files)
     * @param folder - The folder to search in
     * @returns Array of TFile objects that are markdown files and not excluded
     */
    public getNonExcludedMarkdownFilesFromFolder(folder: TFolder): TFile[] {
        return TagUtils.getNonExcludedMarkdownFiles(this.app, this.settings.excludedFolders, folder);
    }

    public async clearAllNotesTags(): Promise<void> {
        const files = this.getNonExcludedMarkdownFiles();
        if (await this.showConfirmationDialog(
            `Remove all tags from ${files.length} notes? This action cannot be undone.`
        )) {
            try {
                await this.tagOperations.clearDirectoryTags(files);
                new Notice(this.t.messages.successfullyClearedAllVault, 3000);
            } catch (error) {
                //console.error('Failed to clear vault tags:', error);
                new Notice(this.t.messages.failedToClearVaultTags, 4000);
            }
        }
    }

    public async clearNoteTags(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('Please open a note before clearing tags', 3000);
            return;
        }

        const result = await this.tagOperations.clearNoteTags(activeFile);
        this.handleTagUpdateResult(result);
    }

    public async clearDirectoryTags(directory: TFile[]): Promise<BatchProcessResult> {
        return this.tagOperations.clearDirectoryTags(directory);
    }

    public handleTagUpdateResult(result: TagOperationResult | null | undefined, silent = false): void {
        if (!result) {
            !silent && new Notice('Failed to update tags: No result returned', 3000);
            return;
        }

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        
        if (result.success) {
            // Refresh editor view only if in source mode
            if (view?.getMode() === 'source') {
                view.editor.refresh();
            }
            
            // Trigger layout update for reading view
            this.app.workspace.trigger('layout-change');
            
            !silent && new Notice(result.message, 3000);
        } else {
            !silent && new Notice(`Failed to update tags: ${result.message || 'Unknown error'}`, 4000);
            //console.error('Tag update failed:', result.message);
        }
    }

    public async analyzeAndTagFiles(files: TFile[]): Promise<void> {
        if (!files?.length) return;

        const statusNotice = new Notice(`Analyzing ${files.length} files...`, 0);
        
        try {
            let processed = 0, successful = 0;
            let lastNotice = Date.now();

            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    if (!content.trim()) continue;
                    
                    // Use the unified method to analyze and tag
                    const result = await this.analyzeAndTagNote(file, content);
                    
                    result.success && successful++;
                    this.handleTagUpdateResult(result, true); // Silent mode
                    processed++;

                    // Update progress every 15 seconds
                    if (Date.now() - lastNotice >= 15000) {
                        new Notice(`Progress: ${processed}/${files.length} files processed`, 3000);
                        lastNotice = Date.now();
                    }
                } catch (error) {
                    //console.error(`Error processing ${file.path}:`, error);
                    new Notice(`Error processing ${file.path}`, 4000);
                }
            }

            new Notice(`Successfully tagged ${successful} out of ${files.length} files`, 4000);
        } catch (error) {
            // console.error('Batch processing failed:', error);
            new Notice('Failed to complete batch processing', 4000);
        } finally {
            statusNotice.hide();
        }
    }

    private calculateMaxTags(): number {
        switch (this.settings.taggingMode) {
            case TaggingMode.PredefinedTags:
                return this.settings.tagRangePredefinedMax;
            case TaggingMode.Hybrid:
                return this.settings.tagRangePredefinedMax + this.settings.tagRangeGenerateMax;
            case TaggingMode.GenerateNew:
            default:
                return this.settings.tagRangeGenerateMax;
        }
    }

    /**
     * Analyzes and tags the currently open note
     * @returns Promise that resolves when the operation completes
     */
    public async analyzeAndTagCurrentNote(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('Please open a note before analyzing', 3000);
            return;
        }

        const content = await this.app.vault.read(activeFile);
        if (!content.trim()) {
            new Notice('Cannot analyze empty note', 3000);
            return;
        }

        try {
            // Use the unified method to analyze and tag
            const result = await this.analyzeAndTagNote(activeFile, content);
            
            // Process the result
            this.handleTagUpdateResult(result);
        } catch (error) {
            // console.error('Failed to analyze note:', error);
            new Notice('Failed to analyze note. Please check console for details.', 4000);
        }
    }

    /**
     * Analyzes content using hybrid mode and generates tags
     * @param content Content to analyze
     * @returns Array of tags
     */
    public async analyzeWithHybridMode(content: string): Promise<{ tags: string[] }> {
        // Get predefined tags list
        let predefinedTags: string[] = [];
        if (this.settings.tagSourceType === 'file') {
            const fileTags = await TagUtils.getTagsFromFile(this.app, this.settings.predefinedTagsPath, this.settings.tagFormat);
            if (fileTags) {
                predefinedTags = fileTags;
            }
        } else {
            predefinedTags = TagUtils.getAllTags(this.app);
        }
        
        // Use the hybrid mode in LLM service directly
        const hybridResult = await this.llmService.analyzeTags(
            content,
            predefinedTags,
            TaggingMode.Hybrid,
            Math.max(this.settings.tagRangeGenerateMax, this.settings.tagRangePredefinedMax), // Use the larger max tag setting
            this.settings.language
        );
        
        // Merge results and ensure no duplicates
        // Use TagUtils.formatTags to normalize tag format
        const normalizedGeneratedTags = TagUtils.formatTags(hybridResult.suggestedTags || []);
        const normalizedMatchedTags = TagUtils.formatTags(hybridResult.matchedExistingTags || []);
        
        // Use TagUtils.mergeTags to combine and deduplicate
        const allTags = TagUtils.mergeTags(normalizedGeneratedTags, normalizedMatchedTags);
        
        return { tags: allTags };
    }

    /**
     * Analyzes note content and applies tags
     * Supports receiving direct analysis results or analyzing based on content
     * @param file Target file
     * @param contentOrAnalysis File content or existing analysis result
     * @returns Tag operation result
     */
    public async analyzeAndTagNote(file: TFile, contentOrAnalysis: string | LLMResponse): Promise<TagOperationResult> {
        //console.log("analyzeAndTagNote >>>");
        try {
            let analysis: LLMResponse;
            
            // Determine parameter type
            if (typeof contentOrAnalysis === 'string') {
                const content = contentOrAnalysis.trim();
                if (!content) {
                    return {
                        success: false,
                        message: 'Cannot analyze empty note'
                    };
                }
                
                // Analyze based on the configured tagging mode
                switch (this.settings.taggingMode) {
                    case TaggingMode.GenerateNew:
                        analysis = await this.llmService.analyzeTags(
                            content,
                            [], // Empty array, generate tags purely based on content
                            TaggingMode.GenerateNew,
                            this.settings.tagRangeGenerateMax,
                            this.settings.language
                        );
                        break;
                    
                    case TaggingMode.PredefinedTags:
                        // Get candidate tags (from file or vault)
                        const predefinedTags = this.settings.tagSourceType === 'file'
                            ? await TagUtils.getTagsFromFile(this.app, this.settings.predefinedTagsPath, this.settings.tagFormat) || []
                            : TagUtils.getAllTags(this.app);
                        
                        if (!predefinedTags.length) {
                            return {
                                success: false,
                                message: 'No predefined tags available'
                            };
                        }
                        
                        analysis = await this.llmService.analyzeTags(
                            content,
                            predefinedTags,
                            TaggingMode.PredefinedTags,
                            this.settings.tagRangePredefinedMax
                        );
                        break;

                    case TaggingMode.Hybrid:
                        // Get candidate tags (from file or vault)
                        //console.log("analyzeAndTagNote:hybrid:predefined: ", this.settings.predefinedTagsPath);
                        const hybridPredefinedTags = this.settings.tagSourceType === 'file'
                            ? await TagUtils.getTagsFromFile(this.app, this.settings.predefinedTagsPath, this.settings.tagFormat) || []
                            : TagUtils.getAllTags(this.app);
                        //console.log("analyzeAndTagNote:hybrid:hybrid-predefined: ", hybridPredefinedTags);
                        
                        analysis = await this.llmService.analyzeTags(
                            content,
                            hybridPredefinedTags,
                            TaggingMode.Hybrid, 
                            Math.max(this.settings.tagRangeGenerateMax, this.settings.tagRangePredefinedMax),
                            this.settings.language
                        );
                        break;
                    
                    case TaggingMode.Custom:
                        //console.log("analyzeAndTagNote:custom:predefined: ", this.settings.predefinedTagsPath);
                        // Get candidate tags (from file or vault)
                        const customPredefinedTags = this.settings.tagSourceType === 'file'
                            ? await TagUtils.getTagsFromFile(this.app, this.settings.predefinedTagsPath, this.settings.tagFormat) || []
                            : TagUtils.getAllTags(this.app);
                        //console.log("analyzeAndTagNote:hybrid:custom-predefined: ", customPredefinedTags);
                        
                        analysis = await this.llmService.analyzeTags(
                            content,
                            customPredefinedTags,
                            TaggingMode.Custom, 
                            Math.max(this.settings.tagRangeGenerateMax, this.settings.tagRangePredefinedMax),
                            this.settings.language
                        );
                        break;
                    
                    default:
                        //console.log("<<< analyzeAndTagNote: unsupported tagging mode");
                        return {
                            success: false,
                            message: `Unsupported tagging mode: ${this.settings.taggingMode}`
                        };
                }
            } else {
                // Use the provided analysis result directly
                analysis = contentOrAnalysis;
            }
            
            // If no analysis results, return failure
            if (!analysis) {
                //console.log("<<< analyzeAndTagNote: no analysis results available");
                return {
                    success: false,
                    message: 'No analysis results available'
                };
            }
            
            // Process and combine tags based on tagging mode
            let allTags: string[] = [];

            if (this.settings.taggingMode === TaggingMode.PredefinedTags) {
                allTags = analysis.matchedExistingTags || [];
            } else if (this.settings.taggingMode === TaggingMode.GenerateNew) {
                allTags = analysis.suggestedTags || [];
            } else {
                // Hybrid mode, combine both types of tags
                const suggestedTags = analysis.suggestedTags || [];
                const matchedTags = analysis.matchedExistingTags || [];
                allTags = [...suggestedTags, ...matchedTags];
            }

            // Deterministic exclusion filter — LLMs are unreliable at "do not
            // emit X" instructions, so strip excluded tags from the final list.
            // Compare on a normalized form (lowercase, hyphens/underscores/
            // spaces collapsed) so 'Meeting Notes' blocks 'meeting-notes' etc.
            const excluded = this.settings.excludedTags ?? [];
            if (excluded.length > 0) {
                const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
                const blocked = new Set(excluded.map(normalize));
                allTags = allTags.filter(t => !blocked.has(normalize(t)));
            }

            if (this.settings.debugMode) {
                //console.log(`[AI Tagger Debug] Tags before updateNoteTags:`, allTags);
            }

            // If there are tags to add, update the note
            if (allTags.length > 0) {
                const result = await TagUtils.updateNoteTags(
                    this.app,
                    file,
                    allTags,
                    [], // No matched tags since we've already combined them
                    false, // Show notifications
                    this.settings.replaceTags, // Always use the setting value
                    this.settings.tagFormat // Tag format style
                );

                if (this.settings.debugMode) {
                    //console.log(`[AI Tagger Debug] Result from updateNoteTags:`, result);
                }

                //console.log("<<< analyzeAndTagNote: tags added");
                return result;
            }
            
            // No tags found
            //console.log("<<< analyzeAndTagNote: no tags found or generated");
            return {
                success: false,
                message: 'No valid tags were found or generated'
            };
        } catch (error) {
            // console.error('Error tagging note:', error);
            //console.log("<<< analyzeAndTagNote: error tagging note: ", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }
}
