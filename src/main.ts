/**
 * @fuzzy-street/benchmarks
 * 
 * A comprehensive benchmarking framework for JavaScript/TypeScript
 */

// Core functionality
export type * from '~/types';
export * from '~/core';

// Statistics utilities
export * from '~/stats-utils';

// Adaptive benchmarking
export * from '~/adaptive';

// Hardware monitoring
export * from '~/monitoring';

// Process isolation
export * from '~/process-isolation';

// Visualization
export * from '~/visulisations';

// Re-export common functionality under simpler names for convenience
import { runBenchmark, compareBenchmarks } from '~/core';
import { runAdaptiveBenchmark, compareAdaptiveBenchmarks } from '~/adaptive';
import { runMonitoredBenchmark } from '~/monitoring';
import { runIsolatedBenchmark } from '~/process-isolation';
import { calculateEnhancedStats } from '~/stats-utils';
import { generateReport, saveReport } from '~/visulisations';

export {
    runBenchmark,
    compareBenchmarks,
    runAdaptiveBenchmark,
    compareAdaptiveBenchmarks,
    runMonitoredBenchmark,
    runIsolatedBenchmark,
    calculateEnhancedStats,
    generateReport,
    saveReport
};
