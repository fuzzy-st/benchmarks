/**
 * Hardware performance monitoring for benchmarks
 * 
 * Note: Some of these features are platform-specific and may require
 * additional native modules or specific OS capabilities.
 */
import * as os from 'os';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { HardwareMonitoredResult, HardwareMonitoringOptions, SystemResourceSnapshot } from './types';
import { runBenchmark } from './core';


// Promisify exec for async/await usage
const exec = promisify(execCallback);

/**
 * Default hardware monitoring options
 */
const DEFAULT_HARDWARE_OPTIONS: HardwareMonitoringOptions = {
  monitorCpu: true,
  monitorMemory: true,
  samplingInterval: 100, // ms
  trackSystemWide: true,
  detectThermalThrottling: false,
  collectPerfCounters: false,
  generateHeatmap: false
};

/**
 * Take a snapshot of current system resource usage
 */
export async function takeResourceSnapshot(): Promise<SystemResourceSnapshot> {
  const timestamp = Date.now();
  const cpuUsage = process.cpuUsage();
  const memoryUsage = process.memoryUsage();
  const loadAvg = os.loadavg();

  // Get overall system memory
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  // Try to get more detailed CPU info using OS-specific commands
  let detailedCpuInfo: { user: number; system: number; idle: number } = {
    user: 0,
    system: 0,
    idle: 0
  };

  try {
    if (process.platform === 'linux') {
      const { stdout } = await exec('cat /proc/stat | grep "^cpu "');
      const parts = stdout.trim().split(/\s+/).slice(1);
      // Convert to milliseconds
      detailedCpuInfo = {
        user: parseInt(parts[0], 10) + parseInt(parts[1], 10),
        system: parseInt(parts[2], 10),
        idle: parseInt(parts[3], 10)
      };
    } else if (process.platform === 'darwin') {
      const { stdout } = await exec('top -l 1 -n 0 -s 0');
      const cpuLine = stdout.split('\n').find(line => line.includes('CPU usage'));
      if (cpuLine) {
        const matches = cpuLine.match(/(\d+\.\d+)% user, (\d+\.\d+)% sys, (\d+\.\d+)% idle/);
        if (matches) {
          detailedCpuInfo = {
            user: parseFloat(matches[1]),
            system: parseFloat(matches[2]),
            idle: parseFloat(matches[3])
          };
        }
      }
    } else if (process.platform === 'win32') {
      // Windows would need a different approach, perhaps using wmic
      // This is a simplified placeholder
      try {
        const { stdout } = await exec('wmic cpu get loadpercentage');
        const load = parseInt(stdout.trim().split('\n')[1], 10);
        detailedCpuInfo = {
          user: load,
          system: 0,
          idle: 100 - load
        };
      } catch (e) {
        // Handle potential permission issues or command unavailability
        console.warn('Could not get CPU load: Windows wmic command failed', e);
      }
    }
  } catch (error: any) {
    console.warn('Could not get detailed CPU info:', error.message);
  }

  // Get process info
  let priority = -1;
  try {
    if (process.platform !== 'win32') {
      const { stdout } = await exec(`ps -o nice -p ${process.pid}`);
      const lines = stdout.trim().split('\n');
      if (lines.length > 1) {
        priority = parseInt(lines[1].trim(), 10);
      }
    }
  } catch (error: any) {
    console.warn('Could not get process priority:', error.message);
  }

  return {
    timestamp,
    cpuUsage: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    memoryUsage: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers
    },
    systemMemory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem
    },
    systemCpu: {
      loadAvg,
      cpuTimes: detailedCpuInfo
    },
    processInfo: {
      pid: process.pid,
      uptime: process.uptime(),
      priority
    }
  };
}

/**
 * Detect if thermal throttling might be occurring
 */
export async function detectThermalThrottling(): Promise<boolean> {
  if (process.platform === 'darwin') {
    try {
      // Check for thermal throttling on macOS using pmset
      const { stdout } = await exec('pmset -g therm');
      return stdout.includes('CPU_Scheduler_Limit') &&
        !stdout.includes('CPU_Scheduler_Limit = 100');
    } catch (error: any) {
      console.warn('Could not check thermal throttling:', error.message);
    }
  } else if (process.platform === 'linux') {
    try {
      // Check CPU frequency scaling on Linux
      const { stdout } = await exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq');
      const { stdout: maxFreq } = await exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq');

      const current = parseInt(stdout.trim(), 10);
      const max = parseInt(maxFreq.trim(), 10);

      // If current frequency is significantly lower than max, throttling might be occurring
      return current < (max * 0.9);
    } catch (error: any) {
      console.warn('Could not check CPU frequency:', error.message);
    }
  }

  // Default to false if we can't determine
  return false;
}

/**
 * Try to collect CPU performance counters (platform-specific)
 */
export async function collectPerfCounters(): Promise<Record<string, number>> {
  const counters: Record<string, number> = {};

  try {
    if (process.platform === 'linux') {
      // On Linux, we could use perf or similar tools
      // This is a simplified example
      try {
        const { stdout } = await exec(`perf stat -p ${process.pid} sleep 0.1 2>&1`);

        // Parse the output to extract counter values
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.includes('cycles') || line.includes('instructions') ||
            line.includes('cache-misses') || line.includes('branch-misses')) {
            const parts = line.trim().split(/\s+/);
            const value = parseFloat(parts[0].replace(/,/g, ''));
            const name = parts[parts.length - 1];
            counters[name] = value;
          }
        }
      } catch (e) {
        // Handle perf tool unavailability
        console.warn('Linux perf tool not available. Performance counters will not be collected.');
      }
    }
  } catch (error: any) {
    console.warn('Could not collect performance counters:', error.message);
  }

  return counters;
}

/**
 * Run a benchmark with hardware monitoring
 */
export async function runMonitoredBenchmark<T>(
  benchmarkFn: () => T,
  options: HardwareMonitoringOptions = {}
): Promise<HardwareMonitoredResult<T>> {
  const opts = { ...DEFAULT_HARDWARE_OPTIONS, ...options };

  // Take initial system snapshot
  const initialSnapshot = await takeResourceSnapshot();
  const snapshots: SystemResourceSnapshot[] = [initialSnapshot];

  // Setup monitoring
  let monitoringInterval: NodeJS.Timeout | null = null;

  if (opts.monitorCpu || opts.monitorMemory) {
    monitoringInterval = setInterval(async () => {
      try {
        const snapshot = await takeResourceSnapshot();
        snapshots.push(snapshot);
      } catch (error: any) {
        console.warn('Error taking resource snapshot:', error.message);
      }
    }, opts.samplingInterval || 100);
  }

  // Run the benchmark
  const result = runBenchmark(benchmarkFn, opts);

  // Stop monitoring
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  // Take final system snapshot
  const finalSnapshot = await takeResourceSnapshot();
  snapshots.push(finalSnapshot);

  // Check for thermal throttling if requested
  let thermalThrottling = false;
  if (opts.detectThermalThrottling) {
    thermalThrottling = await detectThermalThrottling();
  }

  // Collect performance counters if requested
  let perfCounters = {};
  if (opts.collectPerfCounters) {
    perfCounters = await collectPerfCounters();
  }

  // Calculate CPU utilization
  const cpuValues = snapshots.map(snapshot => {
    const totalCpu = snapshot.cpuUsage.user + snapshot.cpuUsage.system;
    // Normalize by the number of CPUs
    return totalCpu / os.cpus().length;
  });

  const cpuUtilization = {
    min: Math.min(...cpuValues),
    max: Math.max(...cpuValues),
    avg: cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length
  };

  // Calculate memory utilization
  const memValues = snapshots.map(snapshot =>
    snapshot.memoryUsage.heapUsed / snapshot.systemMemory.total * 100
  );

  const memoryUtilization = {
    min: Math.min(...memValues),
    max: Math.max(...memValues),
    avg: memValues.reduce((sum, value) => sum + value, 0) / memValues.length
  };

  // Calculate system load changes
  const systemLoad = {
    before: initialSnapshot.systemCpu.loadAvg,
    after: finalSnapshot.systemCpu.loadAvg,
    delta: finalSnapshot.systemCpu.loadAvg.map(
      (load, i) => load - initialSnapshot.systemCpu.loadAvg[i]
    )
  };

  return {
    ...result,
    hardwareMetrics: {
      snapshots,
      summary: {
        cpuUtilization,
        memoryUtilization,
        systemLoad,
        thermalThrottling,
        perfCounters
      }
    }
  };
}

/**
 * Generate a CPU utilization heatmap (useful for multi-core analysis)
 */
export async function generateCpuHeatmap(): Promise<string[][]> {
  // This is a placeholder for a more complex heatmap generation
  // In a real implementation, this would gather per-core CPU usage
  // and return a 2D representation suitable for visualization
  const heatmap: string[][] = [];
  const cpus = os.cpus();

  try {
    if (process.platform === 'linux') {
      // For Linux, we could parse /proc/stat for each CPU
      const { stdout } = await exec('cat /proc/stat | grep "^cpu"');
      const lines = stdout.trim().split('\n');

      // Skip the first line (overall CPU)
      for (let i = 1; i < Math.min(lines.length, cpus.length + 1); i++) {
        const parts = lines[i].trim().split(/\s+/).slice(1);
        const user = parseInt(parts[0], 10) + parseInt(parts[1], 10);
        const system = parseInt(parts[2], 10);
        const idle = parseInt(parts[3], 10);
        const total = user + system + idle;

        // Calculate usage percentage
        const usage = ((user + system) / total) * 100;

        // Create a simple color-coded representation
        let color;
        if (usage < 30) color = 'green';
        else if (usage < 70) color = 'yellow';
        else color = 'red';

        heatmap.push([`CPU ${i - 1}`, `${usage.toFixed(1)}%`, color]);
      }
    }
  } catch (error) {
    console.warn('Could not generate CPU heatmap from /proc/stat');

    // Fallback to basic info
    for (let i = 0; i < cpus.length; i++) {
      const cpu = cpus[i];
      const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
      const idle = cpu.times.idle;
      const usage = ((total - idle) / total) * 100;

      let color;
      if (usage < 30) color = 'green';
      else if (usage < 70) color = 'yellow';
      else color = 'red';

      heatmap.push([`CPU ${i}`, `${usage.toFixed(1)}%`, color]);
    }
  }

  return heatmap;
}
