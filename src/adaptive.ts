/**
 * Adaptive benchmarking with auto-calibration
 */
import { performance } from 'perf_hooks';
import {
  AdaptiveBenchmarkOptions,
  AdaptiveBenchmarkResult,
  BenchmarkFunction,
  BenchmarkResult
} from '~/types';
import { runBenchmark, calculateStats, forceGc } from '~/core';

/**
 * Default adaptive benchmark options
 */
const DEFAULT_ADAPTIVE_OPTIONS: AdaptiveBenchmarkOptions = {
  minIterations: 1000,
  maxIterations: 10_000_000,
  targetDuration: 500, // 500ms is a good target for stable measurements
  maxTime: 30000, // 30 seconds maximum
  targetRSD: 2.0, // 2% target relative standard deviation
  minSamples: 5,
  maxSamples: 100,
  warmupRatio: 0.1, // Use 10% of initial iterations for warmup
  adaptiveSteps: 4
};

/**
 * Auto-calibrate the optimal number of iterations for a function
 */
export function findIterationsForTargetDuration(
  benchmarkFn: BenchmarkFunction,
  options: AdaptiveBenchmarkOptions = {}
): number {
  const opts = { ...DEFAULT_ADAPTIVE_OPTIONS, ...options };

  // Perform warmup to allow JIT compilation
  let warmupIterations = Math.max(100, Math.floor((opts.minIterations || 1000) * (opts.warmupRatio || 0.1)));
  runWarmup(benchmarkFn, warmupIterations);

  // Initial calibration with minimum iterations
  let iterations = opts.minIterations || 1000;
  let duration = measureDuration(benchmarkFn, iterations);

  // Calculate iterations needed to hit target duration
  const iterationsPerMs = iterations / duration;
  iterations = Math.floor(iterationsPerMs * (opts.targetDuration || 500));

  // Clamp to min/max range
  iterations = Math.max(
    opts.minIterations || 1000,
    Math.min(opts.maxIterations || 10_000_000, iterations)
  );

  // Verify our calculation with another run
  duration = measureDuration(benchmarkFn, iterations);

  // If we're still far from target duration, adjust again
  if (Math.abs(duration - (opts.targetDuration || 500)) > (opts.targetDuration || 500) * 0.2) {
    const adjustmentFactor = (opts.targetDuration || 500) / duration;
    iterations = Math.floor(iterations * adjustmentFactor);
    iterations = Math.max(
      opts.minIterations || 1000,
      Math.min(opts.maxIterations || 10_000_000, iterations)
    );
  }

  return iterations;
}

/**
 * Run a warmup phase
 */
function runWarmup(fn: BenchmarkFunction, iterations: number): void {
  if (iterations <= 0) return;

  // Force GC before warmup if available
  forceGc();

  // Run the function for the specified iterations
  for (let i = 0; i < iterations; i++) {
    fn();
  }

  // Force GC after warmup if available
  forceGc();
}

/**
 * Measure the duration of running a function multiple times
 */
function measureDuration(fn: BenchmarkFunction, iterations: number): number {
  // Force GC before measurement if available
  forceGc();

  const start = performance.now();

  // Run the function for the specified iterations
  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const end = performance.now();
  return end - start;
}

/**
 * Run an adaptive benchmark that automatically adjusts iterations
 * to achieve stable results
 */
export function runAdaptiveBenchmark<T>(
  benchmarkFn: () => T,
  options: AdaptiveBenchmarkOptions = {}
): AdaptiveBenchmarkResult<T> {
  const opts = { ...DEFAULT_ADAPTIVE_OPTIONS, ...options };

  // Initial state
  let iterations = findIterationsForTargetDuration(benchmarkFn, opts);

  const initialIterations = iterations;
  let currentStep = 1;
  const startTime = performance.now();
  const samples: BenchmarkResult<T>[] = [];
  let adjustmentSteps = 0;
  let relativeStandardDeviation = Infinity;

  // Run warmup if specified
  for (let i = 0; i < (opts.warmupRuns || 1); i++) {
    runWarmup(benchmarkFn, iterations);
  }

  // Main adaptive benchmark loop
  while (
    samples.length < (opts.minSamples || 5) ||
    (relativeStandardDeviation > (opts.targetRSD || 2.0) &&
      samples.length < (opts.maxSamples || 100) &&
      performance.now() - startTime < (opts.maxTime || 30000))
  ) {
    // Run the benchmark with current iteration count
    const result = runBenchmark(benchmarkFn, { iterations });
    samples.push(result);

    // Calculate statistics on the collected samples
    if (samples.length >= 3) {
      const durations = samples.map(sample => sample.duration);
      const stats = calculateStats(durations);
      relativeStandardDeviation = (stats.standardDeviation / stats.mean) * 100;

      // Adjust iterations if needed
      if (currentStep <= (opts.adaptiveSteps || 4) && relativeStandardDeviation > (opts.targetRSD || 2.0)) {
        // If variance is high, increase iterations to get more stable results
        iterations = Math.min(
          opts.maxIterations || 10_000_000,
          Math.floor(iterations * 1.5)
        );
        currentStep++;
        adjustmentSteps++;

        // When increasing iterations significantly, clear previous samples
        // as they're no longer comparable
        if (iterations > initialIterations * 2) {
          samples.length = 0;
        }
      }
    }

    // Check if we've spent too much time
    if (performance.now() - startTime > (opts.maxTime || 30000)) {
      console.warn('Adaptive benchmark exceeded maximum time limit');
      break;
    }
  }

  // Calculate final statistics
  const durations = samples.map(sample => sample.duration);
  const durationStats = calculateStats(durations);

  // Get the last result for the generic type
  const lastResult = samples[samples.length - 1].result;

  // Combine results from all samples
  const combinedResult: AdaptiveBenchmarkResult<T> = {
    duration: durationStats.mean,
    iterations,
    operationsPerSecond: iterations / (durationStats.mean / 1000),
    memoryDelta: {
      heapUsed: samples.reduce((sum, s) => sum + s.memoryDelta.heapUsed, 0) / samples.length,
      heapTotal: samples.reduce((sum, s) => sum + s.memoryDelta.heapTotal, 0) / samples.length,
      rss: samples.reduce((sum, s) => sum + s.memoryDelta.rss, 0) / samples.length,
      external: samples.reduce((sum, s) => sum + s.memoryDelta.external, 0) / samples.length
    },
    result: lastResult,
    calibration: {
      initialIterations,
      finalIterations: iterations,
      samples: samples.length,
      relativeStandardDeviation,
      adjustmentSteps,
      timeSpent: performance.now() - startTime
    }
  };

  return combinedResult;
}

/**
 * Compare two functions using adaptive benchmarking
 */
export function compareAdaptiveBenchmarks<T, U>(
  benchmarkA: { name: string; fn: () => T },
  benchmarkB: { name: string; fn: () => U },
  options: AdaptiveBenchmarkOptions = {}
): {
  resultA: AdaptiveBenchmarkResult<T>;
  resultB: AdaptiveBenchmarkResult<U>;
  comparison: {
    timeRatio: number;
    opsRatio: number;
    memoryRatio: number;
    fasterName: string;
    percentFaster: number;
  }
} {
  // Run both benchmarks
  const resultA = runAdaptiveBenchmark(benchmarkA.fn, options);
  const resultB = runAdaptiveBenchmark(benchmarkB.fn, options);

  // Calculate ratios
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
 * Run multiple adaptive benchmarks and generate a comparison report
 */
export function runMultipleAdaptiveBenchmarks<T>(
  benchmarks: Array<{ name: string; fn: () => T }>,
  options: AdaptiveBenchmarkOptions = {}
): {
  results: Record<string, AdaptiveBenchmarkResult<T>>;
  comparisons: Array<{
    benchmarkA: string;
    benchmarkB: string;
    timeRatio: number;
    fasterName: string;
    percentFaster: number;
  }>;
  fastest: string;
  slowest: string;
} {
  // Run all benchmarks
  const results: Record<string, AdaptiveBenchmarkResult<T>> = {};
  for (const benchmark of benchmarks) {
    results[benchmark.name] = runAdaptiveBenchmark(benchmark.fn, options);
  }

  // Generate all pairwise comparisons
  const comparisons: Array<{
    benchmarkA: string;
    benchmarkB: string;
    timeRatio: number;
    fasterName: string;
    percentFaster: number;
  }> = [];

  const benchmarkNames = Object.keys(results);
  for (let i = 0; i < benchmarkNames.length; i++) {
    for (let j = i + 1; j < benchmarkNames.length; j++) {
      const benchmarkA = benchmarkNames[i];
      const benchmarkB = benchmarkNames[j];

      const timeRatio = results[benchmarkA].duration / results[benchmarkB].duration;
      const fasterName = timeRatio > 1 ? benchmarkB : benchmarkA;
      const percentFaster = timeRatio > 1
        ? ((timeRatio - 1) * 100)  // B is faster
        : ((1 / timeRatio - 1) * 100);  // A is faster

      comparisons.push({
        benchmarkA,
        benchmarkB,
        timeRatio,
        fasterName,
        percentFaster
      });
    }
  }

  // Find fastest and slowest
  let fastest = benchmarkNames[0];
  let slowest = benchmarkNames[0];

  for (let i = 1; i < benchmarkNames.length; i++) {
    const name = benchmarkNames[i];
    if (results[name].duration < results[fastest].duration) {
      fastest = name;
    }
    if (results[name].duration > results[slowest].duration) {
      slowest = name;
    }
  }

  return {
    results,
    comparisons,
    fastest,
    slowest
  };
}
