/**
 * Visualization and reporting utilities for benchmark results
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    BenchmarkReportItem,
    ReportFormat,
    ReportOptions
} from '~/types';

/**
 * Default report options
 */
const DEFAULT_REPORT_OPTIONS: ReportOptions = {
    format: ReportFormat.CONSOLE,
    title: 'Benchmark Report',
    includeTimestamp: true,
    includeSummary: true,
    includeSystemInfo: true,
    colorOutput: true
};

/**
 * Generate a benchmark report in the specified format
 */
export function generateReport(
    benchmarks: BenchmarkReportItem[],
    options: ReportOptions = {}
): string {
    const opts = { ...DEFAULT_REPORT_OPTIONS, ...options };

    // Add timestamp
    const timestamp = opts.includeTimestamp ? new Date().toISOString() : undefined;

    // Add system info
    const systemInfo = opts.includeSystemInfo ? getSystemInfo() : undefined;

    // Generate report based on format
    switch (opts.format) {
        case ReportFormat.JSON:
            return generateJsonReport(benchmarks, opts?.title || 'Untitled Report', timestamp, systemInfo);
        case ReportFormat.HTML:
            return generateHtmlReport(benchmarks, opts?.title || 'Untitled Report', timestamp, systemInfo);
        case ReportFormat.CSV:
            return generateCsvReport(benchmarks);
        case ReportFormat.MARKDOWN:
            return generateMarkdownReport(benchmarks, opts?.title || 'Untitled Report', timestamp, systemInfo);
        case ReportFormat.CONSOLE:
        default:
            return generateConsoleReport(benchmarks, opts?.title || 'Untitled Report', timestamp, systemInfo, opts.colorOutput);
    }
}

/**
 * Save a report to a file
 */
export function saveReport(content: string, options: ReportOptions): void {
    const opts = { ...DEFAULT_REPORT_OPTIONS, ...options };

    // Create output directory if it doesn't exist
    const dir = path.dirname(opts.outputPath || './benchmark-results');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Add extension based on format if not already present
    let filePath = opts.outputPath || './benchmark-results/report';
    if (!path.extname(filePath)) {
        const extension = getFileExtension(opts.format || ReportFormat.CONSOLE);
        filePath = `${filePath}.${extension}`;
    }

    // Write the file
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Report saved to: ${filePath}`);
}

/**
 * Get file extension based on format
 */
function getFileExtension(format: ReportFormat): string {
    switch (format) {
        case ReportFormat.JSON:
            return 'json';
        case ReportFormat.HTML:
            return 'html';
        case ReportFormat.CSV:
            return 'csv';
        case ReportFormat.MARKDOWN:
            return 'md';
        case ReportFormat.CONSOLE:
        default:
            return 'txt';
    }
}

/**
 * Get system information
 */
function getSystemInfo(): Record<string, any> {
    return {
        platform: process.platform,
        nodeVersion: process.version,
        architecture: process.arch,
        cpus: os.cpus().map(cpu => ({ model: cpu.model, speed: cpu.speed })),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
    };
}

/**
 * Generate a console-friendly report
 */
function generateConsoleReport(
    benchmarks: BenchmarkReportItem[],
    title: string,
    timestamp?: string,
    systemInfo?: Record<string, any>,
    colorOutput = true
): string {
    // ANSI color codes for terminal output
    const colors = {
        reset: colorOutput ? '\x1b[0m' : '',
        bright: colorOutput ? '\x1b[1m' : '',
        dim: colorOutput ? '\x1b[2m' : '',
        underscore: colorOutput ? '\x1b[4m' : '',
        red: colorOutput ? '\x1b[31m' : '',
        green: colorOutput ? '\x1b[32m' : '',
        yellow: colorOutput ? '\x1b[33m' : '',
        blue: colorOutput ? '\x1b[34m' : '',
        magenta: colorOutput ? '\x1b[35m' : '',
        cyan: colorOutput ? '\x1b[36m' : '',
    };

    let report = `${colors.bright}${colors.cyan}${title}${colors.reset}\n`;
    report += '='.repeat(title.length) + '\n\n';

    if (timestamp) {
        report += `${colors.dim}Generated: ${timestamp}${colors.reset}\n\n`;
    }

    if (systemInfo) {
        report += `${colors.bright}System Information:${colors.reset}\n`;
        report += `${colors.dim}Platform: ${systemInfo.platform}${colors.reset}\n`;
        report += `${colors.dim}Node.js: ${systemInfo.nodeVersion}${colors.reset}\n`;
        report += `${colors.dim}Architecture: ${systemInfo.architecture}${colors.reset}\n`;
        report += `${colors.dim}CPU: ${systemInfo.cpus[0].model} (${systemInfo.cpus.length} cores)${colors.reset}\n`;
        report += `${colors.dim}Total Memory: ${formatBytes(systemInfo.totalMemory)}${colors.reset}\n\n`;
    }

    // Benchmark results
    benchmarks.forEach(benchmark => {
        report += `${colors.bright}${colors.yellow}Benchmark: ${benchmark.name}${colors.reset}\n`;

        // Duration
        const durationMs = benchmark.results.duration.toFixed(2);
        const opsPerSec = benchmark.results.operationsPerSecond.toFixed(2);
        report += `${colors.green}Duration: ${durationMs} ms${colors.reset}\n`;
        report += `${colors.green}Operations/second: ${opsPerSec}${colors.reset}\n`;

        // Memory
        const memUsed = (benchmark.results.memoryDelta.heapUsed / (1024 * 1024)).toFixed(2);
        report += `${colors.blue}Memory Used: ${memUsed} MB${colors.reset}\n`;

        // Statistics if available
        if (benchmark.stats) {
            report += `\n${colors.bright}Statistics:${colors.reset}\n`;
            report += `${colors.dim}Mean: ${benchmark.stats.mean.toFixed(2)} ms${colors.reset}\n`;
            report += `${colors.dim}Median: ${benchmark.stats.median.toFixed(2)} ms${colors.reset}\n`;
            report += `${colors.dim}Std Dev: ${benchmark.stats.standardDeviation.toFixed(2)} ms${colors.reset}\n`;
            report += `${colors.dim}95% CI: [${benchmark.stats.confidenceInterval95.lower.toFixed(2)}, ${benchmark.stats.confidenceInterval95.upper.toFixed(2)}] ms${colors.reset}\n`;
            report += `${colors.dim}Relative Error: ±${benchmark.stats.relativeMarginOfError.toFixed(2)}%${colors.reset}\n`;

            // Outliers
            const totalOutliers = benchmark.stats.outliers.mild.length + benchmark.stats.outliers.extreme.length;
            if (totalOutliers > 0) {
                report += `${colors.red}Outliers: ${totalOutliers} (${benchmark.stats.outliers.mild.length} mild, ${benchmark.stats.outliers.extreme.length} extreme)${colors.reset}\n`;
            }
        }

        // Custom metrics
        const customMetrics = Object.entries(benchmark.results)
            .filter(([key]) => !['duration', 'iterations', 'operationsPerSecond', 'memoryDelta', 'result'].includes(key));

        if (customMetrics.length > 0) {
            report += `\n${colors.bright}Custom Metrics:${colors.reset}\n`;
            customMetrics.forEach(([key, value]) => {
                report += `${colors.dim}${key}: ${formatValue(value)}${colors.reset}\n`;
            });
        }

        report += '\n' + '-'.repeat(50) + '\n\n';
    });

    return report;
}

/**
 * Generate a JSON report
 */
function generateJsonReport(
    benchmarks: BenchmarkReportItem[],
    title: string,
    timestamp?: string,
    systemInfo?: Record<string, any>
): string {
    const report = {
        title,
        timestamp,
        systemInfo,
        benchmarks: benchmarks.map(benchmark => ({
            name: benchmark.name,
            results: {
                ...benchmark.results,
                // Remove the actual function result to keep the JSON clean
                result: undefined
            },
            stats: benchmark.stats
        }))
    };

    return JSON.stringify(report, null, 2);
}

/**
 * Generate an HTML report with interactive charts
 */
function generateHtmlReport(
    benchmarks: BenchmarkReportItem[],
    title: string,
    timestamp?: string,
    systemInfo?: Record<string, any>
): string {
    // Create a basic HTML template with embedded Chart.js
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2 {
      color: #0066cc;
    }
    .benchmark {
      margin-bottom: 30px;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 5px;
      background-color: #f9f9f9;
    }
    .metrics {
      display: flex;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .metric {
      flex: 1;
      min-width: 200px;
      margin: 10px;
      padding: 15px;
      background-color: #fff;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .metric h3 {
      margin-top: 0;
      color: #666;
      font-size: 14px;
      text-transform: uppercase;
    }
    .metric .value {
      font-size: 24px;
      font-weight: bold;
      color: #0066cc;
    }
    .system-info {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 10px;
      margin-bottom: 30px;
      padding: 15px;
      background-color: #f0f0f0;
      border-radius: 4px;
    }
    .chart-container {
      margin-top: 20px;
      height: 300px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f0f0f0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${timestamp ? `<p>Generated: ${timestamp}</p>` : ''}
  
  ${systemInfo ? `
  <div class="system-info">
    <div><strong>Platform:</strong> ${systemInfo.platform}</div>
    <div><strong>Node.js:</strong> ${systemInfo.nodeVersion}</div>
    <div><strong>Architecture:</strong> ${systemInfo.architecture}</div>
    <div><strong>CPU:</strong> ${systemInfo.cpus[0].model}</div>
    <div><strong>CPU Cores:</strong> ${systemInfo.cpus.length}</div>
    <div><strong>Total Memory:</strong> ${formatBytes(systemInfo.totalMemory)}</div>
  </div>
  ` : ''}

  <div id="benchmarks">`;

    // Add each benchmark
    benchmarks.forEach((benchmark, index) => {
        html += `
    <div class="benchmark" id="benchmark-${index}">
      <h2>${benchmark.name}</h2>
      
      <div class="metrics">
        <div class="metric">
          <h3>Duration</h3>
          <div class="value">${benchmark.results.duration.toFixed(2)} ms</div>
        </div>
        <div class="metric">
          <h3>Operations/sec</h3>
          <div class="value">${benchmark.results.operationsPerSecond.toFixed(2)}</div>
        </div>
        <div class="metric">
          <h3>Memory Used</h3>
          <div class="value">${(benchmark.results.memoryDelta.heapUsed / (1024 * 1024)).toFixed(2)} MB</div>
        </div>`;

        // Add statistics if available
        if (benchmark.stats) {
            html += `
        <div class="metric">
          <h3>95% Confidence</h3>
          <div class="value">±${benchmark.stats.relativeMarginOfError.toFixed(2)}%</div>
        </div>`;
        }

        html += `
      </div><!-- end of metrics -->`;

        // Add statistics table if available
        if (benchmark.stats) {
            html += `
      <h3>Statistics</h3>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Mean</td>
          <td>${benchmark.stats.mean.toFixed(2)} ms</td>
        </tr>
        <tr>
          <td>Median</td>
          <td>${benchmark.stats.median.toFixed(2)} ms</td>
        </tr>
        <tr>
          <td>Std Dev</td>
          <td>${benchmark.stats.standardDeviation.toFixed(2)} ms</td>
        </tr>
        <tr>
          <td>95% CI</td>
          <td>[${benchmark.stats.confidenceInterval95.lower.toFixed(2)}, ${benchmark.stats.confidenceInterval95.upper.toFixed(2)}] ms</td>
        </tr>
        <tr>
          <td>Min/Max</td>
          <td>${benchmark.stats.min.toFixed(2)} / ${benchmark.stats.max.toFixed(2)} ms</td>
        </tr>
        <tr>
          <td>Outliers</td>
          <td>${benchmark.stats.outliers.mild.length} mild, ${benchmark.stats.outliers.extreme.length} extreme</td>
        </tr>
      </table>`;

            // Add chart if statistics are available
            html += `
      <div class="chart-container">
        <canvas id="chart-${index}"></canvas>
      </div>
      <script>
        new Chart(document.getElementById('chart-${index}'), {
          type: 'bar',
          data: {
            labels: ['Mean', 'Median', 'Min', 'Max'],
            datasets: [{
              label: 'Duration (ms)',
              data: [
                ${benchmark.stats.mean.toFixed(2)},
                ${benchmark.stats.median.toFixed(2)},
                ${benchmark.stats.min.toFixed(2)},
                ${benchmark.stats.max.toFixed(2)}
              ],
              backgroundColor: [
                'rgba(54, 162, 235, 0.5)',
                'rgba(255, 206, 86, 0.5)',
                'rgba(75, 192, 192, 0.5)',
                'rgba(255, 99, 132, 0.5)'
              ],
              borderColor: [
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(255, 99, 132, 1)'
              ],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      </script>`;
        }

        html += `
    </div><!-- end of benchmark -->`;
    });

    // Close the HTML
    html += `
  </div><!-- end of benchmarks -->
  
  <div class="footer">
    <p>Generated by @fuzzy-street/benchmarks</p>
  </div>
</body>
</html>`;

    return html;
}

/**
 * Generate a CSV report
 */
function generateCsvReport(benchmarks: BenchmarkReportItem[]): string {
    // Define CSV headers
    const headers = [
        'Benchmark',
        'Duration (ms)',
        'Operations/sec',
        'Memory Used (MB)',
        'Mean (ms)',
        'Median (ms)',
        'Std Dev (ms)',
        'Min (ms)',
        'Max (ms)',
        'Relative Error (%)',
        'Outliers'
    ];

    // Create CSV content
    let csv = headers.join(',') + '\n';

    // Add benchmark data
    benchmarks.forEach(benchmark => {
        const row = [
            `"${benchmark.name}"`,
            benchmark.results.duration.toFixed(2),
            benchmark.results.operationsPerSecond.toFixed(2),
            (benchmark.results.memoryDelta.heapUsed / (1024 * 1024)).toFixed(2)
        ];

        // Add statistics if available
        if (benchmark.stats) {
            row.push(
                benchmark.stats.mean.toFixed(2),
                benchmark.stats.median.toFixed(2),
                benchmark.stats.standardDeviation.toFixed(2),
                benchmark.stats.min.toFixed(2),
                benchmark.stats.max.toFixed(2),
                benchmark.stats.relativeMarginOfError.toFixed(2),
                `${benchmark.stats.outliers.mild.length + benchmark.stats.outliers.extreme.length}`
            );
        } else {
            // Fill with placeholders if no stats
            row.push('', '', '', '', '', '', '');
        }

        csv += row.join(',') + '\n';
    });

    return csv;
}

/**
 * Generate a Markdown report
 */
function generateMarkdownReport(
    benchmarks: BenchmarkReportItem[],
    title: string,
    timestamp?: string,
    systemInfo?: Record<string, any>
): string {
    let md = `# ${title}\n\n`;

    if (timestamp) {
        md += `*Generated: ${timestamp}*\n\n`;
    }

    if (systemInfo) {
        md += `## System Information\n\n`;
        md += `- **Platform:** ${systemInfo.platform}\n`;
        md += `- **Node.js:** ${systemInfo.nodeVersion}\n`;
        md += `- **Architecture:** ${systemInfo.architecture}\n`;
        md += `- **CPU:** ${systemInfo.cpus[0].model} (${systemInfo.cpus.length} cores)\n`;
        md += `- **Total Memory:** ${formatBytes(systemInfo.totalMemory)}\n\n`;
    }

    md += `## Benchmark Results\n\n`;

    // Add each benchmark
    benchmarks.forEach(benchmark => {
        md += `### ${benchmark.name}\n\n`;

        // Main metrics
        md += `- **Duration:** ${benchmark.results.duration.toFixed(2)} ms\n`;
        md += `- **Operations/second:** ${benchmark.results.operationsPerSecond.toFixed(2)}\n`;
        md += `- **Memory Used:** ${(benchmark.results.memoryDelta.heapUsed / (1024 * 1024)).toFixed(2)} MB\n\n`;

        // Statistics if available
        if (benchmark.stats) {
            md += `#### Statistics\n\n`;
            md += `| Metric | Value |\n`;
            md += `|--------|-------|\n`;
            md += `| Mean | ${benchmark.stats.mean.toFixed(2)} ms |\n`;
            md += `| Median | ${benchmark.stats.median.toFixed(2)} ms |\n`;
            md += `| Std Dev | ${benchmark.stats.standardDeviation.toFixed(2)} ms |\n`;
            md += `| 95% CI | [${benchmark.stats.confidenceInterval95.lower.toFixed(2)}, ${benchmark.stats.confidenceInterval95.upper.toFixed(2)}] ms |\n`;
            md += `| Min/Max | ${benchmark.stats.min.toFixed(2)} / ${benchmark.stats.max.toFixed(2)} ms |\n`;
            md += `| Relative Error | ±${benchmark.stats.relativeMarginOfError.toFixed(2)}% |\n`;

            // Outliers
            const totalOutliers = benchmark.stats.outliers.mild.length + benchmark.stats.outliers.extreme.length;
            md += `| Outliers | ${totalOutliers} (${benchmark.stats.outliers.mild.length} mild, ${benchmark.stats.outliers.extreme.length} extreme) |\n\n`;
        }

        // Custom metrics
        const customMetrics = Object.entries(benchmark.results)
            .filter(([key]) => !['duration', 'iterations', 'operationsPerSecond', 'memoryDelta', 'result'].includes(key));

        if (customMetrics.length > 0) {
            md += `#### Custom Metrics\n\n`;
            md += `| Metric | Value |\n`;
            md += `|--------|-------|\n`;
            customMetrics.forEach(([key, value]) => {
                md += `| ${key} | ${formatValue(value)} |\n`;
            });
            md += '\n';
        }

        md += `---\n\n`;
    });

    return md;
}

/**
 * Format bytes to a human-readable string
 */
function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format any value for display
 */
function formatValue(value: any): string {
    if (value === null || value === undefined) {
        return 'N/A';
    }

    if (typeof value === 'number') {
        return value.toFixed(2);
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}
