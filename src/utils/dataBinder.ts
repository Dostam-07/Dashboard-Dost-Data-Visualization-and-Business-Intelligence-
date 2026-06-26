import { DashboardComponent, MasterDashboardPayload } from '../types';

// Helper to format KPI values beautifully
export function formatValue(val: number, option?: { title?: string; key?: string }): string {
  const titleLower = (option?.title || '').toLowerCase();
  const keyLower = (option?.key || '').toLowerCase();
  
  const isPercent = titleLower.includes('%') || titleLower.includes('percent') || titleLower.includes('rate') || titleLower.includes('margin') || keyLower.includes('percent') || keyLower.includes('rate') || keyLower.includes('margin');
  
  // A count should not have currency formatting
  const isCountTitle = (titleLower.includes('count') || titleLower.includes('number of') || titleLower.includes('transactions') || titleLower.includes('items') || titleLower.includes('records') || titleLower.includes('represented') || titleLower.includes('cities') || titleLower.includes('countries') || titleLower.includes('users') || titleLower.includes('unique') || titleLower.includes('different') || titleLower.includes('distinct')) && 
    !(titleLower.includes('average') || titleLower.includes('avg') || titleLower.includes('mean') || titleLower.includes('value'));

  const isCurrency = !isCountTitle && (titleLower.includes('$') || titleLower.includes('revenue') || titleLower.includes('sales') || titleLower.includes('amount') || titleLower.includes('cost') || keyLower.includes('revenue') || keyLower.includes('sales') || keyLower.includes('cost'));
  const isIndian = titleLower.includes('₹') || titleLower.includes('inr') || titleLower.includes('lakh') || keyLower.includes('inr') || keyLower.includes('rupee');

  if (isPercent) {
    // If it's a rate, standard output is e.g. "45.2%"
    const multiple = val < 1 && val > 0 ? val * 100 : val;
    return `${multiple.toFixed(1)}%`;
  }

  // Format large numbers cleanly
  let formatted = "";
  if (Math.abs(val) >= 1_000_000) {
    formatted = `${(val / 1_000_000).toFixed(1)}M`;
  } else if (Math.abs(val) >= 1_000) {
    formatted = val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else {
    formatted = Number(val.toFixed(2)).toString();
  }

  if (isIndian) {
    return `₹${formatted}`;
  } else if (isCurrency) {
    return `$${formatted}`;
  }

  return formatted;
}

// Resiliently finds the actual column key in a row for a given targetKey
export function findActualKey(row: Record<string, any>, targetKey: string): string | null {
  if (!row || !targetKey) return null;
  
  const keys = Object.keys(row);
  if (keys.includes(targetKey)) return targetKey;

  const targetLower = targetKey.toLowerCase();
  const targetClean = targetLower.replace(/[^a-z0-9]/g, '');

  // 1. Exact case-insensitive match
  let matched = keys.find(k => k.toLowerCase() === targetLower);
  if (matched) return matched;

  // 2. Separator-insensitive match (remove spaces, underscores, hyphens)
  matched = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === targetClean);
  if (matched) return matched;

  // 3. Substring match (e.g. "district" in "District ID")
  matched = keys.find(k => {
    const kl = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    return kl.includes(targetClean) || targetClean.includes(kl);
  });
  if (matched) return matched;

  return null;
}

// Scans words to perform a high-precision stemmed keyword overlap match
export function isFuzzyKeywordMatch(title: string, colName: string): boolean {
  const tLower = title.toLowerCase();
  const cLower = colName.toLowerCase();
  
  const stem = (w: string) => {
    let s = w.toLowerCase();
    if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
    if (s.endsWith('es')) return s.slice(0, -2);
    if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
    return s;
  };

  const tStemmed = stem(tLower);
  const cStemmed = stem(cLower);
  if (tStemmed.includes(cStemmed) || cStemmed.includes(tStemmed)) return true;

  const tWords = tLower.split(/[^a-z0-9]/).filter(w => w.length > 2);
  const cWords = cLower.split(/[^a-z0-9]/).filter(w => w.length > 2);
  
  for (const tw of tWords) {
    const twStem = stem(tw);
    for (const cw of cWords) {
      const cwStem = stem(cw);
      if (twStem === cwStem || tw.includes(cw) || cw.includes(tw) || twStem.includes(cwStem) || cwStem.includes(twStem)) {
        return true;
      }
    }
  }
  return false;
}

// Binds real in-memory data rows to components dynamically
export function bindDatasetToComponents(
  components: DashboardComponent[],
  rows: any[]
): DashboardComponent[] {
  if (!rows || rows.length === 0) return components;

  return components.map(comp => {
    // 1. KPI Card binding
    if (comp.type === 'kpi_card') {
      const config = comp.config || {};
      let targetField: string | null = null;
      let aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' = 'sum';
      const allDatasetKeys = Object.keys(rows[0] || {});

      // Parse {{BIND:fieldName:aggType}} if present
      const kpiValString = comp.config?.kpiValue || '';
      const bindMatch = kpiValString.match(/\{\{BIND:([^:]+):?([^}]+)?\}\}/);

      const titleLower = (comp.title || '').toLowerCase();
      
      let hasTitleOverride = false;
      if (!bindMatch) {
        if (titleLower.includes('countr') || titleLower.includes('nation')) {
          const countryCol = allDatasetKeys.find(k => k.toLowerCase().includes('country') || k.toLowerCase().includes('nation'));
          if (countryCol) {
            targetField = countryCol;
            aggregation = 'count';
            hasTitleOverride = true;
          }
        } else if (titleLower.includes('cit') || titleLower.includes('town')) {
          const cityCol = allDatasetKeys.find(k => k.toLowerCase().includes('city') || k.toLowerCase().includes('town') || k.toLowerCase().includes('municipal'));
          if (cityCol) {
            targetField = cityCol;
            aggregation = 'count';
            hasTitleOverride = true;
          }
        } else if (titleLower.includes('product') || titleLower.includes('item')) {
          if (titleLower.includes('different') || titleLower.includes('unique') || titleLower.includes('distinct') || titleLower.includes('count')) {
            const prodCol = allDatasetKeys.find(k => k.toLowerCase().includes('product') || k.toLowerCase().includes('item') || k.toLowerCase().includes('sku'));
            if (prodCol) {
              targetField = prodCol;
              aggregation = 'count';
              hasTitleOverride = true;
            }
          }
        } else if (titleLower.includes('average transaction') || titleLower.includes('average sales') || titleLower.includes('avg transaction') || titleLower.includes('average order') || titleLower.includes('mean transaction') || (titleLower.includes('average') && (titleLower.includes('value') || titleLower.includes('amount') || titleLower.includes('session') || titleLower.includes('method switches'))) || titleLower.includes('avg session') || titleLower.includes('avg method switches')) {
          aggregation = 'avg';
          const salesCol = allDatasetKeys.find(k => k.toLowerCase().includes('sales') || k.toLowerCase().includes('revenue') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('value') || k.toLowerCase().includes('price') || k.toLowerCase().includes('spend') || k.toLowerCase().includes('duration') || k.toLowerCase().includes('switches'));
          if (salesCol) {
            targetField = salesCol;
            hasTitleOverride = true;
          }
        } else if (titleLower.includes('total transaction') || titleLower.includes('transactions count') || titleLower.includes('number of transactions') || titleLower.includes('order count') || titleLower.includes('total orders') || titleLower.includes('transactions')) {
          aggregation = 'count';
          const idCol = allDatasetKeys.find(k => k.toLowerCase().includes('order') || k.toLowerCase().includes('transaction') || k.toLowerCase().includes('invoice') || k.toLowerCase().includes('id'));
          if (idCol) {
            targetField = idCol;
            hasTitleOverride = true;
          }
        } else if (titleLower.includes('total sales') || titleLower.includes('sales value') || titleLower.includes('revenue') || titleLower.includes('sales total') || titleLower.includes('total revenue')) {
          aggregation = 'sum';
          const salesCol = allDatasetKeys.find(k => k.toLowerCase().includes('sales') || k.toLowerCase().includes('revenue') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('value'));
          if (salesCol) {
            targetField = salesCol;
            hasTitleOverride = true;
          }
        }
      }

      if (!hasTitleOverride) {
        if (bindMatch) {
          targetField = bindMatch[1];
          aggregation = (bindMatch[2] || 'sum') as any;
        } else if (config.yAxisKeys && config.yAxisKeys.length > 0) {
          targetField = config.yAxisKeys[0];
        } else if ((config as any).yAxisKey) {
          targetField = Array.isArray((config as any).yAxisKey) ? (config as any).yAxisKey[0] : (config as any).yAxisKey;
        } else {
          // Infer from column keys of dataset
          const compDatasetKeys = Object.keys(rows[0] || {});
          let titleLower = (comp.title || '').toLowerCase();
          
          // Find a column matching parts of the title
          let matchingKey = compDatasetKeys.find(k => {
            const kl = k.toLowerCase();
            return titleLower.includes(kl) || kl.includes(titleLower);
          });

          if (!matchingKey) {
            // Fall back to robust stemmed matching
            matchingKey = compDatasetKeys.find(k => isFuzzyKeywordMatch(comp.title || '', k));
          }

          if (matchingKey) {
            targetField = matchingKey;
          } else {
            // Fallback check: find first numeric key (excluding common IDs)
            targetField = compDatasetKeys.filter(k => k !== 'id' && !k.toLowerCase().includes('id')).find(k => {
              const cleanStr = String(rows[0]?.[k] || '').replace(/[\$,₹,%]/g, '').trim();
              const v = Number(cleanStr);
              return cleanStr !== "" && !isNaN(v);
            }) || null;
          }
        }
      }

      // Resolve the actual key from the raw rows
      const mappedTarget = targetField ? findActualKey(rows[0], targetField) : null;

      const isRate = titleLower.includes('%') || titleLower.includes('rate') || titleLower.includes('ratio') || titleLower.includes('percent') || titleLower.includes('success');

      // Smartly infer logical aggregation if not pre-bound
      let resolvedAggregation = aggregation;
      if (!bindMatch && !hasTitleOverride) {
        if (titleLower.includes('average') || titleLower.includes('avg') || titleLower.includes('mean')) {
          resolvedAggregation = 'avg';
        } else if (titleLower.includes('max') || titleLower.includes('highest') || titleLower.includes('maximum')) {
          resolvedAggregation = 'max';
        } else if (titleLower.includes('min') || titleLower.includes('lowest') || titleLower.includes('minimum')) {
          resolvedAggregation = 'min';
        } else if (
          titleLower.includes('count') || 
          titleLower.includes('number of') || 
          titleLower.includes('total of') || 
          titleLower.includes('transactions') || 
          titleLower.includes('items') || 
          titleLower.includes('records') ||
          titleLower.includes('represented') ||
          titleLower.includes('active cities') ||
          titleLower.includes('cities') ||
          titleLower.includes('countries') ||
          titleLower.includes('users')
        ) {
          resolvedAggregation = 'count';
        }
      }

      if (isRate && resolvedAggregation === 'sum') {
        resolvedAggregation = 'avg';
      }

      // If we found a target field or are counting, or mapping for rate metrics
      if (mappedTarget || resolvedAggregation === 'count' || isRate) {
        const isDistinctCount = 
          titleLower.includes('represented') || 
          titleLower.includes('unique') || 
          titleLower.includes('distinct') || 
          titleLower.includes('different') || 
          titleLower.includes('cities') ||
          titleLower.includes('countries') ||
          titleLower.includes('users') ||
          (titleLower.includes('transactions') && mappedTarget && (mappedTarget.toLowerCase().includes('id') || mappedTarget.toLowerCase().includes('number')));

        let isCountAggregation = resolvedAggregation === 'count';
        let treatAsCount = isCountAggregation || isDistinctCount;

        // Force validation check if we mapped a specific target, even if the LLM suggested 'count'
        // This prevents the silent fallback to row-count on non-numeric columns.
        if (mappedTarget && !isDistinctCount && !isRate) {
          let validCount = 0;
          const sampleSize = Math.min(rows.length, 50);
          for (let i = 0; i < sampleSize; i++) {
            const rawVal = rows[i]?.[mappedTarget];
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
              const cleanStr = String(rawVal).replace(/[\$,₹,%]/g, '');
              let num = Number(cleanStr);
              if (isNaN(num) && cleanStr.match(/[0-9.]+[L|cr|k|m]/i)) num = 1; // mark as valid
              if (isNaN(num) && cleanStr.includes(':')) {
                const parts = cleanStr.split(':');
                if (parts.length > 1 && parts[parts.length - 1].match(/[0-9]+/)) num = 1;
              }
              if (!isNaN(num)) {
                validCount++;
              }
            }
          }

          if (validCount < sampleSize * 0.2) {
             if (titleLower.includes('count') || titleLower.includes('total') || titleLower.includes('number')) {
                 treatAsCount = true;
             } else {
                 // Fallback: Use row count if no numeric column found at all
                 targetField = allDatasetKeys[0]; // arbitrary column
                 aggregation = 'count';
                 treatAsCount = true;
             }
          } else {
            // It IS numeric, so don't treat it as a count aggregation
            treatAsCount = false;
          }
        }

        const values = rows
          .map(r => {
            if (!mappedTarget) return 1;
            const sv = String(r[mappedTarget]).replace(/[\$,₹,%]/g, '');
            let nv = Number(sv);
            
            if (isNaN(nv) && sv.match(/[0-9.]+[L|cr|k|m]/i)) {
              const match = sv.match(/([0-9.]+)([L|cr|k|m]+)/i);
              if (match) {
                let val = Number(match[1]);
                const suffix = match[2].toLowerCase();
                if (suffix === 'l') val *= 100000;
                else if (suffix === 'cr') val *= 10000000;
                else if (suffix === 'k') val *= 1000;
                else if (suffix === 'm') val *= 1000000;
                nv = val;
              }
            }
            if (isNaN(nv) && sv.includes(':')) {
              const parts = sv.split(':');
              if (parts.length > 1) {
                const potentialNumStr = parts[parts.length - 1].trim().replace(/[\$,₹,%]/g, '');
                const match = potentialNumStr.match(/([0-9.]+)([L|cr|k|m]*)/i);
                if (match) {
                   let val = Number(match[1]);
                   const suffix = match[2].toLowerCase();
                   if (suffix === 'l') val *= 100000;
                   else if (suffix === 'cr') val *= 10000000;
                   else if (suffix === 'k') val *= 1000;
                   else if (suffix === 'm') val *= 1000000;
                   nv = val;
                }
              }
            }
            
            return isNaN(nv) ? null : nv;
          })
          .filter((v): v is number => v !== null);

        let result = 0;

        // Only do categorical success rate checking if it is indeed a categorical column!
        if (isRate && mappedTarget && treatAsCount) {
          // Calculate positive success ratios for categorical columns
          const positiveKeywords = ['completed', 'complete', 'success', 'successful', 'yes', 'true', 'pass', 'passed', 'active', '1', 'y', 'ok', 'done', 'delivered', 'valid', 'resolved', 'solved', 'succeeded'];
          let positives = 0;
          let validTotal = 0;
          
          rows.forEach(r => {
            const rawVal = r[mappedTarget];
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
              validTotal++;
              const valStr = String(rawVal).trim().toLowerCase();
              if (positiveKeywords.some(kw => valStr === kw || valStr.startsWith(kw) || kw.startsWith(valStr) || valStr.includes(kw))) {
                positives++;
              }
            }
          });

          if (validTotal > 0) {
            result = positives / validTotal;
          } else {
            result = 0;
          }
        } else {
          // Standard aggregates
          if (treatAsCount || resolvedAggregation === 'count') {
            if (isDistinctCount && mappedTarget) {
              const uniqueValues = new Set(
                rows
                  .map(r => r[mappedTarget])
                  .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
                  .map(v => String(v).trim().toLowerCase())
              );
              result = uniqueValues.size;
            } else {
              result = rows.length;
            }
          } else if (resolvedAggregation === 'sum') {
            result = values.reduce((a, b) => a + b, 0);
          } else if (resolvedAggregation === 'avg') {
            const sum = values.reduce((a, b) => a + b, 0);
            result = values.length > 0 ? sum / values.length : 0;
          } else if (resolvedAggregation === 'min') {
            result = values.length > 0 ? Math.min(...values) : 0;
          } else if (resolvedAggregation === 'max') {
            result = values.length > 0 ? Math.max(...values) : 0;
          }
        }

        // Compute comparison trend if possible
        let trendValue = comp.config?.kpiTrend || { direction: 'neutral', label: '+0% vs baseline' };
        const datasetKeys = Object.keys(rows[0] || {});
        const dateKey = datasetKeys.find(k => k.toLowerCase().includes('date') || k.toLowerCase().includes('time'));
        if (dateKey && rows.length >= 4) {
          try {
            // Sort rows by date (supporting excel dates too)
            const sortedRows = [...rows].sort((a, b) => {
              const parseVal = (v: any) => {
                const num = Number(v);
                if (!isNaN(num) && num > 30000 && num < 60000) {
                  return num;
                }
                return Date.parse(v) || 0;
              };
              return parseVal(a[dateKey]) - parseVal(b[dateKey]);
            });
            const mid = Math.floor(sortedRows.length / 2);
            const firstHalf = sortedRows.slice(0, mid);
            const secondHalf = sortedRows.slice(mid);

            let sumFirst = 0;
            let sumSecond = 0;

            if (isDistinctCount && mappedTarget) {
              const uniqueFirst = new Set(firstHalf.map(r => String(r[mappedTarget] || '').trim().toLowerCase()).filter(Boolean));
              const uniqueSecond = new Set(secondHalf.map(r => String(r[mappedTarget] || '').trim().toLowerCase()).filter(Boolean));
              sumFirst = uniqueFirst.size;
              sumSecond = uniqueSecond.size;
            } else if (resolvedAggregation === 'avg' && mappedTarget) {
              const firstVals = firstHalf.map(r => Number(String(r[mappedTarget]).replace(/[\$,₹,%]/g, ''))).filter(v => !isNaN(v));
              const secondVals = secondHalf.map(r => Number(String(r[mappedTarget]).replace(/[\$,₹,%]/g, ''))).filter(v => !isNaN(v));
              sumFirst = firstVals.length > 0 ? firstVals.reduce((a, b) => a + b, 0) / firstVals.length : 0;
              sumSecond = secondVals.length > 0 ? secondVals.reduce((a, b) => a + b, 0) / secondVals.length : 0;
            } else if (resolvedAggregation === 'count' || treatAsCount) {
              sumFirst = firstHalf.length;
              sumSecond = secondHalf.length;
            } else {
              const firstVals = firstHalf.map(r => mappedTarget ? Number(String(r[mappedTarget]).replace(/[\$,₹,%]/g, '')) : 1).filter(v => !isNaN(v));
              const secondVals = secondHalf.map(r => mappedTarget ? Number(String(r[mappedTarget]).replace(/[\$,₹,%]/g, '')) : 1).filter(v => !isNaN(v));
              sumFirst = firstVals.reduce((a, b) => a + b, 0);
              sumSecond = secondVals.reduce((a, b) => a + b, 0);
            }

            if (sumFirst > 0) {
              const change = ((sumSecond - sumFirst) / sumFirst) * 100;
              const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
              const prefix = change > 0 ? '+' : '';
              trendValue = {
                direction: direction as any,
                label: `${prefix}${change.toFixed(1)}% vs prior period`
              };
            }
          } catch (e) {}
        }

        return {
          ...comp,
          config: {
            ...config,
            kpiValue: formatValue(result, { title: comp.title, key: mappedTarget || undefined }),
            kpiTrend: trendValue
          }
        };
      }
    }

    // 2. Chart bindings (bar_chart, line_chart, area_chart, pie_chart, scatter_chart, map_chart, geo_map)
    let xAxisKey = comp.config?.xAxisKey || (comp.config as any)?.xAxis;
    let yAxisKeys = [...(comp.config?.yAxisKeys || [])];

    if (yAxisKeys.length === 0 && (comp.config as any)?.yAxisKey) {
      if (Array.isArray((comp.config as any).yAxisKey)) {
        yAxisKeys = [...(comp.config as any).yAxisKey];
      } else {
        yAxisKeys = [(comp.config as any).yAxisKey];
      }
    }
    if (yAxisKeys.length === 0 && (comp.config as any)?.yAxis) {
      if (Array.isArray((comp.config as any).yAxis)) {
        yAxisKeys = [...(comp.config as any).yAxis];
      } else {
        yAxisKeys = [(comp.config as any).yAxis];
      }
    }

    const datasetKeys = Object.keys(rows[0] || {});

    // Intelligent index-column and sequential key detector
    const isLowValueIndexKey = (key: string) => {
      if (!key) return true;
      const lower = key.toLowerCase();
      if (lower === 'id' || lower === 'index' || lower === 'row' || lower === 'sno' || lower === 's.no' || lower === 'rownum' || lower === 'serial' || lower === 'row_id' || lower === '_id') return true;
      
      const values = rows.slice(0, 10).map(r => Number(String(r[key]).replace(/[\$,₹,%]/g, ''))).filter(v => !isNaN(v));
      if (values.length >= 3) {
        let isSequential = true;
        for (let i = 1; i < values.length; i++) {
          if (values[i] !== values[i - 1] + 1) {
            isSequential = false;
            break;
          }
        }
        if (isSequential && (values[0] === 0 || values[0] === 1)) {
          return true;
        }
      }
      return false;
    };

    const hasBetterKeyThanIndex = (currentX: string | undefined) => {
      if (!currentX) return true;
      return isLowValueIndexKey(currentX);
    };

    let titleXMatched: string | null = null;
    let titleYMatched: string | null = null;

    // Parse the chart title for "vs" or "Correlation" style references to extract keys
    const titleLower = (comp.title || '').toLowerCase();
    if (titleLower.includes(' vs ') || titleLower.includes(' vs. ') || titleLower.includes(' correlation ') || titleLower.includes(' relationship ')) {
      let parts: string[] = [];
      if (titleLower.includes(' vs ')) {
        parts = comp.title.split(/ vs /i);
      } else if (titleLower.includes(' vs. ')) {
        parts = comp.title.split(/ vs\. /i);
      } else if (titleLower.includes(' correlation ')) {
        const cleanTitle = comp.title.replace(/correlation/i, '').replace(/relationship/i, '').trim();
        parts = cleanTitle.split(/ and | & /i);
      }

      if (parts.length >= 2) {
        const rawKeywordX = parts[0].trim().toLowerCase();
        const rawKeywordY = parts[1].replace(/correlation/i, '').replace(/relationship/i, '').trim().toLowerCase();

        // Search the available columns
        const colX = datasetKeys.find(k => {
          const kl = k.toLowerCase();
          return kl === rawKeywordX || kl.includes(rawKeywordX) || rawKeywordX.includes(kl);
        });
        const colY = datasetKeys.find(k => {
          const kl = k.toLowerCase();
          return kl === rawKeywordY || kl.includes(rawKeywordY) || rawKeywordY.includes(kl);
        });

        if (colX) titleXMatched = colX;
        if (colY) titleYMatched = colY;
      }
    }

    // Set xAxisKey using intelligent ranking
    if (!xAxisKey || hasBetterKeyThanIndex(xAxisKey)) {
      if (titleXMatched) {
        xAxisKey = titleXMatched;
      } else {
        // A. Date/Time columns are always the best temporal X axis
        const dateCol = datasetKeys.find(k => {
          const l = k.toLowerCase();
          return l.includes('date') || l.includes('time') || l.includes('year') || l.includes('month') || l.includes('day') || l.includes('quarter') || l.includes('period');
        });

        // B. Name/Title/Label / Category columns (e.g. Product Name, Country, Segment, Status)
        const nameKeywords = ['name', 'label', 'title', 'item', 'product', 'category', 'type', 'group', 'status', 'segment', 'customer', 'supplier', 'region', 'state', 'city', 'country'];
        const nameCol = datasetKeys.find(k => {
          const l = k.toLowerCase();
          if (l.includes('id') || l === 'id') return false;
          return nameKeywords.some(kw => l.includes(kw));
        });

        // C. Clean custom categorical string columns
        const textCol = datasetKeys.find(k => {
          if (k === dateCol || k === nameCol) return false;
          const sample = rows.slice(0, 5).map(r => r[k]);
          const nonNumericCount = sample.filter(v => typeof v === 'string' && isNaN(Number(String(v).replace(/[\$,₹,%]/g, '')))).length;
          return nonNumericCount >= sample.length * 0.6;
        });

        if (dateCol) {
          xAxisKey = dateCol;
        } else if (nameCol) {
          xAxisKey = nameCol;
        } else if (textCol) {
          xAxisKey = textCol;
        } else {
          // fallback to any non-low-value index key first
          const nonIndexCol = datasetKeys.find(k => !isLowValueIndexKey(k));
          xAxisKey = nonIndexCol || datasetKeys[0];
        }
      }
    }

    // Set yAxisKeys using intelligent matching
    if ((!yAxisKeys || yAxisKeys.length === 0 || yAxisKeys[0] === 'value') && datasetKeys.length > 0) {
      if (titleYMatched && titleYMatched !== xAxisKey) {
        yAxisKeys = [titleYMatched];
      } else {
        // Find numeric columns
        const numericCols = datasetKeys.filter(k => {
          if (k === xAxisKey) return false;
          const sampleSize = Math.min(rows.length, 10);
          let numCount = 0;
          for (let i = 0; i < sampleSize; i++) {
            const val = Number(String(rows[i]?.[k]).replace(/[\$,₹,%]/g, ''));
            if (!isNaN(val)) numCount++;
          }
          return numCount >= sampleSize * 0.6;
        });

        if (numericCols.length > 0) {
          // Find numerical column that matches component title words
          const titleWords = (comp.title || '').toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 2 && w !== 'vs' && w !== 'correlation');
          const matchingNumCols = numericCols.filter(nc => {
            const ncLower = nc.toLowerCase();
            return titleWords.some(tw => ncLower.includes(tw));
          });

          if (matchingNumCols.length > 0) {
            yAxisKeys = [matchingNumCols[0]];
          } else {
            // Avoid selecting index/ID columns as metrics if we have alternative numeric columns
            const bestNumericCol = numericCols.find(k => !isLowValueIndexKey(k)) || numericCols[0];
            yAxisKeys = [bestNumericCol];
          }
        } else {
          return {
            ...comp,
            config: { ...comp.config, error: "This chart needs at least one numeric column — none was found" }
          };
        }
      }
    }

    if (xAxisKey && yAxisKeys.length > 0) {
      let resolvedXKey = findActualKey(rows[0], xAxisKey) || xAxisKey;
      
      // Fallback: If exact + fuzzy resolution fails for xAxisKey:
      if (!resolvedXKey || !(resolvedXKey in rows[0])) {
        const fallbackX = datasetKeys.find(k => {
          const sample = rows.slice(0,5).map(r => r[k]);
          return sample.some(v => typeof v === 'string' && isNaN(Number(v)));
        });
        resolvedXKey = fallbackX || datasetKeys[0];
        xAxisKey = resolvedXKey; 
      }

      const resolvedYKeys = yAxisKeys.map(k => {
        const resolved = findActualKey(rows[0], k) || k;
        // Fallback: If resolved key doesn't exist, use first numeric column not equal to xAxisKey
        if (!(resolved in rows[0])) {
            const fallbackY = datasetKeys.find(key => key !== xAxisKey && !isNaN(Number(rows[0][key])));
            return { original: k, resolved: fallbackY || k };
        }
        return { original: k, resolved };
      });

      // Group rows by resolvedXKey
      const groups: Record<string, { _size: number, values: Record<string, number[]> }> = {};

      for (const row of rows) {
        if (!row) continue;
        const xValueRaw = row[resolvedXKey];
        if (xValueRaw === undefined || xValueRaw === null || String(xValueRaw).trim() === '') continue;
        
        let xValueStr = String(xValueRaw).trim();
        const colLower = resolvedXKey.toLowerCase();
        const isDateColumn = colLower.includes('date') || colLower.includes('time') || colLower.includes('day') || colLower.includes('month') || colLower.includes('year') || colLower.includes('period');
        const titleLower = (comp.title || '').toLowerCase();
        const isExpectedTimeline = isDateColumn || titleLower.includes('trend') || titleLower.includes('time') || titleLower.includes('timeline') || titleLower.includes('over time') || titleLower.includes('history');
        const xNum = Number(xValueRaw);

        if (!isNaN(xNum) && isExpectedTimeline && xNum > 30000 && xNum < 60000) {
          try {
            const excelEpoch = new Date(1899, 11, 30);
            const jsDate = new Date(excelEpoch.getTime() + xNum * 24 * 60 * 60 * 1000);
            const year = jsDate.getFullYear();
            const month = String(jsDate.getMonth() + 1).padStart(2, '0');
            const day = String(jsDate.getDate()).padStart(2, '0');
            xValueStr = `${year}-${month}-${day}`;
          } catch (e) {}
        } else if (Date.parse(xValueStr) && xValueStr.length > 10) {
          xValueStr = xValueStr.split('T')[0];
        }

        if (!groups[xValueStr]) {
          groups[xValueStr] = {
            _size: 0,
            values: {}
          };
          yAxisKeys.forEach(k => {
            groups[xValueStr].values[k] = [];
          });
        }

        groups[xValueStr]._size += 1;

        resolvedYKeys.forEach(({ original, resolved }) => {
          if (row[resolved] !== undefined && row[resolved] !== null) {
            const numStr = String(row[resolved]).replace(/[\$,₹,%]/g, '');
            const num = Number(numStr);
            if (!isNaN(num)) {
              groups[xValueStr].values[original].push(num);
            }
          }
        });
      }

      // Compile group calculations
      let boundSeriesData = Object.entries(groups).map(([xVal, groupObj]) => {
        const rowObj: Record<string, any> = { [xAxisKey!]: xVal };
        const groupSize = groupObj._size;

        yAxisKeys.forEach(k => {
          const arr = groupObj.values[k] || [];
          if (arr.length === 0) {
            // Fallback: If no numerical metrics exist, count group rows (great for category logs)
            rowObj[k] = groupSize;
          } else {
            const isRate = k.toLowerCase().includes('rate') || k.toLowerCase().includes('percent') || k.toLowerCase().includes('ratio') || k.toLowerCase().includes('margin') || k.toLowerCase().includes('avg');
            if (isRate) {
              rowObj[k] = Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
            } else {
              rowObj[k] = Number((arr.reduce((a, b) => a + b, 0)).toFixed(2));
            }
          }
        });
        return rowObj;
      });

      // Sort chronological or alphabetical
      const isDate = boundSeriesData.some(item => {
        const v = item[xAxisKey!];
        return v && !isNaN(Date.parse(v)) && isNaN(Number(v));
      });

      if (isDate) {
        boundSeriesData = boundSeriesData.sort((a, b) => Date.parse(a[xAxisKey!]) - Date.parse(b[xAxisKey!]));
      } else {
        boundSeriesData = boundSeriesData.sort((a, b) => {
          const aX = a[xAxisKey!];
          const bX = b[xAxisKey!];
          if (!isNaN(Number(aX)) && !isNaN(Number(bX))) {
            return Number(aX) - Number(bX);
          }
          return String(aX).localeCompare(String(bX));
        });
      }

      const defaultMaxPoints: Record<string, number> = {
        pie_chart: 8,
        bar_chart: 25,
        line_chart: 200,
        area_chart: 200,
        scatter_chart: 150,
        default: 100
      };
      const maxPoints = comp.config?.maxDataPoints || defaultMaxPoints[comp.type] || defaultMaxPoints.default;
      let limitLabel: string | undefined = undefined;
      
      if (boundSeriesData.length > maxPoints) {
        // If we are truncating, we should ideally sort by the first yAxisKey descending so we keep the largest values
        if (yAxisKeys.length > 0) {
           boundSeriesData.sort((a, b) => Number(b[yAxisKeys[0]] || 0) - Number(a[yAxisKeys[0]] || 0));
        }
        limitLabel = `Showing top ${maxPoints} of ${boundSeriesData.length} groups`;
        boundSeriesData = boundSeriesData.slice(0, maxPoints);
      }

      return {
        ...comp,
        config: {
          ...comp.config,
          xAxisKey,
          yAxisKeys,
          limitLabel
        },
        seriesData: boundSeriesData
      };
    }

    return comp;
  });
}

// Binds the active dataset into the full layout
export function bindPayloadDataset(payload: MasterDashboardPayload, rows: any[]): MasterDashboardPayload {
  if (!rows || rows.length === 0) return payload;
  const boundComponents = bindDatasetToComponents(payload.components, rows);
  return {
    ...payload,
    components: boundComponents
  };
}
