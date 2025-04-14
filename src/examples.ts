/**
 * Basic benchmark example
 */
import {
    runBenchmark,
    compareBenchmarks,
    runAdaptiveBenchmark,
    generateReport,
    saveReport,
    ReportFormat
} from '~/main';

// Simple function to benchmark
function arrayReduceSum(): number {
    return Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
}

// Alternative implementation
function forLoopSum(): number {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += arr[i];
    }
    return sum;
}

// Run a simple benchmark
console.log('Running basic benchmark...');
const result = runBenchmark(arrayReduceSum, {
    iterations: 10000,
    warmupRuns: 2
});

console.log(`Array reduce sum: ${result.result}`);
console.log(`Duration: ${result.duration.toFixed(2)}ms`);
console.log(`Operations/second: ${result.operationsPerSecond.toFixed(2)}`);
console.log(`Memory used: ${(result.memoryDelta.heapUsed / (1024 * 1024)).toFixed(2)}MB`);

// Compare two implementations
console.log('\nComparing implementations...');
const comparison = compareBenchmarks(
    { name: 'Array.reduce', fn: arrayReduceSum },
    { name: 'For loop', fn: forLoopSum },
    { iterations: 10000 }
);

const fasterName = comparison.resultA.duration < comparison.resultB.duration
    ? 'Array.reduce'
    : 'For loop';

const percentFaster = Math.abs(1 - comparison.comparison.timeRatio) * 100;

console.log(`${fasterName} is ${percentFaster.toFixed(2)}% faster`);
console.log(`Time ratio: ${comparison.comparison.timeRatio.toFixed(2)}`);
console.log(`Operations ratio: ${comparison.comparison.opsRatio.toFixed(2)}`);
console.log(`Memory ratio: ${comparison.comparison.memoryRatio.toFixed(2)}`);

// Run adaptive benchmark (automatically adjusts iterations)
console.log('\nRunning adaptive benchmark...');
const adaptiveResult = runAdaptiveBenchmark(arrayReduceSum, {
    minIterations: 1000,
    maxIterations: 1000000,
    targetRSD: 2.0,
    maxTime: 5000
});

console.log(`Initial iterations: ${adaptiveResult.calibration.initialIterations}`);
console.log(`Final iterations: ${adaptiveResult.calibration.finalIterations}`);
console.log(`RSD achieved: ${adaptiveResult.calibration.relativeStandardDeviation.toFixed(2)}%`);
console.log(`Time spent: ${adaptiveResult.calibration.timeSpent.toFixed(2)}ms`);
console.log(`Operations/second: ${adaptiveResult.operationsPerSecond.toFixed(2)}`);

// Generate a report
console.log('\nGenerating reports...');
const benchmarks = [
    {
        name: 'Array.reduce',
        results: comparison.resultA
    },
    {
        name: 'For loop',
        results: comparison.resultB
    }
];

// Generate and save console report
const consoleReport = generateReport(benchmarks, {
    format: ReportFormat.CONSOLE,
    title: 'Array Summation Benchmark'
});
console.log(consoleReport);

// Generate and save HTML report
const htmlReport = generateReport(benchmarks, {
    format: ReportFormat.HTML,
    title: 'Array Summation Benchmark'
});
saveReport(htmlReport, {
    format: ReportFormat.HTML,
    outputPath: './benchmark-results/array-summation'
});

console.log('Benchmark complete. HTML report saved to ./benchmark-results/array-summation.html');