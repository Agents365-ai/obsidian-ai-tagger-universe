import { Setting, Notice } from 'obsidian';
import type AITaggerPlugin from '../../main';
import { TaggingMode } from '../../services/prompts/types';
import { BaseSettingSection } from './BaseSettingSection';
import { LanguageUtils } from '../../utils/languageUtils';
import { ExcludedFilesModal } from '../modals/ExcludedFilesModal';

export class TaggingSettingsSection extends BaseSettingSection {
    private tagSourceSetting: Setting | null = null;
    private predefinedTagsFileSetting: Setting | null = null;

    // Update settings visibility
    private updateVisibility(): void {
        // Determine whether to show tag source setting
        if (this.tagSourceSetting) {
            const shouldShowTagSource = this.plugin.settings.taggingMode !== TaggingMode.GenerateNew;
            this.tagSourceSetting.settingEl.style.display = shouldShowTagSource ? 'flex' : 'none';
        }

        // Determine whether to show predefined tags file setting
        if (this.predefinedTagsFileSetting) {
            const shouldShowTagsFile = this.plugin.settings.taggingMode !== TaggingMode.GenerateNew && 
                                      this.plugin.settings.tagSourceType === 'file';
            this.predefinedTagsFileSetting.settingEl.style.display = shouldShowTagsFile ? 'flex' : 'none';
        }
    }

    display(): void {
        this.containerEl.createEl('h1', { text: this.plugin.t.settings.tagging.title });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.mode)
            .setDesc(this.plugin.t.settings.tagging.modeDesc)
            .addDropdown(dropdown => dropdown
                .addOptions({
                    [TaggingMode.PredefinedTags]: this.plugin.t.settings.tagging.modePredefined,
                    [TaggingMode.GenerateNew]: this.plugin.t.settings.tagging.modeGenerate,
                    [TaggingMode.Hybrid]: this.plugin.t.settings.tagging.modeHybrid,
                    [TaggingMode.Custom]: this.plugin.t.settings.tagging.modeCustom
                })
                .setValue(this.plugin.settings.taggingMode)
                .onChange(async (value) => {
                    this.plugin.settings.taggingMode = value as TaggingMode;
                    await this.plugin.saveSettings();
                    this.updateVisibility();
                }));

        // Tag Source Setting (for PredefinedTags and Hybrid modes)
        this.tagSourceSetting = new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.tagSource)
            .setDesc(this.plugin.t.settings.tagging.tagSourceDesc)
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'file': this.plugin.t.settings.tagging.sourceFile,
                    'vault': this.plugin.t.settings.tagging.sourceVault
                })
                .setValue(this.plugin.settings.tagSourceType)
                .onChange(async (value) => {
                    this.plugin.settings.tagSourceType = value as 'file' | 'vault';
                    await this.plugin.saveSettings();
                    this.updateVisibility();
                }));

        // Predefined tags file setting
        this.predefinedTagsFileSetting = new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.predefinedTagsFile)
            .setDesc(this.plugin.t.settings.tagging.predefinedTagsFileDesc);
        
        const tagsFileInputContainer = this.predefinedTagsFileSetting.controlEl.createDiv('path-input-container');
        const tagsFileInput = tagsFileInputContainer.createEl('input', {
            type: 'text',
            placeholder: this.plugin.t.settings.tagging.pathPlaceholder,
            cls: 'path-input',
            value: this.plugin.settings.predefinedTagsPath || ''
        });
        
        const tagsDropdownContainer = tagsFileInputContainer.createDiv('path-dropdown-container');
        tagsDropdownContainer.style.display = 'none';
        
        const updateTagsDropdown = async (searchTerm: string) => {
            try {
                const items: {path: string, isFolder: boolean, name: string}[] = [];
                const lowerSearchTerm = searchTerm.toLowerCase().trim();
                
                // If search term is empty, show common tag-related files
                if (!lowerSearchTerm) {
                    // Common tag files
                    const commonTagFiles = ['tags.md', 'tags.txt', 'Tags/', 'tag_list.md'];
                    
                    this.plugin.app.vault.getFiles().forEach(file => {
                        // Only show files that look like tag files
                        if (commonTagFiles.some(tagFile => 
                            file.path.toLowerCase().includes(tagFile.toLowerCase()))) {
                            items.push({
                                path: file.path,
                                isFolder: false,
                                name: file.name
                            });
                        }
                    });
                } else {
                    // Make sure search term exists in file path or name
                    this.plugin.app.vault.getFiles().forEach(file => {
                        const filePath = file.path.toLowerCase();
                        const fileName = file.name.toLowerCase();
                        
                        // Only show files with names or paths containing the search term
                        if (filePath.includes(lowerSearchTerm) || fileName.includes(lowerSearchTerm)) {
                            items.push({
                                path: file.path,
                                isFolder: false,
                                name: file.name
                            });
                        }
                    });
                    
                    // Add folder search
                    this.plugin.app.vault.getAllLoadedFiles().forEach(abstractFile => {
                        if ('children' in abstractFile) {  // Check if it's a folder
                            const folderPath = abstractFile.path.toLowerCase() + '/';
                            if (folderPath.includes(lowerSearchTerm)) {
                                items.push({
                                    path: abstractFile.path + '/',
                                    isFolder: true,
                                    name: abstractFile.name
                                });
                            }
                        }
                    });
                }
                
                // Sort results - prioritize items starting with search term
                items.sort((a, b) => {
                    // First check if starts with search term
                    const aStartsWith = a.name.toLowerCase().startsWith(lowerSearchTerm);
                    const bStartsWith = b.name.toLowerCase().startsWith(lowerSearchTerm);
                    
                    if (aStartsWith && !bStartsWith) return -1;
                    if (!aStartsWith && bStartsWith) return 1;
                    
                    // Then sort by file/folder type
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;
                    
                    // Finally sort alphabetically by path
                    return a.path.localeCompare(b.path);
                });
                
                const limitedItems = items.slice(0, 15);  // Limit to 15 items for performance
                tagsDropdownContainer.empty();
                
                if (limitedItems.length === 0) {
                    tagsDropdownContainer.createEl('div', {
                        text: this.plugin.t.messages.noMatchingFiles,
                        cls: 'path-dropdown-empty'
                    });
                    return;
                }
                
                // Set dropdown style to ensure visibility
                tagsDropdownContainer.style.position = 'absolute';
                tagsDropdownContainer.style.width = '100%';
                tagsDropdownContainer.style.zIndex = '1000';
                tagsDropdownContainer.style.backgroundColor = 'var(--background-primary)';
                tagsDropdownContainer.style.border = '1px solid var(--background-modifier-border)';
                tagsDropdownContainer.style.maxHeight = '200px';
                tagsDropdownContainer.style.overflowY = 'auto';
                tagsDropdownContainer.style.top = '100%';  // Position below input
                tagsDropdownContainer.style.left = '0';
                tagsDropdownContainer.style.borderRadius = '4px';
                tagsDropdownContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                
                limitedItems.forEach(item => {
                    const pathItem = tagsDropdownContainer.createEl('div', {
                        cls: 'path-dropdown-item'
                    });
                    
                    // Style dropdown item
                    pathItem.style.padding = '6px 8px';
                    pathItem.style.cursor = 'pointer';
                    pathItem.style.borderBottom = '1px solid var(--background-modifier-border-hover)';
                    pathItem.style.display = 'flex';
                    pathItem.style.alignItems = 'center';
                    
                    // Add hover effect
                    pathItem.addEventListener('mouseenter', () => {
                        pathItem.style.backgroundColor = 'var(--background-secondary)';
                    });
                    
                    pathItem.addEventListener('mouseleave', () => {
                        pathItem.style.backgroundColor = '';
                    });
                    
                    // Add icon
                    const iconEl = pathItem.createSpan({
                        cls: `path-item-icon ${item.isFolder ? 'folder-icon' : 'file-icon'}`
                    });
                    
                    // Style icon
                    iconEl.style.marginRight = '6px';
                    iconEl.style.fontSize = '14px';
                    
                    // Create path text element
                    const textEl = pathItem.createSpan({
                        cls: 'path-item-text'
                    });
                    
                    // Highlight matching part
                    if (lowerSearchTerm && item.path.toLowerCase().includes(lowerSearchTerm)) {
                        const path = item.path;
                        const lowerPath = path.toLowerCase();
                        const index = lowerPath.indexOf(lowerSearchTerm);
                        
                        if (index >= 0) {
                            // Text before match
                            if (index > 0) {
                                textEl.createSpan({
                                    text: path.substring(0, index)
                                });
                            }
                            
                            // Highlight match
                            textEl.createSpan({
                                text: path.substring(index, index + lowerSearchTerm.length),
                                cls: 'path-match-highlight'
                            }).style.backgroundColor = 'var(--text-highlight-bg)';
                            
                            // Text after match
                            if (index + lowerSearchTerm.length < path.length) {
                                textEl.createSpan({
                                    text: path.substring(index + lowerSearchTerm.length)
                                });
                            }
                        } else {
                            textEl.setText(path);
                        }
                    } else {
                        textEl.setText(item.path);
                    }
                    
                    pathItem.addEventListener('click', async () => {
                        tagsFileInput.value = item.path;
                        this.plugin.settings.predefinedTagsPath = item.path;
                        await this.plugin.saveSettings();
                        tagsDropdownContainer.style.display = 'none';
                    });
                });
            } catch (error) {
                //console.error('Error updating tags dropdown:', error);
                tagsDropdownContainer.empty();
                tagsDropdownContainer.createEl('div', {
                    text: this.plugin.t.messages.errorLoadingFiles,
                    cls: 'path-dropdown-error'
                });
            }
        };
        
        tagsFileInput.addEventListener('focus', () => {
            tagsDropdownContainer.style.display = 'block';
            updateTagsDropdown(tagsFileInput.value);
        });
        
        tagsFileInput.addEventListener('click', (e) => {
            // Prevent document click handler from hiding dropdown
            e.stopPropagation();
            
            // Show dropdown on input click
            tagsDropdownContainer.style.display = 'block';
            updateTagsDropdown(tagsFileInput.value);
        });
        
        tagsFileInput.addEventListener('input', async () => {
            this.plugin.settings.predefinedTagsPath = tagsFileInput.value;
            await this.plugin.saveSettings();
            
            // Ensure dropdown remains visible during input
            tagsDropdownContainer.style.display = 'block';
            updateTagsDropdown(tagsFileInput.value);
        });
        
        // Handle document clicks to close dropdown
        const documentClickListener = (event: MouseEvent) => {
            if (!tagsFileInputContainer.contains(event.target as Node)) {
                tagsDropdownContainer.style.display = 'none';
            }
        };
        
        document.addEventListener('click', documentClickListener);
        
        // Clean up when component is destroyed
        this.plugin.register(() => {
            document.removeEventListener('click', documentClickListener);
        });
        
        // Apply initial visibility
        this.updateVisibility();

        // File exclusion Setting
        this.containerEl.createEl('h3', { text: this.plugin.t.settings.tagging.fileExclusion });

        const excludedFoldersSetting = new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.excludedFiles)
            .setDesc(this.plugin.t.settings.tagging.excludedFilesDesc);

        const excludedInfo = excludedFoldersSetting.descEl.createDiv({
            cls: 'excluded-info'
        });

        const updateExcludedInfo = () => {
            excludedInfo.empty();

            if (this.plugin.settings.excludedFolders.length === 0) {
                excludedInfo.createSpan({
                    text: this.plugin.t.settings.tagging.noExclusions,
                    cls: 'excluded-info-text muted'
                });
            } else {
                excludedInfo.createSpan({
                    text: `${this.plugin.settings.excludedFolders.length} ${this.plugin.t.settings.tagging.patternsConfigured}`,
                    cls: 'excluded-info-text'
                });
            }
        };
        
        updateExcludedInfo();

        excludedFoldersSetting.addButton(button =>
            button
                .setButtonText(this.plugin.t.settings.tagging.manage)
                .setCta()
                .onClick(() => {
                    const modal = new ExcludedFilesModal(
                        this.plugin.app,
                        this.plugin,
                        async (excludedFolders: string[]) => {
                            this.plugin.settings.excludedFolders = excludedFolders;
                            await this.plugin.saveSettings();
                            updateExcludedInfo();
                        }
                    );
                    modal.open();
                })
        );

        // Tag Range Settings
        this.containerEl.createEl('h3', { text: this.plugin.t.settings.tagging.tagRangeSettings });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.maxPredefinedTags)
            .setDesc(this.plugin.t.settings.tagging.maxPredefinedTagsDesc)
            .addSlider(slider => {
                const container = slider.sliderEl.parentElement;
                if (container) {
                    const numberDisplay = container.createSpan({ cls: 'value-display' });
                    numberDisplay.style.marginLeft = '10px';
                    numberDisplay.setText(String(this.plugin.settings.tagRangePredefinedMax));

                    slider.setLimits(0, 10, 1)
                        .setValue(this.plugin.settings.tagRangePredefinedMax)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            numberDisplay.setText(String(value));
                            this.plugin.settings.tagRangePredefinedMax = value;
                            await this.plugin.saveSettings();
                        });
                }
                return slider;
            });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.maxGeneratedTags)
            .setDesc(this.plugin.t.settings.tagging.maxGeneratedTagsDesc)
            .addSlider(slider => {
                const container = slider.sliderEl.parentElement;
                if (container) {
                    const numberDisplay = container.createSpan({ cls: 'value-display' });
                    numberDisplay.style.marginLeft = '10px';
                    numberDisplay.setText(String(this.plugin.settings.tagRangeGenerateMax));

                    slider.setLimits(0, 10, 1)
                        .setValue(this.plugin.settings.tagRangeGenerateMax)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            numberDisplay.setText(String(value));
                            this.plugin.settings.tagRangeGenerateMax = value;
                            await this.plugin.saveSettings();
                        });
                }
                return slider;
            });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.outputLanguage)
            .setDesc(this.plugin.t.settings.tagging.outputLanguageDesc)
            .addDropdown(dropdown => {
                // Add language options
                const options: Record<string, string> = LanguageUtils.getLanguageOptions();

                return dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.language)
                    .onChange(async (value) => {
                        this.plugin.settings.language = value as any;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(this.containerEl)
        .setName(this.plugin.t.settings.tagging.customPrompt)
        .setDesc(this.plugin.t.settings.tagging.customPromptDesc)
        .addTextArea(text => {
            text
            .setPlaceholder(this.plugin.t.settings.tagging.customPromptPlaceholder)
            .setValue(this.plugin.settings.customPrompt)
            .onChange(async (value) => {
                this.plugin.settings.customPrompt = value;
                await this.plugin.saveSettings();
            });
            text.inputEl.rows = 8;
            text.inputEl.cols = 50;
        });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.excludedTags)
            .setDesc(this.plugin.t.settings.tagging.excludedTagsDesc)
            .addTextArea(text => {
                text
                    .setPlaceholder(this.plugin.t.settings.tagging.excludedTagsPlaceholder)
                    .setValue(this.plugin.settings.excludedTags.join(', '))
                    .onChange(async (value) => {
                        this.plugin.settings.excludedTags = value
                            .split(/[,\n]/)
                            .map(t => t.trim())
                            .filter(Boolean);
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 3;
                text.inputEl.cols = 50;
            });

        // Tag Behavior Settings
        this.containerEl.createEl('h3', { text: this.plugin.t.settings.tagging.tagBehaviorSettings });

        // NOTE: UI presents this setting inverted for better UX
        // UI "Preserve Existing Tags" ON = replaceTags FALSE (merge behavior)
        // UI "Preserve Existing Tags" OFF = replaceTags TRUE (replace behavior)
        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.preserveExistingTags)
            .setDesc(this.plugin.t.settings.tagging.preserveExistingTagsDesc)
            .addToggle(toggle => toggle
                .setValue(!this.plugin.settings.replaceTags)
                .onChange(async (value) => {
                    this.plugin.settings.replaceTags = !value;
                    await this.plugin.saveSettings();
                }));

        // Request Timeout slider
        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.requestTimeout)
            .setDesc(this.plugin.t.settings.tagging.requestTimeoutDesc)
            .addSlider(slider => {
                const container = slider.sliderEl.parentElement;
                if (container) {
                    const numberDisplay = container.createSpan({ cls: 'value-display' });
                    numberDisplay.style.marginLeft = '10px';
                    numberDisplay.setText(`${this.plugin.settings.requestTimeout}s`);

                    slider.setLimits(15, 300, 15)
                        .setValue(this.plugin.settings.requestTimeout)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            numberDisplay.setText(`${value}s`);
                            this.plugin.settings.requestTimeout = value;
                            await this.plugin.saveSettings();
                        });
                }
                return slider;
            });

        // Nested Tags Settings
        this.containerEl.createEl('h3', { text: this.plugin.t.settings.tagging.nestedTagsSettings });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.enableNestedTags)
            .setDesc(this.plugin.t.settings.tagging.enableNestedTagsDesc)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableNestedTags)
                .onChange(async (value) => {
                    this.plugin.settings.enableNestedTags = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.nestedTagsMaxDepth)
            .setDesc(this.plugin.t.settings.tagging.nestedTagsMaxDepthDesc)
            .addSlider(slider => slider
                .setLimits(1, 3, 1)
                .setValue(this.plugin.settings.nestedTagsMaxDepth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.nestedTagsMaxDepth = value;
                    await this.plugin.saveSettings();
                }));

        // Tag Format Settings
        this.containerEl.createEl('h3', { text: this.plugin.t.settings.tagging.tagFormatSettings });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.tagging.tagFormat)
            .setDesc(this.plugin.t.settings.tagging.tagFormatDesc)
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'kebab-case': this.plugin.t.settings.tagging.tagFormatKebab,
                    'camelCase': this.plugin.t.settings.tagging.tagFormatCamel,
                    'PascalCase': this.plugin.t.settings.tagging.tagFormatPascal,
                    'snake_case': this.plugin.t.settings.tagging.tagFormatSnake,
                    'original': this.plugin.t.settings.tagging.tagFormatOriginal
                })
                .setValue(this.plugin.settings.tagFormat)
                .onChange(async (value) => {
                    this.plugin.settings.tagFormat = value as 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case' | 'original';
                    await this.plugin.saveSettings();
                }));
    }
}
