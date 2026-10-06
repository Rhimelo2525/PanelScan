import type { DashboardArchive } from '@prisma/client';
import ExcelJS from 'exceljs';

import { formatManilaDateTime, manilaDateKey, toManilaIso } from './archive.cycle';
import type { ArchivedMetricType, OrderStatusShare, ProductDemandRow, RevenueDay } from './archive.types';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METRIC_LABELS: Record<ArchivedMetricType, string> = {
  REVENUE_OVER_TIME: 'Revenue Over Time',
  PRODUCT_DEMAND: 'Product Demand',
  ORDERS_BY_STATUS: 'Orders by Status',
};
const PESO_FORMAT = '"₱"#,##0.00';
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

/** "Sep19" and "2026" - a Philippine date for the file name. */
const fileDate = (instant: Date): { day: string; year: string } => {
  const [year, month, day] = manilaDateKey(instant).split('-') as [string, string, string];
  return { day: `${MONTHS[Number(month) - 1]}${day}`, year };
};

/** "PanelScan_Archive_Sep19_to_Sep30_2026.xlsx" (both years shown if the cycle spans New Year). */
export const archiveFileName = (archive: Pick<DashboardArchive, 'startTimestamp' | 'endTimestamp'>): string => {
  const from = fileDate(archive.startTimestamp);
  const to = fileDate(archive.endTimestamp);
  return from.year === to.year
    ? `PanelScan_Archive_${from.day}_to_${to.day}_${to.year}.xlsx`
    : `PanelScan_Archive_${from.day}_${from.year}_to_${to.day}_${to.year}.xlsx`;
};

/** "PENDING" -> "Pending" */
const statusLabel = (status: string): string => status.charAt(0) + status.slice(1).toLowerCase();

/** A "2026-09-19" calendar date as an Excel date (no time, so no time zone shift). */
const excelDate = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
};

/** A data sheet: bold shaded header row that stays in view and can be filtered, plus a bold totals row. */
const addTableSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; width: number; numFmt?: string }>,
  rows: Array<Array<string | number | Date>>,
  totals: Array<string | number | null>,
): void => {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ header: column.header, width: column.width, style: column.numFmt ? { numFmt: column.numFmt } : {} }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin' } };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.addRows(rows);
  const totalRow = sheet.addRow(totals);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: 'thin' } };
  });
};

/**
 * The downloadable record of one archived cycle: a single Excel workbook with
 * an overview sheet describing the cycle and one sheet per dashboard widget.
 */
export async function buildArchiveWorkbook(archive: DashboardArchive): Promise<Buffer> {
  const revenueDays = archive.revenueOverTimeData as unknown as RevenueDay[];
  const productDemand = archive.productDemandData as unknown as ProductDemandRow[];
  const ordersByStatus = archive.ordersByStatusData as unknown as OrderStatusShare[];
  const metricTypes = archive.metricTypesIncluded as ArchivedMetricType[];
  const totalRevenue = Number(archive.totalGrossRevenue);
  const completedOrders = revenueDays.reduce((sum, day) => sum + day.completedOrdersCount, 0);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PanelScan';
  workbook.created = archive.archivedAt;
  workbook.title = `Cycle #${archive.cycleNumber} Archived Record`;

  // Tab 1: what this record is.
  const overview = workbook.addWorksheet('Archive Overview');
  overview.columns = [{ width: 34 }, { width: 58 }];
  overview.addRow([`Cycle #${archive.cycleNumber} Archived Record`]).font = { bold: true, size: 14 };
  overview.addRow(['PanelScan dashboard archive. All times are Philippine time (Asia/Manila, UTC+08:00).']).font = { italic: true, color: { argb: 'FF6B7280' } };
  overview.addRow([]);
  const details: Array<[string, string | number]> = [
    ['Archive Title', `Cycle #${archive.cycleNumber} Archived Record`],
    ['Cycle', archive.cycleTitle],
    ['Date Range (Philippine Time)', `${formatManilaDateTime(archive.startTimestamp)} – ${formatManilaDateTime(archive.endTimestamp)}`],
    ['Start Timestamp', toManilaIso(archive.startTimestamp)],
    ['End Timestamp', toManilaIso(archive.endTimestamp)],
    ['Archived Timestamp', `${formatManilaDateTime(archive.archivedAt)} (${toManilaIso(archive.archivedAt)})`],
    ['Covered Metrics Included', metricTypes.map((type) => METRIC_LABELS[type] ?? type).join(', ')],
    ['Cycle Total Revenue (PHP)', totalRevenue],
    ['Cycle Total Orders', archive.totalOrdersCount],
    ['Cycle Total Completed Orders', completedOrders],
    ['Archive ID', archive.id],
  ];
  for (const [label, value] of details) {
    const row = overview.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'left', wrapText: true };
    if (label === 'Cycle Total Revenue (PHP)') row.getCell(2).numFmt = PESO_FORMAT;
  }
  overview.addRow([]);
  overview.addRow(['Notes']).font = { bold: true };
  for (const note of [
    'Gross revenue: value of non-cancelled orders placed during the cycle.',
    'Total orders: every order placed during the cycle, including cancelled ones.',
    'Completed orders: orders placed during the cycle that had been delivered when it was archived.',
    'Product demand: units and value of the products themselves in non-cancelled orders placed during the cycle (item prices only, so its total can be lower than gross revenue).',
    'Orders by status: every order placed during the cycle, by its status when it was archived.',
  ]) {
    overview.addRow([note]);
  }

  // Tab 2: one row per day of the cycle.
  addTableSheet(
    workbook,
    'Revenue Over Time',
    [
      { header: 'Date', width: 14, numFmt: 'yyyy-mm-dd' },
      { header: 'Daily Gross Revenue (PHP)', width: 26, numFmt: PESO_FORMAT },
      { header: 'Completed Orders Count', width: 24 },
    ],
    revenueDays.map((day) => [excelDate(day.date), day.grossRevenue ?? 0, day.completedOrdersCount]),
    ['Total', totalRevenue, completedOrders],
  );

  // Tab 3: best sellers first.
  addTableSheet(
    workbook,
    'Product Demand',
    [
      { header: 'Product Name', width: 34 },
      { header: 'SKU', width: 18 },
      { header: 'Units Sold', width: 12 },
      { header: 'Total Revenue Generated (PHP)', width: 30, numFmt: PESO_FORMAT },
    ],
    productDemand.map((row) => [row.productName, row.sku, row.unitsSold, row.totalRevenue ?? 0]),
    [
      'Total',
      null,
      productDemand.reduce((sum, row) => sum + row.unitsSold, 0),
      Math.round(productDemand.reduce((sum, row) => sum + (row.totalRevenue ?? 0), 0) * 100) / 100,
    ],
  );

  // Tab 4: every status, including those with no orders.
  addTableSheet(
    workbook,
    'Orders By Status',
    [
      { header: 'Order Status', width: 16 },
      { header: 'Total Count', width: 13 },
      { header: 'Percentage Share (%)', width: 22, numFmt: '0.0%' },
    ],
    // 62.5 -> 0.625, shown as 62.5%; the integer step keeps it exact (33.3 -> 0.333, not 0.33299...).
    ordersByStatus.map((row) => [statusLabel(row.status), row.count, Math.round(row.percentage * 10) / 1000]),
    ['Total', archive.totalOrdersCount, archive.totalOrdersCount > 0 ? 1 : 0],
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
