import readline from "readline";
import { theme } from "./theme";

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

interface InteractiveTableOptions {
  headers: string[];
  rows: string[][];
  activeCount: number;
  expiredCount: number;
  activeLabel?: string;
  expiredLabel?: string;
}

function buildRowRenderer(headers: string[], allRows: string[][]) {
  const widths = headers.map((header, index) => {
    const cellWidths = allRows.map((row) => stripAnsi(row[index] ?? "").length);
    return Math.max(header.length, ...cellWidths);
  });

  return (cols: string[]) =>
    cols
      .map((col, index) => {
        const padding = (widths[index] ?? 0) - stripAnsi(col).length;
        return `${col}${" ".repeat(Math.max(0, padding + 2))}`;
      })
      .join("")
      .trimEnd();
}

export async function renderInteractiveTable(
  options: InteractiveTableOptions,
): Promise<void> {
  const {
    headers,
    rows,
    activeCount,
    expiredCount,
    activeLabel = "active",
    expiredLabel = "expired",
  } = options;

  const renderRow = buildRowRenderer(headers, rows);

  if (!process.stdout.isTTY) {
    console.log();
    console.log(renderRow(headers.map((h) => theme.muted(h))));
    for (const row of rows) {
      console.log(renderRow(row));
    }
    console.log();
    return;
  }

  const terminalHeight = process.stdout.rows || 24;
  // 4 lines overhead: header row, blank line before footer, footer, line after footer
  const pageSize = Math.max(5, terminalHeight - 4);

  if (rows.length <= pageSize) {
    console.log();
    console.log(renderRow(headers.map((h) => theme.muted(h))));
    for (const row of rows) {
      console.log(renderRow(row));
    }
    console.log();
    return;
  }

  const totalPages = Math.ceil(rows.length / pageSize);
  let currentPage = 0;

  function getPageRows(page: number): string[][] {
    const start = page * pageSize;
    return rows.slice(start, start + pageSize);
  }

  function renderFooter(): string {
    const pageInfo = theme.emphasis(`Page ${currentPage + 1}/${totalPages}`);
    const countInfo = theme.muted(
      `(${activeCount} ${activeLabel}, ${expiredCount} ${expiredLabel})`,
    );
    const navHelp = theme.muted("←/→ navigate, q quit");
    return `  ${pageInfo}  ${countInfo}  ${navHelp}`;
  }

  console.log();
  console.log(renderRow(headers.map((h) => theme.muted(h))));

  function renderPage(): void {
    const pageRows = getPageRows(currentPage);
    for (let i = 0; i < pageSize; i++) {
      if (i < pageRows.length) {
        process.stdout.write(renderRow(pageRows[i]) + "\n");
      } else {
        process.stdout.write("\x1b[2K\n");
      }
    }
    process.stdout.write("\n");
    process.stdout.write("\x1b[2K" + renderFooter());
  }

  function redrawPage(): void {
    const linesToMoveUp = pageSize + 2; // data rows + blank + footer
    process.stdout.write(`\x1b[${linesToMoveUp}A\r`);
    renderPage();
  }

  renderPage();

  return new Promise<void>((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);

    function cleanup(): void {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.pause();
    }

    function onKeypress(
      _str: string | undefined,
      key: { name: string; ctrl?: boolean },
    ): void {
      if (!key) return;

      if (key.name === "right" || key.name === "l") {
        if (currentPage < totalPages - 1) {
          currentPage++;
          redrawPage();
        }
      } else if (key.name === "left" || key.name === "h") {
        if (currentPage > 0) {
          currentPage--;
          redrawPage();
        }
      } else if (key.name === "q" || key.name === "escape") {
        cleanup();
        console.log("\n");
        resolve();
      } else if (key.ctrl && key.name === "c") {
        cleanup();
        console.log("\n");
        resolve();
      }
    }

    process.stdin.on("keypress", onKeypress);
    process.stdin.resume();
  });
}
