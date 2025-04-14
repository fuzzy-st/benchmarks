/**
 * Core benchmarking utilities
 */
import { performance } from 'perf_hooks';
import * as v8 from 'v8';
import {
    BenchmarkFunction,
    BenchmarkOptions,
    BenchmarkResult,
    MemoryDelta,
    MemorySnapshot,
    StatsResult
} from './types';

/**
 * Default benchmark options
 */
const DEFAULT_OPTIONS: BenchmarkOptions = {
    iterations: 100_000,
    runs: 1,
    warmupRuns: 0,
    gcBetweenRuns: true
};

/**
 * Get a snapshot of current memory usage
 */
export function getMemorySnapshot(): MemorySnapshot {
    const memoryUsage = process.memoryUsage();
    return {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
    };
}

/**
 * Format memory usage value to human-readable string
 */
export function formatMemoryUsage(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Get V8 heap statistics
 */
export function getV8HeapStats() {
    const stats = v8.getHeapStatistics();
    return {
        totalHeapSize: stats.total_heap_size,
        usedHeapSize: stats.used_heap_size,
        heapSizeLimit: stats.heap_size_limit,
        mallocedMemory: stats.malloced_memory
    };
}

/**
 * Force garbage collection if available
 * Requires running Node with --expose-gc flag
 */
export function forceGc(): void {
    if (typeof global.gc === 'function') {
        global.gc();
    }
}

/**
 * Calculate memory delta between two snapshots
 */
function calculateMemoryDelta(
    before: MemorySnapshot,
    after: MemorySnapshot
): MemoryDelta {
    return {
        heapUsed: after.heapUsed - before.heapUsed,
        heapTotal: after.heapTotal - before.heapTotal,
        rss: after.rss - before.rss,
        external: after.external - before.external
    };
}

/**
 * Run a benchmark function with timing and memory tracking
 */
export function runBenchmark<T>(
    benchmarkFn: BenchmarkFunction<T>,
    options: BenchmarkOptions = {}
): BenchmarkResult<T> {
    // Merge default options with provided options
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Force garbage collection before benchmark if possible
    if (opts.gcBetweenRuns) {
        forceGc();
    }

    // Perform warmup runs if specified
    for (let i = 0; i < (opts.warmupRuns || 0); i++) {
        benchmarkFn();
        if (opts.gcBetweenRuns) {
            forceGc();
        }
    }

    // Take initial measurements
    const initialMemory = getMemorySnapshot();
    const startTime = performance.now();

    // Run the actual benchmark
    let result: T | undefined;
    for (let i = 0; i < (opts.iterations || 1); i++) {
        result = benchmarkFn();
    }

    // Take final measurements
    const endTime = performance.now();
    const finalMemory = getMemorySnapshot();

    // Calculate metrics
    const duration = endTime - startTime;
    const memoryDelta = calculateMemoryDelta(initialMemory, finalMemory);
    const iterations = opts.iterations || 1;
    const operationsPerSecond = (iterations / duration) * 1000;

    return {
        duration,
        iterations,
        operationsPerSecond,
        memoryDelta,
        result
    };
}

/**
 * Calculate statistics from an array of numeric values
 */
export function calculateStats(values: number[]): StatsResult {
    if (values.length === 0) {
        throw new Error('Cannot calculate stats for empty array');
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Calculate standard deviation
    const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
        mean,
        median,
        min,
        max,
        standardDeviation: stdDev
    };
}

/**
 * Run multiple benchmark iterations and gather statistics
 */
export function runMultipleBenchmarks<T>(
    benchmarkFn: BenchmarkFunction<T>,
    options: BenchmarkOptions = {}
): { runs: BenchmarkResult<T>[]; stats: Record<string, StatsResult> } {
    // Merge default options with provided options
    const opts = {
        ...DEFAULT_OPTIONS,
        ...options,
        runs: options.runs || 5
    };

    // Run the benchmark multiple times
    const runs: BenchmarkResult<T>[] = [];

    for (let i = 0; i < opts.runs; i++) {
        const result = runBenchmark(benchmarkFn, {
            ...opts,
            warmupRuns: i === 0 ? opts.warmupRuns : 0 // Only do warmup on first run
        });
        runs.push(result);

        if (opts.gcBetweenRuns) {
            forceGc();
        }
    }

    // Gather statistics
    const stats = {
        duration: calculateStats(runs.map(r => r.duration)),
        operationsPerSecond: calculateStats(runs.map(r => r.operationsPerSecond)),
        memoryUsed: calculateStats(runs.map(r => r.memoryDelta.heapUsed / (1024 * 1024)))
    };

    return { runs, stats };
}

/**
 * Compare two benchmark functions and report relative performance
 */
export function compareBenchmarks<T, U>(
    benchmarkA: { name: string; fn: BenchmarkFunction<T> },
    benchmarkB: { name: string; fn: BenchmarkFunction<U> },
    options: BenchmarkOptions = {}
): {
    resultA: BenchmarkResult<T>;
    resultB: BenchmarkResult<U>;
    comparison: {
        timeRatio: number;
        opsRatio: number;
        memoryRatio: number;
        fasterName: string;
        percentFaster: number;
    };
} {
    const resultA = runBenchmark(benchmarkA.fn, options);
    const resultB = runBenchmark(benchmarkB.fn, options);

    const timeRatio = resultA.duration / resultB.duration;
    const opsRatio = resultB.operationsPerSecond / resultA.operationsPerSecond;
    const memoryRatio = resultA.memoryDelta.heapUsed / resultB.memoryDelta.heapUsed;

    // Determine which is faster
    const fasterName = timeRatio > 1 ? benchmarkB.name : benchmarkA.name;
    const percentFaster = timeRatio > 1
        ? ((timeRatio - 1) * 100)  // B is faster
        : ((1 / timeRatio - 1) * 100);  // A is faster

    return {
        resultA,
        resultB,
        comparison: {
            timeRatio,
            opsRatio,
            memoryRatio,
            fasterName,
            percentFaster
        }
    };
}

/**
 * Run a function with execution time reporting
 */
export function runWithTimer<T>(name: string, fn: () => T): T {
    console.log(`Starting: ${name}`);
    const startTime = performance.now();

    const result = fn();

    const endTime = performance.now();
    console.log(`Completed: ${name} in ${(endTime - startTime).toFixed(2)}ms`);

    return result;
}

/**
 * Memory-efficient batch processing generator
 */
export function* batchGenerator<T>(items: T[], batchSize = 1_000_000): Generator<T[]> {
    for (let i = 0; i < items.length; i += batchSize) {
        yield items.slice(i, i + batchSize);
    }
}

/**
 * Process items in batches with optional GC between batches
 */
export function processInBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => R[],
    batchSize = 1_000_000,
    gcBetweenBatches = true
): R[] {
    const results: R[] = [];

    for (const batch of batchGenerator(items, batchSize)) {
        const batchResults = processor(batch);
        results.push(...batchResults);

        // Force garbage collection between batches if enabled
        if (gcBetweenBatches) {
            forceGc();
        }
    }

    return results;
}

/**
 * Print detailed memory usage information
 */
export function printMemoryReport(): void {
    const memoryUsage = getMemorySnapshot();
    const v8Stats = getV8HeapStats();

    console.log(Array.from({ length: 25 }, () => '-').join(''));
    console.log('Memory Usage Report:');
    console.log(Array.from({ length: 25 }, () => '-').join(''));
    console.log(`Heap Used: ${formatMemoryUsage(memoryUsage.heapUsed)}`);
    console.log(`Heap Total: ${formatMemoryUsage(memoryUsage.heapTotal)}`);
    console.log(`RSS: ${formatMemoryUsage(memoryUsage.rss)}`);
    console.log(`External: ${formatMemoryUsage(memoryUsage.external)}`);
    if (memoryUsage.arrayBuffers) {
        console.log(`ArrayBuffers: ${formatMemoryUsage(memoryUsage.arrayBuffers)}`);
    }
    console.log("\n");
    console.log(Array.from({ length: 25 }, () => '-').join(''));
    console.log('V8 Heap Statistics:');
    console.log(Array.from({ length: 25 }, () => '-').join(''));
    console.log(`Total Heap Size: ${formatMemoryUsage(v8Stats.totalHeapSize)}`);
    console.log(`Used Heap Size: ${formatMemoryUsage(v8Stats.usedHeapSize)}`);
    console.log(`Heap Size Limit: ${formatMemoryUsage(v8Stats.heapSizeLimit)}`);
    console.log(`Malloced Memory: ${formatMemoryUsage(v8Stats.mallocedMemory)}`);

    // Force garbage collection and check memory again
    console.log("\n");
    console.log(Array.from({ length: 25 }, () => '-').join(''));
    console.log('After Garbage Collection:');
    console.log(Array.from({ length: 25 }, () => '-').join(''));
    forceGc();

    const afterGCUsage = getMemorySnapshot();
    console.log(`Heap Used: ${formatMemoryUsage(afterGCUsage.heapUsed)}`);
    console.log("\n");
    console.log(`Memory Freed: ${formatMemoryUsage(memoryUsage.heapUsed - afterGCUsage.heapUsed)}`);
}
