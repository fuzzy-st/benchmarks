/**
 * Core type definitions for the benchmarking framework
 */

/**
 * Basic benchmark options
 */
export interface BenchmarkOptions {
  /** Number of iterations to run in each benchmark */
  iterations?: number;
  /** Number of separate benchmark runs for statistical analysis */
  runs?: number;
  /** Number of warmup runs to perform before benchmarking */
  warmupRuns?: number;
  /** Whether to force garbage collection between runs */
  gcBetweenRuns?: boolean;
}

/**
 * Memory delta measurements
 */
export interface MemoryDelta {
  /** Change in heap memory used (bytes) */
  heapUsed: number;
  /** Change in total heap size (bytes) */
  heapTotal: number;
  /** Change in resident set size (bytes) */
  rss: number;
  /** Change in external memory usage (bytes) */
  external: number;
}

/**
 * Core benchmark result
 */
export interface BenchmarkResult<T = any> {
  /** Total duration of the benchmark in milliseconds */
  duration: number;
  /** Number of iterations performed */
  iterations: number;
  /** Operations per second (iterations / (duration / 1000)) */
  operationsPerSecond: number;
  /** Memory usage changes during the benchmark */
  memoryDelta: MemoryDelta;
  /** Result of the benchmark function execution */
  result?: T;
  /** Custom benchmark-specific metrics */
  [key: string]: any;
}

/**
 * Statistical analysis result
 */
export interface StatsResult {
  /** Average value */
  mean: number;
  /** Middle value when sorted */
  median: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Standard deviation */
  standardDeviation: number;
}

/**
 * Enhanced statistics with confidence intervals and outlier detection
 */
export interface EnhancedStatsResult extends StatsResult {
  /** 95% confidence interval */
  confidenceInterval95: {
    lower: number;
    upper: number;
  };
  /** Relative margin of error as percentage */
  relativeMarginOfError: number;
  /** Detected outliers */
  outliers: {
    /** Mildly anomalous values */
    mild: number[];
    /** Extremely anomalous values */
    extreme: number[];
  };
  /** Skewness (measure of distribution asymmetry) */
  skewness: number;
  /** Kurtosis (measure of "tailedness") */
  kurtosis: number;
}

/**
 * Memory snapshot for tracking resource usage
 */
export interface MemorySnapshot {
  /** Heap memory used (bytes) */
  heapUsed: number;
  /** Total heap size (bytes) */
  heapTotal: number;
  /** Resident set size (bytes) */
  rss: number;
  /** External memory usage (bytes) */
  external: number;
  /** ArrayBuffer memory usage (bytes) */
  arrayBuffers?: number;
}

/**
 * System resource usage snapshot
 */
export interface SystemResourceSnapshot {
  /** Timestamp when the snapshot was taken */
  timestamp: number;
  /** CPU usage by the current process */
  cpuUsage: {
    /** User CPU time (microseconds) */
    user: number;
    /** System CPU time (microseconds) */
    system: number;
  };
  /** Memory usage by the current process */
  memoryUsage: MemorySnapshot;
  /** System-wide memory information */
  systemMemory: {
    /** Total physical memory (bytes) */
    total: number;
    /** Free physical memory (bytes) */
    free: number;
    /** Used physical memory (bytes) */
    used: number;
  };
  /** System-wide CPU information */
  systemCpu: {
    /** Load averages for 1, 5, and 15 minutes */
    loadAvg: number[];
    /** CPU time breakdown */
    cpuTimes: {
      /** User CPU time */
      user: number;
      /** System CPU time */
      system: number;
      /** Idle CPU time */
      idle: number;
    };
  };
  /** Current process information */
  processInfo: {
    /** Process ID */
    pid: number;
    /** Process uptime (seconds) */
    uptime: number;
    /** Process priority (nice value) */
    priority: number;
  };
}

/**
 * Configuration for isolated benchmarks
 */
export interface IsolatedBenchmarkOptions extends BenchmarkOptions {
  /** Use worker threads instead of child processes */
  useWorkerThreads?: boolean;
  /** Number of processes/threads to use */
  processCount?: number;
  /** Attempt to prioritize the benchmark process */
  prioritize?: boolean;
  /** Try to isolate to a specific CPU core (Linux only) */
  isolateCPU?: boolean;
  /** Perform warmup in the isolated process */
  warmup?: boolean;
}

/**
 * Hardware monitoring options
 */
export interface HardwareMonitoringOptions extends BenchmarkOptions {
  /** Monitor CPU usage */
  monitorCpu?: boolean;
  /** Monitor memory usage */
  monitorMemory?: boolean;
  /** Interval between monitoring samples (ms) */
  samplingInterval?: number;
  /** Track system-wide metrics vs just process metrics */
  trackSystemWide?: boolean;
  /** Try to detect thermal throttling */
  detectThermalThrottling?: boolean;
  /** Collect performance counters if available */
  collectPerfCounters?: boolean;
  /** Generate CPU heatmap */
  generateHeatmap?: boolean;
}

/**
 * Hardware monitoring benchmark result
 */
export interface HardwareMonitoredResult<T = any> extends BenchmarkResult<T> {
  /** Hardware-specific metrics collected during benchmarking */
  hardwareMetrics: {
    /** Resource snapshots taken during benchmark execution */
    snapshots: SystemResourceSnapshot[];
    /** Summary statistics of hardware metrics */
    summary: {
      /** CPU utilization statistics */
      cpuUtilization: {
        min: number;
        max: number;
        avg: number;
      };
      /** Memory utilization statistics */
      memoryUtilization: {
        min: number;
        max: number;
        avg: number;
      };
      /** System load averages */
      systemLoad: {
        before: number[];
        after: number[];
        delta: number[];
      };
      /** Whether thermal throttling was detected */
      thermalThrottling?: boolean;
      /** Performance counters if collected */
      perfCounters?: Record<string, number>;
    };
  };
}

/**
 * Configuration for adaptive benchmarks
 */
export interface AdaptiveBenchmarkOptions extends BenchmarkOptions {
  /** Minimum iterations to run */
  minIterations?: number;
  /** Maximum iterations to run */
  maxIterations?: number;
  /** Target duration in milliseconds */
  targetDuration?: number;
  /** Maximum time to spend benchmarking (ms) */
  maxTime?: number;
  /** Target relative standard deviation (%) */
  targetRSD?: number;
  /** Minimum number of samples to collect */
  minSamples?: number;
  /** Maximum number of samples to collect */
  maxSamples?: number;
  /** Ratio of iterations to use for warmup */
  warmupRatio?: number;
  /** Number of steps for iteration adjustment */
  adaptiveSteps?: number;
}

/**
 * Result from adaptive benchmarking
 */
export interface AdaptiveBenchmarkResult<T = any> extends BenchmarkResult<T> {
  /** Calibration information */
  calibration: {
    /** Starting iteration count */
    initialIterations: number;
    /** Final iteration count after calibration */
    finalIterations: number;
    /** Number of samples collected */
    samples: number;
    /** Final relative standard deviation achieved */
    relativeStandardDeviation: number;
    /** Number of times iterations were adjusted */
    adjustmentSteps: number;
    /** Total time spent (ms) */
    timeSpent: number;
  };
}

/**
 * Report formatting options
 */
export enum ReportFormat {
  CONSOLE = 'console',
  JSON = 'json',
  HTML = 'html',
  CSV = 'csv',
  MARKDOWN = 'markdown'
}

/**
 * Report generation options
 */
export interface ReportOptions {
  /** Output format */
  format?: ReportFormat;
  /** Path to save the report */
  outputPath?: string;
  /** Report title */
  title?: string;
  /** Include timestamp in report */
  includeTimestamp?: boolean;
  /** Include summary statistics */
  includeSummary?: boolean;
  /** Include system information */
  includeSystemInfo?: boolean;
  /** Use colors in console output */
  colorOutput?: boolean;
}

/**
 * Benchmark report item
 */
export interface BenchmarkReportItem {
  /** Benchmark name */
  name: string;
  /** Benchmark results */
  results: BenchmarkResult;
  /** Optional statistics */
  stats?: EnhancedStatsResult;
}

/**
 * Comprehensive benchmark configuration
 */
export interface EnhancedBenchmarkConfig<T = any> {
  /** Benchmark name */
  name: string;
  /** Optional description */
  description?: string;
  /** Benchmark function */
  fn: () => T;
  /** Stringified code for isolated execution */
  code?: string;
  /** Tags for categorization */
  tags?: string[];
  
  /** Basic benchmark options */
  options?: BenchmarkOptions;
  /** Use adaptive benchmarking */
  adaptive?: boolean;
  /** Use process isolation */
  isolated?: boolean;
  /** Use hardware monitoring */
  monitored?: boolean;
  
  /** Auto-calibrate iteration count */
  autoCalibrate?: boolean;
  /** Number of warmup runs */
  warmupRuns?: number;
  /** Number of iterations */
  iterations?: number;
  /** Number of benchmark runs */
  runs?: number;
  
  /** Reporting configuration */
  reporting?: {
    /** Output formats */
    formats?: ReportFormat[];
    /** Output path */
    outputPath?: string;
    /** Report title */
    title?: string;
    /** Include system information */
    includeSystemInfo?: boolean;
    /** Include summary statistics */
    includeSummary?: boolean;
  };
  
  /** Hardware monitoring configuration */
  hardwareMonitoring?: {
    /** Monitor CPU usage */
    monitorCpu?: boolean;
    /** Monitor memory usage */
    monitorMemory?: boolean;
    /** Sampling interval (ms) */
    samplingInterval?: number;
    /** Detect thermal throttling */
    detectThermalThrottling?: boolean;
  };
  
  /** Process isolation configuration */
  isolation?: {
    /** Use worker threads */
    useWorkerThreads?: boolean;
    /** Number of processes */
    processCount?: number;
    /** Prioritize benchmark processes */
    prioritize?: boolean;
    /** Isolate to specific CPU */
    isolateCPU?: boolean;
  };
}

/**
 * Generic benchmark function type
 */
export type BenchmarkFunction<T = any> = () => T;

/**
 * Type-safe benchmark runner function
 */
export type BenchmarkRunner = <T>(
  benchmarkFn: BenchmarkFunction<T>,
  options?: BenchmarkOptions
) => BenchmarkResult<T>;
