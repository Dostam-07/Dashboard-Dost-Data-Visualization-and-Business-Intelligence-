import { DashboardComponent, MasterDashboardPayload, DashboardComponentType, DashboardFilter } from '../types';

export interface Column {
  name: string;
  type: 'numeric' | 'categorical' | 'date' | 'geographic';
}

export interface AttachedDataset {
  columns: Column[];
  rows: any[];
  fileName: string;
}

export function buildSimpleDashboard(dataset: AttachedDataset): MasterDashboardPayload {
  const { columns, rows, fileName } = dataset;
  const components: DashboardComponent[] = [];
  
  // Step 1: Classify columns
  const numericCols = columns.filter(c => c.type === 'numeric');
  const categoryCols = columns.filter(c => c.type === 'categorical' && !isHighCardinality(c, rows));
  const dateCols = columns.filter(c => c.type === 'date');
  
  // Step 2: Generate KPI cards (one per numeric column, max 4)
  numericCols.slice(0, 4).forEach((col, i) => {
    const total = rows.reduce((sum, r) => sum + (Number(r[col.name]) || 0), 0);
    components.push({
      id: `kpi_${i}`,
      type: 'kpi_card',
      title: col.name,
      tab: 'Overview',
      layout: { sm: 12, md: 6, lg: 3 },
      config: {
        kpiValue: total.toLocaleString(), // simplified formatter for now
      },
      seriesData: []
    });
  });
  
  // Step 3: Generate Bar chart (category × numeric, if both exist)
  if (categoryCols.length > 0 && numericCols.length > 0) {
    const xCol = categoryCols[0];
    const yCol = numericCols[0];
    
    // Simple grouping
    const groups: Record<string, number> = {};
    rows.forEach(r => {
        const val = r[xCol.name];
        if (val) {
            groups[val] = (groups[val] || 0) + (Number(r[yCol.name]) || 0);
        }
    });

    const seriesData = Object.entries(groups).map(([name, value]) => ({ [xCol.name]: name, [yCol.name]: value }));

    components.push({
      id: 'bar_0',
      type: 'bar_chart',
      title: `${yCol.name} by ${xCol.name}`,
      tab: 'Overview',
      layout: { sm: 12, md: 12, lg: 6 },
      config: { xAxisKey: xCol.name, yAxisKeys: [yCol.name] },
      seriesData
    });
  }
  
  // Step 5: Generate Line/Area chart for time series (if date column exists)
  if (dateCols.length > 0 && numericCols.length > 0) {
    const xCol = dateCols[0];
    const yCol = numericCols[0];
    
    // Line chart
    components.push({
      id: 'line_0',
      type: 'line_chart',
      title: `${yCol.name} Over Time`,
      tab: 'Trends',
      layout: { sm: 12, md: 12, lg: 12 },
      config: { xAxisKey: xCol.name, yAxisKeys: [yCol.name] },
      seriesData: rows.map(r => ({ [xCol.name]: r[xCol.name], [yCol.name]: Number(r[yCol.name]) || 0 }))
    });
  }
  
  // Step 7: Build filters from category columns
  const filters: DashboardFilter[] = categoryCols.slice(0, 3).map(col => ({
    id: `filter_${col.name}`,
    label: col.name,
    type: 'category_select',
    targetKeys: components.map(c => c.id),
    options: [...new Set(rows.map(r => String(r[col.name])))]
  }));
  
  return {
    dashboardId: `dash_${Date.now()}`,
    title: fileName.replace(/\.[^.]+$/, ''),
    components,
    filters,
  };
}

function isHighCardinality(col: Column, rows: any[]): boolean {
  const unique = new Set(rows.map(r => r[col.name])).size;
  return unique > 50 || unique > rows.length * 0.8;
}
