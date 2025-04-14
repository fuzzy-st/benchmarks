/**
 * Process isolation for more accurate benchmarking
 */
import { Worker } from 'worker_threads';
import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import {
    BenchmarkResult,
    IsolatedBenchmarkOptions
} from '~/types';

/**
 * Default isolation options
 */
const DEFAULT_ISOLATION_OPTIONS: IsolatedBenchmarkOptions = {
    useWorkerThreads: false,
    processCount: 1,
    prioritize: false,
    isolateCPU: false,
    warmup: true,
    iterations: 100_000,
    runs: 1,
    warmupRuns: 0,
    gcBetweenRuns: true
};

/**
 * Message types for inter-process communication
 */
export enum MessageType {
    RUN_BENCHMARK = 'runBenchmark',
    BENCHMARK_RESULT = 'benchmarkResult',
    ERROR = 'error'
}

/**
 * Interface for benchmark messages
 */
interface BenchmarkMessage {
    type: MessageType;
    benchmarkName?: string;
    benchmarkCode?: string;
    options?: IsolatedBenchmarkOptions;
    result?: BenchmarkResult;
    error?: string;
}

/**
 * Run a benchmark in an isolated process
 */
export function runIsolatedBenchmark(
    benchmarkName: string,
    benchmarkCode: string,
    options: IsolatedBenchmarkOptions = {}
): Promise<BenchmarkResult> {
    const opts = { ...DEFAULT_ISOLATION_OPTIONS, ...options };

    // Validate inputs to prevent injection attacks
    if (!/^[a-zA-Z0-9_$]+$/.test(benchmarkName)) {
        throw new Error('Invalid benchmark name. Use only alphanumeric characters, _ and $');
    }

    // Create a temporary file with the benchmark code
    const tempFile = createTempBenchmarkFile(benchmarkName, benchmarkCode);

    return new Promise((resolve, reject) => {
        const results: BenchmarkResult[] = [];
        let completedCount = 0;
        let errorOccurred = false;

        // Function to handle process completion
        const handleCompletion = (result?: BenchmarkResult, error?: Error) => {
            if (errorOccurred) return;

            if (error) {
                errorOccurred = true;
                cleanupTempFile(tempFile);
                reject(error);
                return;
            }

            if (result) {
                results.push(result);
            }

            completedCount++;
            if (completedCount === opts.processCount) {
                cleanupTempFile(tempFile);

                // Combine and average results from all processes
                const combinedResult = combineResults(results);
                resolve(combinedResult);
            }
        };

        try {
            // Launch processes/threads
            for (let i = 0; i < (opts.processCount || 1); i++) {
                if (opts.useWorkerThreads) {
                    launchWorkerThread(
                        tempFile,
                        benchmarkName,
                        opts,
                        handleCompletion
                    );
                } else {
                    launchChildProcess(
                        tempFile,
                        benchmarkName,
                        opts,
                        handleCompletion
                    );
                }
            }
        } catch (error) {
            cleanupTempFile(tempFile);
            reject(error);
        }
    });
}

/**
 * Launch a worker thread to run the benchmark
 */
function launchWorkerThread(
    scriptPath: string,
    benchmarkName: string,
    options: IsolatedBenchmarkOptions,
    callback: (result?: BenchmarkResult, error?: Error) => void
): Worker {
    // Create worker with the benchmark runner script
    const workerPath = path.join(__dirname, '..', '..', 'workers', 'benchmark-worker.js');

    // Ensure worker script exists
    if (!fs.existsSync(workerPath)) {
        createWorkerScripts();
    }

    const worker = new Worker(workerPath, {
        workerData: {
            benchmarkFile: scriptPath,
            benchmarkName,
            options
        }
    });

    // Handle messages from the worker
    worker.on('message', (message: BenchmarkMessage) => {
        if (message.type === MessageType.BENCHMARK_RESULT) {
            callback(message.result);
        } else if (message.type === MessageType.ERROR) {
            callback(undefined, new Error(message.error));
        }
    });

    // Handle worker errors
    worker.on('error', (error) => {
        callback(undefined, error);
    });

    // Handle worker exit
    worker.on('exit', (code) => {
        if (code !== 0) {
            callback(undefined, new Error(`Worker stopped with exit code ${code}`));
        }
    });

    return worker;
}

/**
 * Launch a child process to run the benchmark
 */
function launchChildProcess(
    scriptPath: string,
    benchmarkName: string,
    options: IsolatedBenchmarkOptions,
    callback: (result?: BenchmarkResult, error?: Error) => void
): ChildProcess {
    // Additional arguments for process isolation
    const execArgv = ['--expose-gc'];

    // Add max-old-space-size to prevent memory issues
    execArgv.push('--max-old-space-size=4096');

    // Ensure process script exists
    const processPath = path.join(__dirname, '..', '..', 'workers', 'benchmark-process.js');
    if (!fs.existsSync(processPath)) {
        createWorkerScripts();
    }

    // Create child process with the benchmark runner script
    const child = fork(processPath, {
        execArgv,
        env: {
            ...process.env,
            BENCHMARK_FILE: scriptPath,
            BENCHMARK_NAME: benchmarkName,
            BENCHMARK_OPTIONS: JSON.stringify(options)
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    // Try to set process priority if requested
    if (options.prioritize) {
        try {
            // On Unix-like systems
            if (process.platform !== 'win32') {
                child.stdout?.on('data', (data) => {
                    console.log(`[${benchmarkName}] ${data.toString().trim()}`);
                });

                child.stderr?.on('data', (data) => {
                    console.error(`[${benchmarkName}] Error: ${data.toString().trim()}`);
                });

                // Set nice value to -10 (higher priority)
                process.nextTick(() => {
                    if (child.pid) {
                        try {
                            require('child_process').execSync(`renice -n -10 -p ${child.pid}`);
                            console.log(`Set priority for process ${child.pid}`);
                        } catch (e) {
                            console.warn(`Could not set process priority: ${e}`);
                        }
                    }
                });
            }

            // On Windows, we could use the windows-process-priority package
            // but it's not included in this example
        } catch (e) {
            console.warn(`Failed to set process priority: ${e}`);
        }
    }

    // Try to isolate to a specific CPU core on Linux
    if (options.isolateCPU && process.platform === 'linux') {
        try {
            process.nextTick(() => {
                if (child.pid) {
                    const cores = os.cpus().length;
                    const coreToUse = child.pid % cores; // Simple round-robin assignment

                    try {
                        require('child_process').execSync(`taskset -cp ${coreToUse} ${child.pid}`);
                        console.log(`Isolated process ${child.pid} to CPU core ${coreToUse}`);
                    } catch (e) {
                        console.warn(`Could not isolate process to CPU: ${e}`);
                    }
                }
            });
        } catch (e) {
            console.warn(`Failed to isolate CPU: ${e}`);
        }
    }

    // Handle messages from the child process
    child.on('message', (message: BenchmarkMessage) => {
        if (message.type === MessageType.BENCHMARK_RESULT) {
            callback(message.result);
        } else if (message.type === MessageType.ERROR) {
            callback(undefined, new Error(message.error));
        }
    });

    // Handle child process errors
    child.on('error', (error) => {
        callback(undefined, error);
    });

    // Handle child process exit
    child.on('exit', (code) => {
        if (code !== 0) {
            callback(undefined, new Error(`Process exited with code ${code}`));
        }
    });

    return child;
}

/**
 * Create a temporary file with the benchmark code
 */
function createTempBenchmarkFile(name: string, code: string): string {
    // Generate a unique ID to prevent conflicts
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `benchmark-${uniqueId}-`));
    const filePath = path.join(tempDir, `${name.replace(/[^a-zA-Z0-9]/g, '_')}.js`);

    // Create a module that exports the benchmark function
    const moduleCode = `
// Temporary benchmark file
${code}

// Make benchmark function available
if (typeof module !== 'undefined') {
  module.exports = { ${name} };
}
`;

    fs.writeFileSync(filePath, moduleCode, 'utf8');
    return filePath;
}

/**
 * Clean up the temporary benchmark file
 */
function cleanupTempFile(filePath: string): void {
    try {
        fs.unlinkSync(filePath);

        // Try to remove the directory too
        const dirPath = path.dirname(filePath);
        if (dirPath.includes('benchmark-')) {
            fs.rmdirSync(dirPath);
        }
    } catch (e) {
        console.warn(`Could not clean up temporary file: ${e}`);
    }
}

/**
 * Combine results from multiple processes
 */
function combineResults(results: BenchmarkResult[]): BenchmarkResult {
    if (results.length === 0) {
        throw new Error('No results to combine');
    }

    if (results.length === 1) {
        return results[0];
    }

    // Average the metrics across all results
    const combined: BenchmarkResult = {
        duration: 0,
        iterations: results[0].iterations,
        operationsPerSecond: 0,
        memoryDelta: {
            heapUsed: 0,
            heapTotal: 0,
            rss: 0,
            external: 0
        }
    };

    // For each metric, calculate the average
    results.forEach(result => {
        combined.duration += result.duration / results.length;
        combined.operationsPerSecond += result.operationsPerSecond / results.length;
        combined.memoryDelta.heapUsed += result.memoryDelta.heapUsed / results.length;
        combined.memoryDelta.heapTotal += result.memoryDelta.heapTotal / results.length;
        combined.memoryDelta.rss += result.memoryDelta.rss / results.length;
        combined.memoryDelta.external += result.memoryDelta.external / results.length;
    });

    // Copy any additional custom results from the first result
    // This assumes all processes return the same structure
    const customKeys = Object.keys(results[0]).filter(
        key => !['duration', 'iterations', 'operationsPerSecond', 'memoryDelta'].includes(key)
    );

    customKeys.forEach(key => {
        // If the value is a number, average it
        if (typeof results[0][key] === 'number') {
            combined[key] = results.reduce((sum, result) => sum + result[key], 0) / results.length;
        } else {
            // Otherwise just use the first result's value
            combined[key] = results[0][key];
        }
    });

    return combined;
}

/**
 * Create necessary worker scripts
 */
export function createWorkerScripts(targetDir?: string): void {
    const dir = targetDir || path.join(__dirname, '..', '..', 'workers');

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Create worker script
    fs.writeFileSync(
        path.join(dir, 'benchmark-worker.js'),
        WORKER_SCRIPT,
        'utf8'
    );

    // Create process script
    fs.writeFileSync(
        path.join(dir, 'benchmark-process.js'),
        PROCESS_SCRIPT,
        'utf8'
    );

    console.log(`Created worker scripts in ${dir}`);
}

/**
 * Example benchmark worker script (benchmark-worker.js)
 */
export const WORKER_SCRIPT = `
const { parentPort, workerData } = require('worker_threads');
const path = require('path');

const MessageType = {
  RUN_BENCHMARK: 'runBenchmark',
  BENCHMARK_RESULT: 'benchmarkResult',
  ERROR: 'error'
};

async function runWorkerBenchmark() {
  try {
    // Import the benchmark module
    const benchmarkModule = require(workerData.benchmarkFile);
    const benchmarkFn = benchmarkModule[workerData.benchmarkName];
    
    if (typeof benchmarkFn !== 'function') {
      throw new Error(\`Benchmark function \${workerData.benchmarkName} not found\`);
    }
    
    // Run warmup if requested
    if (workerData.options.warmup) {
      benchmarkFn();
      if (global.gc) global.gc();
    }
    
    // Setup benchmark
    const iterations = workerData.options.iterations || 100000;
    
    // Take initial measurements
    let memoryBefore;
    if (process.memoryUsage) {
      memoryBefore = process.memoryUsage();
    }
    
    // Force garbage collection before benchmark if possible
    if (global.gc) global.gc();
    
    const startTime = performance.now();
    
    // Run the actual benchmark
    let result;
    for (let i = 0; i < iterations; i++) {
      result = benchmarkFn();
    }
    
    const endTime = performance.now();
    
    // Take final measurements
    let memoryAfter;
    if (process.memoryUsage) {
      memoryAfter = process.memoryUsage();
    }
    
    // Calculate metrics
    const duration = endTime - startTime;
    
    const memoryDelta = {
      heapUsed: (memoryAfter?.heapUsed || 0) - (memoryBefore?.heapUsed || 0),
      heapTotal: (memoryAfter?.heapTotal || 0) - (memoryBefore?.heapTotal || 0),
      rss: (memoryAfter?.rss || 0) - (memoryBefore?.rss || 0),
      external: (memoryAfter?.external || 0) - (memoryBefore?.external || 0)
    };
    
    // Send result back to main thread
    parentPort.postMessage({
      type: MessageType.BENCHMARK_RESULT,
      result: {
        duration,
        iterations,
        operationsPerSecond: (iterations / duration) * 1000,
        memoryDelta,
        result
      }
    });
  } catch (error) {
    parentPort.postMessage({
      type: MessageType.ERROR,
      error: error.message
    });
  }
}

runWorkerBenchmark();
`;

/**
 * Example benchmark process script (benchmark-process.js)
 */
export const PROCESS_SCRIPT = `
const path = require('path');
const { performance } = require('perf_hooks');

const MessageType = {
  RUN_BENCHMARK: 'runBenchmark',
  BENCHMARK_RESULT: 'benchmarkResult',
  ERROR: 'error'
};

// Get benchmark details from environment variables
const benchmarkFile = process.env.BENCHMARK_FILE;
const benchmarkName = process.env.BENCHMARK_NAME;
const benchmarkOptions = JSON.parse(process.env.BENCHMARK_OPTIONS || '{}');

async function runProcessBenchmark() {
  try {
    // Import the benchmark module
    const benchmarkModule = require(benchmarkFile);
    const benchmarkFn = benchmarkModule[benchmarkName];
    
    if (typeof benchmarkFn !== 'function') {
      throw new Error(\`Benchmark function \${benchmarkName} not found\`);
    }
    
    // Run warmup if requested
    if (benchmarkOptions.warmup) {
      benchmarkFn();
      if (global.gc) global.gc();
    }
    
    // Setup benchmark
    const iterations = benchmarkOptions.iterations || 100000;
    
    // Take initial measurements
    let memoryBefore;
    if (process.memoryUsage) {
      memoryBefore = process.memoryUsage();
    }
    
    // Force garbage collection before benchmark if possible
    if (global.gc) global.gc();
    
    const startTime = performance.now();
    
    // Run the actual benchmark
    let result;
    for (let i = 0; i < iterations; i++) {
      result = benchmarkFn();
    }
    
    const endTime = performance.now();
    
    // Take final measurements
    let memoryAfter;
    if (process.memoryUsage) {
      memoryAfter = process.memoryUsage();
    }
    
    // Calculate metrics
    const duration = endTime - startTime;
    
    const memoryDelta = {
      heapUsed: (memoryAfter?.heapUsed || 0) - (memoryBefore?.heapUsed || 0),
      heapTotal: (memoryAfter?.heapTotal || 0) - (memoryBefore?.heapTotal || 0),
      rss: (memoryAfter?.rss || 0) - (memoryBefore?.rss || 0),
      external: (memoryAfter?.external || 0) - (memoryBefore?.external || 0)
    };
    
    // Send result back to parent process
    if (process.send) {
      process.send({
        type: MessageType.BENCHMARK_RESULT,
        result: {
          duration,
          iterations,
          operationsPerSecond: (iterations / duration) * 1000,
          memoryDelta,
          result
        }
      });
    } else {
      console.error('Process.send is not available');
    }
    
    // Exit with success
    process.exit(0);
  } catch (error) {
    // Send error back to parent process
    if (process.send) {
      process.send({
        type: MessageType.ERROR,
        error: error.message
      });
    } else {
      console.error(error);
    }
    
    // Exit with error
    process.exit(1);
  }
}

runProcessBenchmark();
`;