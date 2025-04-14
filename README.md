# @fuzzy-street/benchmarks

A comprehensive benchmarking framework for JavaScript/TypeScript with advanced statistical analysis, hardware monitoring, and visualization features.

## Features

- 🏋️ **Core Benchmarking**: Accurate execution timing and memory usage measurement
- 🧐 **Statistical Analysis**: Confidence intervals, outlier detection, and variance analysis
- 🐫 **Adaptive Benchmarking**: Auto-calibrate iteration counts for optimal stability
- 🏝️ **Process Isolation**: Benchmark in separate processes for more accurate results
- 🤖 **Hardware Monitoring**: Track CPU usage, memory, and system conditions during benchmarks
- 😎 **Visualization**: Generate reports in various formats (Console, HTML, JSON, CSV, Markdown)
- 🧙‍♂️ **Type-safe API**: Full TypeScript support with generic types
- 💻 **Developer-Friendly API** - A simple yet powerful interface that developers deserve
- 🆓 **Dependency Free** - Completely devoid of any external dependencies

## Installation

```bash
npm install @fuzzy-street/benchmarks
```

## Quick Start

```typescript
import { runBenchmark, compareBenchmarks } from '@fuzzy-street/benchmarks';

// Define functions to benchmark
function arrayReduceSum(): number {
  return Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
}

function forLoopSum(): number {
  const arr = Array.from({ length: 1000 }, (_, i) => i);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}

// Run a basic benchmark
const result = runBenchmark(arrayReduceSum, { 
  iterations: 10000,
  warmupRuns: 2
});

console.log(`Duration: ${result.duration.toFixed(2)}ms`);
console.log(`Operations/second: ${result.operationsPerSecond.toFixed(2)}`);

// Compare two implementations
const comparison = compareBenchmarks(
  { name: 'Array.reduce', fn: arrayReduceSum },
  { name: 'For loop', fn: forLoopSum },
  { iterations: 10000 }
);

const fasterName = comparison.comparison.fasterName;
const percentFaster = comparison.comparison.percentFaster;

console.log(`${fasterName} is ${percentFaster.toFixed(2)}% faster`);
```

## Core Concepts

### Basic Benchmarking

Use `runBenchmark` to measure execution time and memory usage of a function:

```typescript
import { runBenchmark } from '@fuzzy-street/benchmarks';

const result = runBenchmark(
  () => {
    // Function to benchmark
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += i;
    return sum;
  },
  {
    iterations: 100000,  // Number of iterations
    warmupRuns: 2,       // Warmup runs to allow JIT optimization
    runs: 1,             // Number of separate benchmark runs
    gcBetweenRuns: true  // Force garbage collection between runs
  }
);

console.log(`Duration: ${result.duration.toFixed(2)}ms`);
console.log(`Operations/second: ${result.operationsPerSecond.toFixed(2)}`);
console.log(`Memory used: ${(result.memoryDelta.heapUsed / (1024 * 1024)).toFixed(2)}MB`);
```

### Comparing Implementations

Compare the performance of two different implementations:

```typescript
import { compareBenchmarks } from '@fuzzy-street/benchmarks';

// Two functions to compare
function implementation1() {
  return Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
}

function implementation2() {
  let sum = 0;
  for (let i = 0; i < 1000; i++) sum += i;
  return sum;
}

const comparison = compareBenchmarks(
  { name: 'Implementation 1', fn: implementation1 },
  { name: 'Implementation 2', fn: implementation2 },
  { iterations: 10000 }
);

console.log(`${comparison.comparison.fasterName} is ${comparison.comparison.percentFaster.toFixed(2)}% faster`);
```

### Adaptive Benchmarking

Let the framework automatically adjust the number of iterations to achieve statistical significance:

```typescript
import { runAdaptiveBenchmark } from '@fuzzy-street/benchmarks';

const result = runAdaptiveBenchmark(
  () => {
    // Function to benchmark
    return Array.from({ length: 1000 }, () => Math.random()).sort();
  },
  {
    minIterations: 100,     // Starting iteration count
    maxIterations: 100000,  // Maximum iteration count
    targetRSD: 2.0,         // Target relative standard deviation (%)
    maxTime: 10000          // Maximum time to spend benchmarking (ms)
  }
);

console.log(`Final iterations: ${result.calibration.finalIterations}`);
console.log(`RSD achieved: ${result.calibration.relativeStandardDeviation.toFixed(2)}%`);
console.log(`Operations/second: ${result.operationsPerSecond.toFixed(2)}`);
```

### Hardware Monitoring

Monitor system resources during benchmark execution:

```typescript
import { runMonitoredBenchmark } from '@fuzzy-street/benchmarks';

const result = await runMonitoredBenchmark(
  () => {
    // CPU-intensive function
    let result = 0;
    for (let i = 0; i < 10000000; i++) {
      result += Math.sin(i) * Math.cos(i);
    }
    return result;
  },
  {
    iterations: 10,
    monitorCpu: true,
    monitorMemory: true,
    samplingInterval: 100,  // Take snapshots every 100ms
    detectThermalThrottling: true
  }
);

console.log(`Average CPU utilization: ${result.hardwareMetrics.summary.cpuUtilization.avg.toFixed(2)}%`);
console.log(`Peak memory utilization: ${result.hardwareMetrics.summary.memoryUtilization.max.toFixed(2)}%`);

if (result.hardwareMetrics.summary.thermalThrottling) {
  console.warn('Warning: Thermal throttling detected during benchmark!');
}
```

### Process Isolation

Run benchmarks in isolated processes for more accurate results:

```typescript
import { runIsolatedBenchmark } from '@fuzzy-street/benchmarks';

// Define benchmark code as a string
const benchmarkCode = `
  function isolatedFunction() {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += i;
    return sum;
  }
`;

const result = await runIsolatedBenchmark(
  'isolatedFunction',  // Name of the function to run
  benchmarkCode,       // Code containing the function
  {
    iterations: 100000,
    processCount: 4,     // Run in 4 separate processes and average results
    useWorkerThreads: true,  // Use worker threads instead of child processes
    prioritize: true     // Try to increase process priority
  }
);

console.log(`Duration: ${result.duration.toFixed(2)}ms`);
console.log(`Operations/second: ${result.operationsPerSecond.toFixed(2)}`);
```

### Visualization and Reporting

Generate reports in various formats:

```typescript
import { generateReport, saveReport, ReportFormat } from '@fuzzy-street/benchmarks';

// Generate an HTML report
const report = generateReport(
  [
    { name: 'Benchmark 1', results: result1 },
    { name: 'Benchmark 2', results: result2 }
  ],
  {
    format: ReportFormat.HTML,
    title: 'Performance Comparison',
    includeSystemInfo: true
  }
);

// Save the report to a file
saveReport(report, {
  format: ReportFormat.HTML,
  outputPath: './benchmark-reports/comparison'  // Will add .html extension
});
```


