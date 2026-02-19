/**
 * Email Renderer Utility
 *
 * Combines email template with quote data to generate HTML and plain text emails.
 * Supports dynamic updates when quote allocation/metrics change.
 */

import type { EmailTemplate, QuoteEmailData, DailyAllocation } from './types';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function replacePlaceholders(template: string, data: Record<string, string>): string {
  const bracketMap: Record<string, string> = {
    guestName: 'Guest Name',
    hotelName: 'Hotel Name',
    contactName: 'Contact Name',
    contactEmail: 'Contact Email',
    contactPhone: 'Contact Phone',
  };

  let result = template;

  Object.entries(data).forEach(([key, value]) => {
    const escapedValue = escapeHtml(value ?? '');

    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escapedValue);

    const bracketKey = bracketMap[key];
    if (bracketKey) {
      result = result.replace(new RegExp(`\\[${bracketKey}\\]`, 'g'), escapedValue);
    }
  });

  return result;
}

function formatEmailDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface RoomTypeRow {
  name: string;
  count: number;
  ratesByDate: number[];
  rowTotal: number;
}

interface MatrixData {
  dateHeaders: string[];
  roomRows: RoomTypeRow[];
  dailyTotals: number[];
  dailyRoomCounts: number[];
  totalRoomCount: number;
}

function buildRoomTypeMatrix(allocation: DailyAllocation[]): MatrixData {
  const dateHeaders = allocation.map(day => formatShortDate(day.date));

  const dayLookups = allocation.map(day => {
    const lookup = new Map<string, { count: number; rate: number }>();
    for (const room of day.rooms) {
      lookup.set(room.roomType, { count: room.count, rate: room.rate });
    }
    return lookup;
  });

  const roomTypeNames: string[] = [];
  for (const day of allocation) {
    for (const room of day.rooms) {
      if (room.count > 0 && !roomTypeNames.includes(room.roomType)) {
        roomTypeNames.push(room.roomType);
      }
    }
  }

  const dailyTotals: number[] = new Array(allocation.length).fill(0);
  const dailyRoomCounts: number[] = new Array(allocation.length).fill(0);

  const roomRows: RoomTypeRow[] = roomTypeNames.map(name => {
    let count = 0;
    let countFound = false;
    let rowTotal = 0;

    const ratesByDate = dayLookups.map((lookup, dayIndex) => {
      const room = lookup.get(name);
      if (!room || room.count === 0) return 0;

      if (!countFound) {
        count = room.count;
        countFound = true;
      }

      const dayRevenue = room.rate * room.count;
      rowTotal += dayRevenue;
      dailyTotals[dayIndex] += dayRevenue;
      dailyRoomCounts[dayIndex] += room.count;

      return room.rate;
    });

    return { name, count, ratesByDate, rowTotal };
  });

  const totalRoomCount = dailyRoomCounts.reduce((sum, c) => sum + c, 0);

  return { dateHeaders, roomRows, dailyTotals, dailyRoomCounts, totalRoomCount };
}

function formatRoomsPerNight(matrix: MatrixData): string {
  const counts = matrix.dailyRoomCounts;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (min === max) return `${min} rooms/night`;
  return `${min}–${max} rooms/night`;
}

export function renderEmailHtml(template: EmailTemplate, data: QuoteEmailData): string {
  const placeholderData = {
    guestName: data.guestName || 'Guest',
    hotelName: data.hotelName,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
  };

  const greeting = replacePlaceholders(template.greeting, placeholderData);
  const intro = replacePlaceholders(template.introduction, placeholderData);
  const closing = replacePlaceholders(template.closing, placeholderData);

  const rawSignature = replacePlaceholders(template.signature, placeholderData);
  const signature = rawSignature
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');

  const matrix = buildRoomTypeMatrix(data.allocation);
  const dateColCount = matrix.dateHeaders.length;
  const totalColSpan = dateColCount + 2;

  const thStyle =
    'padding: 10px 12px; text-align: center; border-bottom: 2px solid #e0e0e0; font-weight: 600; white-space: nowrap;';
  const tdStyle = 'padding: 8px 12px; text-align: center; border-bottom: 1px solid #e0e0e0; white-space: nowrap;';
  const tdLeftStyle = 'padding: 8px 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;';
  const tdRightStyle =
    'padding: 8px 12px; text-align: right; border-bottom: 1px solid #e0e0e0; white-space: nowrap; font-weight: 600;';

  const dateHeaderCells = matrix.dateHeaders.map(h => `<th style="${thStyle}">${h}</th>`).join('');

  const roomRowsHtml = matrix.roomRows
    .map(row => {
      const rateCells = row.ratesByDate
        .map(rate => `<td style="${tdStyle}">${rate > 0 ? formatCurrency(rate) : '-'}</td>`)
        .join('');
      return `<tr>
          <td style="${tdLeftStyle} font-weight: 500;">${row.count} ${escapeHtml(row.name)}</td>
          ${rateCells}
          <td style="${tdRightStyle}">${formatCurrency(row.rowTotal)}</td>
        </tr>`;
    })
    .join('');

  const dailyTotalCells = matrix.dailyTotals
    .map(total => `<td style="${tdStyle} font-weight: 600;">${formatCurrency(total)}</td>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Group Booking Quote</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0; padding: 20px;">
  <div style="max-width: 1000px; margin: 0 auto;">
  <p style="margin-bottom: 16px;">${greeting}</p>

  <p style="margin-bottom: 16px;">${intro}</p>

  <div style="margin: 24px 0;">
    <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #1a1a1a;">Quote Summary</h3>
    <p style="margin-bottom: 8px; color: #666666;">
      <strong>Check-in:</strong> ${formatEmailDate(data.checkInDate)}<br>
      <strong>Check-out:</strong> ${formatEmailDate(data.checkOutDate)}<br>
      <strong>Duration:</strong> ${data.nights} night${data.nights !== 1 ? 's' : ''}<br>
      <strong>Rooms:</strong> ${formatRoomsPerNight(matrix)} (${data.totals.roomNights} room nights total)
    </p>

    <table style="border-collapse: collapse; margin-top: 16px; width: 100%;">
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th style="${thStyle} text-align: left;">Room Type</th>
          ${dateHeaderCells}
          <th style="${thStyle} text-align: right;">Room Total</th>
        </tr>
      </thead>
      <tbody>
        ${roomRowsHtml}
        <tr style="background-color: #f5f5f5; font-weight: 600;">
          <td style="${tdLeftStyle} font-weight: 600;">Daily Total</td>
          ${dailyTotalCells}
          <td style="${tdRightStyle} font-size: 15px;">${formatCurrency(data.totals.totalRevenue)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="background-color: #f9f9f9;">
          <td colspan="${totalColSpan}" style="padding: 12px 12px; font-weight: bold; border-top: 2px solid #e0e0e0;">Total (${data.totals.roomNights} room nights): ${formatCurrency(data.totals.totalRevenue)}</td>
        </tr>
        ${
          data.totals.discountPercent > 0
            ? `
        <tr style="background-color: #f9f9f9;">
          <td colspan="${totalColSpan - 1}" style="padding: 8px 12px; color: #16a34a;">Group Discount Applied</td>
          <td style="padding: 8px 12px; text-align: right; color: #16a34a; font-weight: 600; white-space: nowrap;">${data.totals.discountPercent.toFixed(1)}% off</td>
        </tr>`
            : ''
        }
        <tr style="background-color: #f9f9f9;">
          <td colspan="${totalColSpan - 1}" style="padding: 8px 12px; color: #666666;">Average Nightly Rate</td>
          <td style="padding: 8px 12px; text-align: right; color: #666666; white-space: nowrap;">${formatCurrency(data.totals.averageRate)}/night</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p style="margin-top: 24px; margin-bottom: 16px;">${closing}</p>

  <p style="margin-top: 24px; white-space: pre-line;">${signature}</p>
  </div>
</body>
</html>`;
}

export function renderEmailText(template: EmailTemplate, data: QuoteEmailData): string {
  const placeholderData = {
    guestName: data.guestName || 'Guest',
    hotelName: data.hotelName,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
  };

  const greeting = replacePlaceholders(template.greeting, placeholderData);
  const intro = replacePlaceholders(template.introduction, placeholderData);
  const closing = replacePlaceholders(template.closing, placeholderData);

  const rawSignature = replacePlaceholders(template.signature, placeholderData);
  const signature = rawSignature
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');

  const matrix = buildRoomTypeMatrix(data.allocation);

  const roomTypeWidth = Math.max(12, ...matrix.roomRows.map(r => `${r.count} ${r.name}`.length));
  const rateWidth = 10;
  const totalWidth = 12;

  const pad = (str: string, width: number, align: 'left' | 'right' = 'left') => {
    if (align === 'right') return str.padStart(width);
    return str.padEnd(width);
  };

  const headerParts = [
    pad('Room Type', roomTypeWidth),
    ...matrix.dateHeaders.map(h => pad(h, rateWidth, 'right')),
    pad('Room Total', totalWidth, 'right'),
  ];
  const headerLine = '  ' + headerParts.join('  ');
  const separatorLine = '  ' + '-'.repeat(headerLine.trim().length);

  const roomLines = matrix.roomRows.map(row => {
    const parts = [
      pad(`${row.count} ${row.name}`, roomTypeWidth),
      ...row.ratesByDate.map(rate => pad(rate > 0 ? formatCurrency(rate) : '-', rateWidth, 'right')),
      pad(formatCurrency(row.rowTotal), totalWidth, 'right'),
    ];
    return '  ' + parts.join('  ');
  });

  const dailyTotalParts = [
    pad('Daily Total', roomTypeWidth),
    ...matrix.dailyTotals.map(t => pad(formatCurrency(t), rateWidth, 'right')),
    pad(formatCurrency(data.totals.totalRevenue), totalWidth, 'right'),
  ];
  const dailyTotalLine = '  ' + dailyTotalParts.join('  ');

  const discountLine =
    data.totals.discountPercent > 0 ? `\nGroup Discount: ${data.totals.discountPercent.toFixed(1)}% off` : '';

  return `${greeting}

${intro}

QUOTE SUMMARY
─────────────────────────────────────
Check-in: ${formatEmailDate(data.checkInDate)}
Check-out: ${formatEmailDate(data.checkOutDate)}
Duration: ${data.nights} night${data.nights !== 1 ? 's' : ''}
Rooms: ${formatRoomsPerNight(matrix)} (${data.totals.roomNights} room nights total)

Room Breakdown:
${headerLine}
${separatorLine}
${roomLines.join('\n')}
${separatorLine}
${dailyTotalLine}

─────────────────────────────────────
Total (${data.totals.roomNights} room nights): ${formatCurrency(data.totals.totalRevenue)}
Average Nightly Rate: ${formatCurrency(data.totals.averageRate)}/night${discountLine}

${closing}

${signature}`;
}

export function deriveEmailData(
  allocation: DailyAllocation[],
  totals: {
    totalRevenue: number;
    groupADR: number;
    discountPercent: number;
    totalRoomNights?: number;
  },
  hotelInfo: {
    hotelName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  },
  guestInfo: {
    guestName?: string;
    guestEmail?: string;
    checkInDate: string;
    checkOutDate: string;
  },
): QuoteEmailData {
  const checkIn = new Date(guestInfo.checkInDate);
  const checkOut = new Date(guestInfo.checkOutDate);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  const roomNights =
    totals.totalRoomNights ??
    allocation.reduce((sum, day) => sum + day.rooms.reduce((daySum, room) => daySum + room.count, 0), 0);

  return {
    guestName: guestInfo.guestName || 'Guest',
    guestEmail: guestInfo.guestEmail,
    hotelName: hotelInfo.hotelName,
    contactName: hotelInfo.contactName,
    contactEmail: hotelInfo.contactEmail,
    contactPhone: hotelInfo.contactPhone,
    checkInDate: guestInfo.checkInDate,
    checkOutDate: guestInfo.checkOutDate,
    nights,
    allocation,
    totals: {
      roomNights,
      totalRevenue: totals.totalRevenue,
      averageRate: totals.groupADR,
      discountPercent: totals.discountPercent,
    },
  };
}
