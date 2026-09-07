import { type App, ItemView, type TFile, type WorkspaceLeaf } from "obsidian";
import * as d3 from "d3";
import {
    type NetworkData,
    type NetworkNode,
    TagNetworkManager,
} from "../../utils/tagNetworkUtils";
import type { Translations } from "../../i18n/types";

export const TAG_NETWORK_VIEW_TYPE = "tag-network-view";

type SimulationNode = NetworkNode & d3.SimulationNodeDatum;

interface NetworkLink extends d3.SimulationLinkDatum<SimulationNode> {
    weight: number;
}

// Link datum after forceLink initialization, where source/target id strings
// have been replaced by node object references
type ResolvedNetworkLink = NetworkLink & {
    source: SimulationNode;
    target: SimulationNode;
};

interface ForceSettings {
    repulsion: number;
    linkDistance: number;
}

export class TagNetworkView extends ItemView {
    private networkData: NetworkData;
    private cleanup: (() => void)[] = [];
    private simulation: d3.Simulation<SimulationNode, NetworkLink> | null =
        null;
    private forceSettings: ForceSettings = {
        repulsion: -300,
        linkDistance: 100,
    };
    private tagNetworkManager: TagNetworkManager;
    private t: Translations;
    // Debounce timer for metadata cache updates
    private metadataDebounceTimer: number | null = null;
    private readonly DEBOUNCE_DELAY = 500; // 500ms debounce

    constructor(
        leaf: WorkspaceLeaf,
        data: NetworkData,
        app: App,
        t: Translations,
        tagNetworkManager?: TagNetworkManager,
    ) {
        super(leaf);
        this.networkData = data;
        // Use provided manager or create new one (for backward compatibility)
        this.tagNetworkManager =
            tagNetworkManager || new TagNetworkManager(app);
        this.t = t;
    }

    getViewType(): string {
        return TAG_NETWORK_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.t.tagNetwork.title;
    }

    getIcon(): string {
        return "git-graph";
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("tag-network-view");

        contentEl.createEl("h2", { text: this.t.tagNetwork.title });
        contentEl.createEl("p", { text: this.t.tagNetwork.description });

        const controlsContainer = contentEl.createDiv({
            cls: "tag-network-controls",
        });

        // Search control
        const searchContainer = controlsContainer.createDiv({
            cls: "tag-network-search",
        });
        searchContainer.createSpan({ text: "Search: " });
        const searchInput = searchContainer.createEl("input", {
            type: "text",
            placeholder: this.t.tagNetwork.searchPlaceholder,
            cls: "tag-network-search-input",
        });

        // Force settings controls
        const forceControlsContainer = controlsContainer.createDiv({
            cls: "tag-network-force-controls",
        });

        // Repulsion slider
        const repulsionContainer = forceControlsContainer.createDiv({
            cls: "tag-network-slider-container",
        });
        repulsionContainer.createEl("label", {
            text: `${this.t.tagNetwork.repulsionStrength}: `,
        });
        const repulsionValue = repulsionContainer.createSpan({
            text: "300",
            cls: "tag-network-slider-value",
        });
        const repulsionSlider = repulsionContainer.createEl("input", {
            type: "range",
            cls: "tag-network-slider",
        });
        repulsionSlider.min = "50";
        repulsionSlider.max = "800";
        repulsionSlider.value = "300";

        // Link distance slider
        const linkDistanceContainer = forceControlsContainer.createDiv({
            cls: "tag-network-slider-container",
        });
        linkDistanceContainer.createEl("label", {
            text: `${this.t.tagNetwork.linkDistance}: `,
        });
        const linkDistanceValue = linkDistanceContainer.createSpan({
            text: "100",
            cls: "tag-network-slider-value",
        });
        const linkDistanceSlider = linkDistanceContainer.createEl("input", {
            type: "range",
            cls: "tag-network-slider",
        });
        linkDistanceSlider.min = "30";
        linkDistanceSlider.max = "300";
        linkDistanceSlider.value = "100";

        // Refresh button
        const refreshBtn = forceControlsContainer.createEl("button", {
            text: this.t.tagNetwork.refresh,
            cls: "tag-network-refresh-btn",
        });

        const legendContainer = contentEl.createDiv({
            cls: "tag-network-legend",
        });
        legendContainer.createSpan({ text: "Frequency: " });

        const lowFreqItem = legendContainer.createDiv({
            cls: "tag-network-legend-item",
        });
        lowFreqItem.createDiv({ cls: "tag-network-legend-color low" });
        lowFreqItem.createSpan({ text: this.t.tagNetwork.frequencyLow });

        const mediumFreqItem = legendContainer.createDiv({
            cls: "tag-network-legend-item",
        });
        mediumFreqItem.createDiv({ cls: "tag-network-legend-color medium" });
        mediumFreqItem.createSpan({
            text: this.t.tagNetwork.frequencyMedium,
        });

        const highFreqItem = legendContainer.createDiv({
            cls: "tag-network-legend-item",
        });
        highFreqItem.createDiv({ cls: "tag-network-legend-color high" });
        highFreqItem.createSpan({
            text: this.t.tagNetwork.frequencyHigh,
        });

        // Hint for click functionality
        const hintContainer = contentEl.createDiv({ cls: "tag-network-hint" });
        hintContainer.createSpan({
            text: this.t.tagNetwork.clickToShowDocs,
        });

        const container = contentEl.createDiv({ cls: "tag-network-container" });

        const tooltip = contentEl.createDiv({ cls: "tag-tooltip" });
        tooltip.addClass("tag-tooltip-hidden");
        tooltip.createDiv({ cls: "tag-tooltip-content" });

        // Document list panel (hidden by default)
        const docPanel = contentEl.createDiv({
            cls: "tag-network-doc-panel tag-network-doc-panel-hidden",
        });
        const docPanelHeader = docPanel.createDiv({
            cls: "tag-network-doc-panel-header",
        });
        docPanelHeader.createSpan({ cls: "tag-network-doc-panel-title" });
        const closeBtn = docPanelHeader.createEl("button", {
            text: "×",
            cls: "tag-network-doc-panel-close",
        });
        const docList = docPanel.createDiv({ cls: "tag-network-doc-list" });

        closeBtn.addEventListener("click", () => {
            docPanel.addClass("tag-network-doc-panel-hidden");
        });

        const statusEl = contentEl.createDiv({ cls: "tag-network-status" });
        statusEl.setText("Loading visualization...");

        if (this.networkData.nodes.length === 0) {
            statusEl.setText(
                "No tags found in your vault. Add some tags first!",
            );
            return;
        }

        // Slider event handlers
        const handleRepulsionChange = () => {
            const value = parseInt(repulsionSlider.value);
            repulsionValue.setText(String(value));
            this.forceSettings.repulsion = -value;
            this.updateForceSettings();
        };

        const handleLinkDistanceChange = () => {
            const value = parseInt(linkDistanceSlider.value);
            linkDistanceValue.setText(String(value));
            this.forceSettings.linkDistance = value;
            this.updateForceSettings();
        };

        repulsionSlider.addEventListener("input", handleRepulsionChange);
        linkDistanceSlider.addEventListener("input", handleLinkDistanceChange);
        this.cleanup.push(() => {
            repulsionSlider.removeEventListener("input", handleRepulsionChange);
            linkDistanceSlider.removeEventListener(
                "input",
                handleLinkDistanceChange,
            );
        });

        // Refresh button handler
        const handleRefresh = () => {
            statusEl.show();
            statusEl.setText("Refreshing...");
            this.refreshNetworkData()
                .then(() => {
                    try {
                        this.renderD3Network(
                            container,
                            searchInput,
                            tooltip,
                            statusEl,
                            docPanel,
                            docList,
                        );
                    } catch {
                        statusEl.setText("Error refreshing visualization.");
                    }
                })
                .catch(() => {
                    statusEl.setText("Error refreshing visualization.");
                });
        };
        refreshBtn.addEventListener("click", handleRefresh);
        this.cleanup.push(() =>
            refreshBtn.removeEventListener("click", handleRefresh),
        );

        // Register metadata cache listener for real-time updates (debounced)
        const metadataCacheHandler = this.app.metadataCache.on(
            "changed",
            () => {
                // Debounce to prevent race conditions from rapid metadata changes
                if (this.metadataDebounceTimer) {
                    window.clearTimeout(this.metadataDebounceTimer);
                }
                this.metadataDebounceTimer = window.setTimeout(() => {
                    this.metadataDebounceTimer = null;
                    this.refreshNetworkData()
                        .then(() => {
                            if (this.simulation) {
                                this.simulation.alpha(0.3).restart();
                            }
                        })
                        .catch((error) => {
                            console.error(
                                "Error refreshing tag network:",
                                error,
                            );
                        });
                }, this.DEBOUNCE_DELAY);
            },
        );
        this.cleanup.push(() => {
            if (this.metadataDebounceTimer) {
                window.clearTimeout(this.metadataDebounceTimer);
                this.metadataDebounceTimer = null;
            }
            this.app.metadataCache.offref(metadataCacheHandler);
        });

        try {
            this.renderD3Network(
                container,
                searchInput,
                tooltip,
                statusEl,
                docPanel,
                docList,
            );
        } catch {
            statusEl.setText("Error loading visualization. Please try again.");
        }
    }

    async onClose(): Promise<void> {
        this.cleanup.forEach((cleanup) => cleanup());
        this.cleanup = [];
        this.simulation = null;
        this.contentEl.empty();
    }

    public onResize(): void {
        const container = this.contentEl.querySelector(
            ".tag-network-container",
        ) as HTMLElement;
        const searchInput = this.contentEl.querySelector(
            ".tag-network-search-input",
        ) as HTMLInputElement;
        const tooltip = this.contentEl.querySelector(
            ".tag-tooltip",
        ) as HTMLElement;
        const statusEl = this.contentEl.querySelector(
            ".tag-network-status",
        ) as HTMLElement;
        const docPanel = this.contentEl.querySelector(
            ".tag-network-doc-panel",
        ) as HTMLElement;
        const docList = this.contentEl.querySelector(
            ".tag-network-doc-list",
        ) as HTMLElement;

        if (
            container &&
            searchInput &&
            tooltip &&
            statusEl &&
            docPanel &&
            docList
        ) {
            try {
                this.renderD3Network(
                    container,
                    searchInput,
                    tooltip,
                    statusEl,
                    docPanel,
                    docList,
                );
            } catch {
                // Silent fail on resize
            }
        }
    }

    private async refreshNetworkData(): Promise<void> {
        await this.tagNetworkManager.buildTagNetwork();
        this.networkData = this.tagNetworkManager.getNetworkData();
    }

    private updateForceSettings(): void {
        if (!this.simulation) return;

        this.simulation.force(
            "charge",
            d3
                .forceManyBody<SimulationNode>()
                .strength(this.forceSettings.repulsion),
        );
        this.simulation
            .force<d3.ForceLink<SimulationNode, NetworkLink>>("link")
            ?.distance(this.forceSettings.linkDistance);

        this.simulation.alpha(0.5).restart();
    }

    private getDocumentsWithTag(tagName: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        const docs: TFile[] = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter?.tags) {
                const tags = Array.isArray(cache.frontmatter.tags)
                    ? cache.frontmatter.tags
                    : [cache.frontmatter.tags];
                const normalizedTags = tags.map((t: string) =>
                    t.startsWith("#")
                        ? t.substring(1).toLowerCase()
                        : t.toLowerCase(),
                );
                if (normalizedTags.includes(tagName.toLowerCase())) {
                    docs.push(file);
                }
            }
        }

        return docs;
    }

    private renderD3Network(
        container: HTMLElement,
        searchInput: HTMLInputElement,
        tooltip: HTMLElement,
        statusEl: HTMLElement,
        docPanel: HTMLElement,
        docList: HTMLElement,
    ) {
        statusEl.setText("Rendering network...");
        container.empty();

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;

        const svg = d3
            .select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height])
            .attr("class", "tag-network-svg");

        const g = svg.append("g");

        const zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8])
            .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                g.attr("transform", event.transform.toString());
            });

        svg.call(zoom);

        const nodes: SimulationNode[] = this.networkData.nodes.map((node) => ({
            ...node,
            x: undefined,
            y: undefined,
            fx: undefined,
            fy: undefined,
        }));

        const links: NetworkLink[] = this.networkData.edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
        }));

        const simulation = d3
            .forceSimulation<SimulationNode, NetworkLink>(nodes)
            .force(
                "link",
                d3
                    .forceLink<SimulationNode, NetworkLink>(links)
                    .id((d: SimulationNode) => d.id)
                    .distance(this.forceSettings.linkDistance),
            )
            .force(
                "charge",
                d3
                    .forceManyBody<SimulationNode>()
                    .strength(this.forceSettings.repulsion),
            )
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force(
                "collision",
                d3
                    .forceCollide<SimulationNode>()
                    .radius((d: SimulationNode) => d.size + 5),
            );
        this.simulation = simulation;

        // forceLink has now replaced link source/target id strings with node references
        const resolvedLinks = links as ResolvedNetworkLink[];

        const link = g
            .append("g")
            .attr("class", "tag-network-link")
            .selectAll<SVGLineElement, ResolvedNetworkLink>("line")
            .data(resolvedLinks)
            .join("line")
            .attr("stroke-width", (d) => Math.sqrt(d.weight));

        const node = g
            .append("g")
            .selectAll<SVGCircleElement, SimulationNode>("circle")
            .data(nodes)
            .join("circle")
            .attr("class", "tag-network-node")
            .attr("r", (d: NetworkNode) => d.size)
            .attr("fill", (d: NetworkNode) => this.getNodeColor(d.frequency))
            .call(this.drag(simulation));

        const labels = g
            .append("g")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .attr("class", "tag-network-label")
            .text((d: NetworkNode) => d.label)
            .attr("dx", (d: NetworkNode) => d.size + 5)
            .attr("dy", 4);

        const handleMouseOver = (event: MouseEvent, d: SimulationNode) => {
            node.attr("opacity", (n) => {
                const isConnected = resolvedLinks.some(
                    (link) =>
                        (link.source.id === d.id && link.target.id === n.id) ||
                        (link.target.id === d.id && link.source.id === n.id),
                );
                return n === d || isConnected ? 1 : 0.2;
            });

            link.attr("stroke-opacity", (l) =>
                l.source.id === d.id || l.target.id === d.id ? 1 : 0.1,
            );

            tooltip.addClass("visible");
            tooltip.style.left = `${event.pageX + 5}px`;
            tooltip.style.top = `${event.pageY + 5}px`;

            const tooltipContent = tooltip.querySelector(
                ".tag-tooltip-content",
            ) as HTMLElement;
            if (tooltipContent) {
                const connectedNodes = resolvedLinks.filter(
                    (link) =>
                        link.source.id === d.id || link.target.id === d.id,
                ).length;

                // Use safe DOM methods instead of innerHTML to prevent XSS
                tooltipContent.empty();
                const titleDiv = tooltipContent.createDiv({
                    cls: "tag-tooltip-title",
                });
                titleDiv.textContent = d.label;
                const freqDiv = tooltipContent.createDiv({
                    cls: "tag-tooltip-info",
                });
                freqDiv.textContent = `Frequency: ${d.frequency}`;
                const connDiv = tooltipContent.createDiv({
                    cls: "tag-tooltip-info",
                });
                connDiv.textContent = `Connected to ${connectedNodes} other tags`;
            }
        };

        const handleMouseOut = () => {
            node.attr("opacity", 1);
            link.attr("stroke-opacity", 0.6);
            tooltip.removeClass("visible");
        };

        // Click handler to show documents
        const handleClick = (event: MouseEvent, d: NetworkNode) => {
            event.stopPropagation();
            const docs = this.getDocumentsWithTag(d.label);

            const titleEl = docPanel.querySelector(
                ".tag-network-doc-panel-title",
            ) as HTMLElement;
            if (titleEl) {
                titleEl.setText(
                    `${this.t.tagNetwork.documentsWithTag}: ${d.label} (${docs.length})`,
                );
            }

            docList.empty();
            if (docs.length === 0) {
                docList.createDiv({
                    text: this.t.tagNetwork.noDocuments,
                    cls: "tag-network-doc-empty",
                });
            } else {
                for (const doc of docs) {
                    const docItem = docList.createDiv({
                        cls: "tag-network-doc-item",
                    });
                    docItem.createSpan({ text: doc.basename });
                    docItem.addEventListener("click", () => {
                        this.app.workspace
                            .openLinkText(doc.path, "", false)
                            .catch((error) =>
                                console.error("Error opening document:", error),
                            );
                    });
                }
            }

            docPanel.removeClass("tag-network-doc-panel-hidden");
        };

        node.on("mouseover", handleMouseOver)
            .on("mouseout", handleMouseOut)
            .on("click", handleClick);

        const handleSearch = () => {
            const searchTerm = searchInput.value.toLowerCase();

            if (searchTerm.length > 0) {
                node.attr("opacity", (d: NetworkNode) =>
                    d.label.toLowerCase().includes(searchTerm) ? 1 : 0.2,
                );

                link.attr("stroke-opacity", (l) => {
                    const sourceMatches = l.source.label
                        .toLowerCase()
                        .includes(searchTerm);
                    const targetMatches = l.target.label
                        .toLowerCase()
                        .includes(searchTerm);
                    return sourceMatches && targetMatches ? 1 : 0.1;
                });
            } else {
                node.attr("opacity", 1);
                link.attr("stroke-opacity", 0.6);
            }
        };

        searchInput.addEventListener("input", handleSearch);
        this.cleanup.push(() =>
            searchInput.removeEventListener("input", handleSearch),
        );

        simulation.on("tick", () => {
            link.attr("x1", (d) => d.source.x ?? null)
                .attr("y1", (d) => d.source.y ?? null)
                .attr("x2", (d) => d.target.x ?? null)
                .attr("y2", (d) => d.target.y ?? null);

            node.attr("cx", (d) => d.x ?? null).attr("cy", (d) => d.y ?? null);

            labels.attr("x", (d) => d.x ?? null).attr("y", (d) => d.y ?? null);
        });

        this.cleanup.push(() => {
            if (this.simulation) {
                this.simulation.stop();
            }
        });
        statusEl.hide();
    }

    private drag(simulation: d3.Simulation<SimulationNode, NetworkLink>) {
        function dragstarted(
            event: d3.D3DragEvent<
                SVGCircleElement,
                SimulationNode,
                SimulationNode
            >,
        ) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(
            event: d3.D3DragEvent<
                SVGCircleElement,
                SimulationNode,
                SimulationNode
            >,
        ) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(
            event: d3.D3DragEvent<
                SVGCircleElement,
                SimulationNode,
                SimulationNode
            >,
        ) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        return d3
            .drag<SVGCircleElement, SimulationNode, SimulationNode>()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    private getNodeColor(frequency: number, opacity: number = 1): string {
        const minFreq = 1;
        const maxFreq = Math.max(
            ...this.networkData.nodes.map((n) => n.frequency),
        );
        // Prevent division by zero when all nodes have the same frequency
        const range = maxFreq - minFreq;
        const normalizedFreq = range > 0 ? (frequency - minFreq) / range : 0;

        const r = Math.floor(100 - normalizedFreq * 100);
        const g = Math.floor(149 - normalizedFreq * 100);
        const b = Math.floor(237 - normalizedFreq * 50);

        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
}
