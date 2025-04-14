/**
 * Enhanced statistical utilities for more robust benchmarking
 */
import { performance } from 'perf_hooks';
import { EnhancedStatsResult, BenchmarkFunction } from '~/types';
import { forceGc } from '~/core';

/**
 * Calculate enhanced statistics with outlier detection and confidence intervals
 */
export function calculateEnhancedStats(values: number[]): EnhancedStatsResult {
    if (values.length === 0) {
        throw new Error('Cannot calculate stats for empty array');
    }

    // Remove outliers for more accurate statistics
    const { cleanValues, outliers } = detectOutliers(values);

    // Calculate basic statistics
    const sorted = [...cleanValues].sort((a, b) => a - b);
    const mean = cleanValues.reduce((sum, val) => sum + val, 0) / cleanValues.length;
    const min = Math.min(...cleanValues);
    const max = Math.max(...cleanValues);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Calculate standard deviation
    const variance = cleanValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / cleanValues.length;
    const stdDev = Math.sqrt(variance);

    // Calculate 95% confidence interval
    const confidenceInterval = calculateConfidenceInterval(cleanValues, mean, stdDev);

    // Calculate relative margin of error (as percentage)
    const marginOfError = (confidenceInterval.upper - confidenceInterval.lower) / 2;
    const relativeMarginOfError = (marginOfError / mean) * 100;

    // Calculate skewness and kurtosis for distribution shape
    const skewness = calculateSkewness(cleanValues, mean, stdDev);
    const kurtosis = calculateKurtosis(cleanValues, mean, stdDev);

    return {
        mean,
        median,
        min,
        max,
        standardDeviation: stdDev,
        confidenceInterval95: confidenceInterval,
        relativeMarginOfError,
        outliers,
        skewness,
        kurtosis
    };
}

/**
 * Detect outliers using the modified Z-score method
 * More robust than simple IQR method
 */
export function detectOutliers(values: number[]): {
    cleanValues: number[];
    outliers: { mild: number[]; extreme: number[] }
} {
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Calculate median absolute deviation (MAD)
    const absoluteDeviations = values.map(val => Math.abs(val - median));
    const mad = absoluteDeviations.sort((a, b) => a - b)[Math.floor(absoluteDeviations.length / 2)];

    // Constants for outlier detection
    const MILD_THRESHOLD = 3.5;  // Modified z-score threshold for mild outliers
    const EXTREME_THRESHOLD = 5.0;  // Modified z-score threshold for extreme outliers

    const mildOutliers: number[] = [];
    const extremeOutliers: number[] = [];
    const cleanValues: number[] = [];

    // Detect outliers using modified Z-score
    values.forEach(value => {
        // Modified Z-score = 0.6745 * (value - median) / MAD
        // 0.6745 is a constant derived from the normal distribution
        const modifiedZScore = mad === 0 ? 0 : Math.abs(0.6745 * (value - median) / mad);

        if (modifiedZScore > EXTREME_THRESHOLD) {
            extremeOutliers.push(value);
        } else if (modifiedZScore > MILD_THRESHOLD) {
            mildOutliers.push(value);
        } else {
            cleanValues.push(value);
        }
    });

    // If we've removed too many values, revert to original set
    if (cleanValues.length < values.length * 0.5) {
        return {
            cleanValues: values,
            outliers: { mild: [], extreme: [] }
        };
    }

    return {
        cleanValues,
        outliers: {
            mild: mildOutliers,
            extreme: extremeOutliers
        }
    };
}

/**
 * Calculate 95% confidence interval
 */
export function calculateConfidenceInterval(
    values: number[],
    mean: number,
    stdDev: number
): { lower: number; upper: number } {
    // For small samples, we should use t-distribution, but for simplicity
    // we'll use the normal distribution approximation with Z=1.96 for 95% CI
    const Z = 1.96;  // Z-score for 95% confidence level
    const marginOfError = Z * (stdDev / Math.sqrt(values.length));

    return {
        lower: mean - marginOfError,
        upper: mean + marginOfError
    };
}

/**
 * Calculate skewness to determine distribution symmetry
 * Positive = right-skewed, Negative = left-skewed, 0 = symmetric
 */
export function calculateSkewness(values: number[], mean: number, stdDev: number): number {
    if (values.length < 3 || stdDev === 0) return 0;

    const cubedDeviations = values.map(val => Math.pow((val - mean) / stdDev, 3));
    const sumCubedDeviations = cubedDeviations.reduce((sum, val) => sum + val, 0);

    // Adjust for sample bias
    const n = values.length;
    const biasAdjustment = n / ((n - 1) * (n - 2));

    return biasAdjustment * sumCubedDeviations;
}

/**
 * Calculate kurtosis to measure "tailedness" of distribution
 * Higher values = heavier tails, more outlier-prone
 */
export function calculateKurtosis(values: number[], mean: number, stdDev: number): number {
    if (values.length < 4 || stdDev === 0) return 0;

    const fourthPowerDeviations = values.map(val => Math.pow((val - mean) / stdDev, 4));
    const sumFourthPowerDeviations = fourthPowerDeviations.reduce((sum, val) => sum + val, 0);

    // Adjust for sample bias
    const n = values.length;
    const biasAdjustment = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
    const biasCorrection = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));

    return biasAdjustment * sumFourthPowerDeviations - biasCorrection;
}

/**
 * Calculate coefficient of variation (CV)
 * Good for comparing variability between different benchmarks
 */
export function calculateCV(mean: number, stdDev: number): number {
    if (mean === 0) return 0;
    return (stdDev / mean) * 100; // as percentage
}

/**
 * Auto-calibrate the optimal number of iterations for benchmark stability
 */
export function findIterationsForStatisticalStability(
    benchmarkFn: BenchmarkFunction,
    targetRSD: number = 2.0, // target relative standard deviation (%)
    initialIterations: number = 1000,
    maxIterations: number = 10_000_000,
    minSamples: number = 5
): number {
    let iterations = initialIterations;
    let samples: number[] = [];
    let rsd = Infinity;

    while (iterations <= maxIterations) {
        const start = performance.now();
        benchmarkFn();
        const duration = performance.now() - start;

        samples.push(duration);

        if (samples.length >= minSamples) {
            const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
            const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
            const stdDev = Math.sqrt(variance);

            rsd = (stdDev / mean) * 100;

            if (rsd <= targetRSD) {
                return iterations;
            }
        }

        // Increase iterations exponentially to find optimal value faster
        iterations = Math.min(iterations * 2, maxIterations);

        // Reset samples if we've changed the iteration count significantly
        if (iterations > initialIterations * 4) {
            samples = [];
        }

        // Force garbage collection if available
        forceGc();
    }

    return maxIterations; // If we couldn't calibrate, return max iterations
}

/**
 * Calculate memory usage delta between two snapshots
 */
export function calculateMemoryDelta(
    initialMemory: NodeJS.MemoryUsage,
    finalMemory: NodeJS.MemoryUsage): NodeJS.MemoryUsage {
    return {
        rss: finalMemory.rss - initialMemory.rss,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        external: finalMemory.external - initialMemory.external,
        arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers
    };
}