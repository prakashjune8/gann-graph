/**
 * W.D. Gann Drafting Desk — Data Display Execution Subsystem
 * Module: src/modules/data-display/index.ts
 *
 * Dedicated subsystem for querying, aggregating, formatting, and coordinating
 * how market data from the DuckDB vault, CSV uploads, or active trading feeds
 * is prepared and displayed on the Gann chart.
 */

export * from "./DisplayTypes";
export * from "./DisplaySeriesFormatter";
export * from "./TimeframeAggregator";
export * from "./VaultQueryBridge";
export * from "./DataDisplayCoordinator";
export * from "./DataDisplayModule";
