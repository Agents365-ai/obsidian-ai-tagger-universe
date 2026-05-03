export interface Translations {
    // Settings sections
    settings: {
        llm: {
            title: string;
            serviceType: string;
            serviceTypeDesc: string;
            cloudProvider: string;
            cloudProviderDesc: string;
            localEndpoint: string;
            localEndpointDesc: string;
            modelName: string;
            modelNameDesc: string;
            temperature: string;
            temperatureDesc: string;
            temperaturePlaceholder: string;
            temperatureInvalid: string;
            apiEndpoint: string;
            apiEndpointDesc: string;
            apiKey: string;
            apiKeyDesc: string;
            connectionTest: string;
            connectionTestDesc: string;
            testConnection: string;
            testing: string;
            connectionSuccessful: string;
            connectionFailed: string;
            debugMode: string;
            debugModeDesc: string;
            debugEnabled: string;
            debugDisabled: string;
            tipsPopularTools: string;
        };
        tagging: {
            title: string;
            taggingMode: string;
            taggingModeDesc: string;
            mode: string;
            modeDesc: string;
            modePredefined: string;
            modeGenerate: string;
            modeHybrid: string;
            modeCustom: string;
            tagSource: string;
            tagSourceDesc: string;
            sourceFile: string;
            sourceVault: string;
            predefinedTagsFile: string;
            predefinedTagsFileDesc: string;
            fileExclusion: string;
            excludedFiles: string;
            excludedFilesDesc: string;
            manage: string;
            noExclusions: string;
            patternsConfigured: string;
            tagRangeSettings: string;
            maxPredefinedTags: string;
            maxPredefinedTagsDesc: string;
            maxGeneratedTags: string;
            maxGeneratedTagsDesc: string;
            outputLanguage: string;
            outputLanguageDesc: string;
            customPrompt: string;
            customPromptDesc: string;
            pathPlaceholder: string;
            customPromptPlaceholder: string;
            nestedTagsSettings: string;
            enableNestedTags: string;
            enableNestedTagsDesc: string;
            nestedTagsMaxDepth: string;
            nestedTagsMaxDepthDesc: string;
            tagFormatSettings: string;
            tagFormat: string;
            tagFormatDesc: string;
            tagFormatKebab: string;
            tagFormatCamel: string;
            tagFormatPascal: string;
            tagFormatSnake: string;
            tagFormatOriginal: string;
            tagBehaviorSettings: string;
            preserveExistingTags: string;
            preserveExistingTagsDesc: string;
            excludedTags: string;
            excludedTagsDesc: string;
            excludedTagsPlaceholder: string;
            requestTimeout: string;
            requestTimeoutDesc: string;
        };
        support: {
            title: string;
            description: string;
            supportText: string;
            buyMeACoffee: string;
            buyCoffee: string;
        };
        interface: {
            title: string;
            language: string;
            languageDesc: string;
        };
    };

    // Commands
    commands: {
        generateForCurrentNote: string;
        generateTagsForCurrentNote: string;
        generateForCurrentFolder: string;
        generateTagsForCurrentFolder: string;
        generateForVault: string;
        generateTagsForVault: string;
        clearTagsForCurrentNote: string;
        clearTagsForCurrentFolder: string;
        clearTagsForVault: string;
        collectAllTags: string;
        showTagNetwork: string;
        aiTagSelectedNotes: string;
        aiTagThisNote: string;
        flattenTagsForCurrentNote: string;
        flattenTagsForCurrentFolder: string;
        flattenTagsForVault: string;
        showTagAnalytics: string;
        bulkRenameTag: string;
        exportTagsCSV: string;
        exportTagsJSON: string;
        importTags: string;
        applyTagTemplate: string;
        deduplicateTags: string;
    };

    // Messages and notifications
    messages: {
        openNote: string;
        noContent: string;
        analyzing: string;
        failedToGenerate: string;
        operationCancelled: string;
        noMdFiles: string;
        noParentFolder: string;
        buildingTagNetwork: string;
        noTagsFound: string;
        noTagConnections: string;
        failedToBuildNetwork: string;
        successfullyClearedAll: string;
        failedToClearVault: string;
        pleaseOpenNote: string;
        failedToUpdate: string;
        analyzingFiles: string;
        successfullyTagged: string;
        progress: string;
        completed: string;
        connectionTestSuccess: string;
        connectionTestFailed: string;
        localServiceNotRunning: string;
        localServiceNotAvailable: string;
        tagsAlreadyUpToDate: string;
        noValidTags: string;
        errorClearingTags: string;
        errorUpdatingTags: string;
        tagsSavedTo: string;
        errorSavingTags: string;
        failedToLoadEndpoints: string;
        debugModeToggle: string;
        openNoteFirst: string;
        noParentFolderFound: string;
        noMarkdownFilesFound: string;
        noContentToAnalyze: string;
        failedToGenerateTags: string;
        generateTagsForFolderConfirm: string;
        generateTagsForVaultConfirm: string;
        generateTagsForSelectedConfirm: string;
        generateTagsInProgress: string;
        tagsGeneratedSuccessfully: string;
        failedToGenerateForFiles: string;
        progressPrefix: string;
        completedPrefix: string;
        restartRequired: string;
        languageChangeNotice: string;
        clearTagsForFolderConfirm: string;
        tagsClearedFrom: string;
        failedToClearTags: string;
        noTagsInVault: string;
        successfullyClearedAllVault: string;
        failedToClearVaultTags: string;
        viewTagNetwork: string;
        analyzeTagCurrentNote: string;
        noMatchingFiles: string;
        errorLoadingFiles: string;
        noActiveFile: string;
        noPredefinedTagsFound: string;
        flattenTagsConfirm: string;
        flattenTagsForFolderConfirm: string;
        flattenTagsForVaultConfirm: string;
        flatteningTags: string;
        tagsFlattenedSuccessfully: string;
        noHierarchicalTags: string;
    };

    // Modal dialogs
    modals: {
        warning: string;
        confirm: string;
        cancel: string;
        clearAllTagsConfirm: string;
        generateFolderConfirm: string;
        generateVaultConfirm: string;
        generateSelectedConfirm: string;
        saveTagsConfirm: string;
        excludedFilesTitle: string;
        excludedFilesSubtitle: string;
        addButton: string;
        clearAllButton: string;
        clearAllConfirm: string;
        cancelButton: string;
        saveButton: string;
        noMatchingPaths: string;
        useAsPattern: string;
        moreResults: string;
        errorLoadingPaths: string;
        noExclusionsDefined: string;
        filterLabel: string;
        pathPlaceholder: string;
    };

    // File menu items
    fileMenu: {
        tagNetwork: string;
    };

    // Tag Import/Export
    tagImportExport: {
        exportSuccess: string;
        importTitle: string;
        selectFile: string;
        importMode: string;
        modeMerge: string;
        modeReplace: string;
        import: string;
        importing: string;
        importSuccess: string;
        importError: string;
        noFileSelected: string;
    };

    // Tag Rename
    tagRename: {
        title: string;
        oldTagLabel: string;
        newTagLabel: string;
        oldTagPlaceholder: string;
        newTagPlaceholder: string;
        rename: string;
        renaming: string;
        success: string;
        noTagSpecified: string;
        sameTagError: string;
    };

    // Tag Analytics View
    tagAnalytics: {
        title: string;
        description: string;
        refresh: string;
        exportCSV: string;
        summary: string;
        totalUniqueTags: string;
        totalTaggedNotes: string;
        totalUntaggedNotes: string;
        averageTagsPerNote: string;
        orphanedTags: string;
        tagUsage: string;
        tagName: string;
        frequency: string;
        status: string;
        statusHealthy: string;
        statusLowUse: string;
        statusOrphaned: string;
        health: string;
        orphanedTagsSection: string;
        untaggedNotesSection: string;
        showNotes: string;
        noOrphanedTags: string;
        noUntaggedNotes: string;
        exportSuccess: string;
        notesWithTag: string;
    };

    // Tag Network View
    tagNetwork: {
        title: string;
        description: string;
        searchPlaceholder: string;
        repulsionStrength: string;
        linkDistance: string;
        frequencyLow: string;
        frequencyMedium: string;
        frequencyHigh: string;
        clickToShowDocs: string;
        documentsWithTag: string;
        noDocuments: string;
        refresh: string;
    };

    // Tag Templates
    tagTemplates: {
        title: string;
        description: string;
        addTemplate: string;
        editTemplate: string;
        deleteTemplate: string;
        templateName: string;
        templateNamePlaceholder: string;
        templateTags: string;
        templateTagsPlaceholder: string;
        templateTagsDesc: string;
        save: string;
        cancel: string;
        noTemplates: string;
        applyTemplate: string;
        selectTemplate: string;
        templateApplied: string;
        deleteConfirm: string;
        duplicateName: string;
        emptyName: string;
        emptyTags: string;
    };

    // Tag Deduplication
    tagDeduplication: {
        title: string;
        description: string;
        scanning: string;
        noDuplicates: string;
        duplicatesFound: string;
        keepTag: string;
        mergeInto: string;
        merge: string;
        mergeAll: string;
        skip: string;
        merging: string;
        mergeSuccess: string;
        similarityType: string;
        typeAbbreviation: string;
        typeCaseDiff: string;
        typePlural: string;
        typeSimilar: string;
        usageCount: string;
        affectedFiles: string;
    };

    // Dropdown options
    dropdowns: {
        localLLM: string;
        cloudService: string;
        openai: string;
        gemini: string;
        deepseek: string;
        aliyun: string;
        claude: string;
        groq: string;
        vertex: string;
        openrouter: string;
        bedrock: string;
        requesty: string;
        cohere: string;
        grok: string;
        mistral: string;
        glm: string;
        mimo: string;
        minimax: string;
        openaiCompatible: string;
        ollama: string;
        localai: string;
        lmStudio: string;
        jan: string;
        koboldcpp: string;
    };

    // Tips
    tips: {
        ollama: string;
        localai: string;
        lmStudio: string;
        jan: string;
        koboldcpp: string;
    };
}
