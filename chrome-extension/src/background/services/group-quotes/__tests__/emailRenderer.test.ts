import { describe, it, expect } from 'vitest';
import { renderEmailHtml, renderEmailText, deriveEmailData, DEFAULT_EMAIL_TEMPLATE } from '../index';
import type { DailyAllocation, EmailTemplate, QuoteEmailData } from '../types';

describe('emailRenderer', () => {
  const createMockAllocation = (): DailyAllocation[] => [
    {
      date: '2025-03-01',
      rooms: [
        { roomType: 'Standard', count: 5, rate: 100, originalRate: 100 },
        { roomType: 'Deluxe', count: 3, rate: 150, originalRate: 150 },
      ],
    },
    {
      date: '2025-03-02',
      rooms: [
        { roomType: 'Standard', count: 5, rate: 100, originalRate: 100 },
        { roomType: 'Deluxe', count: 3, rate: 150, originalRate: 150 },
      ],
    },
  ];

  const createMockEmailData = (overrides?: Partial<QuoteEmailData>): QuoteEmailData => ({
    guestName: 'John Doe',
    guestEmail: 'john@example.com',
    hotelName: 'Test Hotel',
    contactName: 'Jane Smith',
    contactEmail: 'jane@testhotel.com',
    contactPhone: '555-1234',
    checkInDate: '2025-03-01',
    checkOutDate: '2025-03-03',
    nights: 2,
    allocation: createMockAllocation(),
    totals: {
      roomNights: 16,
      totalRevenue: 2000,
      averageRate: 125,
      discountPercent: 0,
    },
    ...overrides,
  });

  describe('XSS Prevention - escapeHtml', () => {
    it('should escape script tags in guest name', () => {
      const maliciousName = '<script>alert("xss")</script>';
      const data = createMockEmailData({ guestName: maliciousName });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;/script&gt;');
    });

    it('should escape img onerror attack vectors', () => {
      const maliciousName = '"><img src=x onerror=alert(1)>';
      const data = createMockEmailData({ guestName: maliciousName });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
      expect(html).toContain('&quot;&gt;&lt;img');
    });

    it('should escape event handler injection', () => {
      const maliciousName = '" onclick="alert(1)" data-x="';
      const data = createMockEmailData({ guestName: maliciousName });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).toContain('&quot; onclick=&quot;alert(1)&quot;');
    });

    it('should escape nested quotes and angle brackets', () => {
      const maliciousInput = `'"><svg onload=alert(1)>`;
      const data = createMockEmailData({ guestName: maliciousInput });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).not.toContain('<svg');
      expect(html).toContain('&#039;');
      expect(html).toContain('&quot;');
      expect(html).toContain('&lt;svg');
    });

    it('should escape javascript: protocol in user input', () => {
      const maliciousName = 'javascript:alert(1)//';
      const data = createMockEmailData({ guestName: maliciousName });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).toContain('javascript:alert(1)//');
    });

    it('should escape HTML entities in hotel name', () => {
      const maliciousHotelName = '<iframe src="evil.com"></iframe>';
      const data = createMockEmailData({ hotelName: maliciousHotelName });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).not.toContain('<iframe');
      expect(html).not.toContain('</iframe>');
      expect(html).toContain('&lt;iframe');
    });

    it('should escape HTML entities in contact information', () => {
      const maliciousContact = '<a href="javascript:alert(1)">Click</a>';
      const data = createMockEmailData({
        contactName: maliciousContact,
        contactEmail: maliciousContact,
        contactPhone: maliciousContact,
      });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).not.toContain('<a href=');
      expect(html).toContain('&lt;a href=');
    });

    it('should handle ampersands correctly', () => {
      const nameWithAmpersand = 'Smith & Jones';
      const data = createMockEmailData({ guestName: nameWithAmpersand });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).toContain('Smith &amp; Jones');
    });

    it('should handle null/undefined values gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = createMockEmailData({ guestName: undefined as any });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).toContain('Guest');
    });
  });

  describe('renderEmailHtml', () => {
    it('should render complete HTML email with all sections', () => {
      const data = createMockEmailData();
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Dear John Doe,');
      expect(html).toContain('Test Hotel');
      expect(html).toContain('Quote Summary');
      expect(html).toContain('Check-in:');
      expect(html).toContain('Check-out:');
    });

    it('should include allocation table with room type rows and rates', () => {
      const data = createMockEmailData();
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).toContain('Room Type');
      expect(html).toContain('Room Total');
      expect(html).toContain('Standard');
      expect(html).toContain('Deluxe');
      expect(html).toContain('$100');
      expect(html).toContain('$150');
      expect(html).toContain('Daily Total');
    });

    it('should show discount when applied', () => {
      const data = createMockEmailData({
        totals: {
          roomNights: 16,
          totalRevenue: 1800,
          averageRate: 112.5,
          discountPercent: 10,
        },
      });
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).toContain('Group Discount Applied');
      expect(html).toContain('10.0% off');
    });

    it('should not show discount row when no discount applied', () => {
      const data = createMockEmailData();
      const html = renderEmailHtml(DEFAULT_EMAIL_TEMPLATE, data);

      expect(html).not.toContain('Group Discount Applied');
    });
  });

  describe('renderEmailText', () => {
    it('should render plain text email with matrix table', () => {
      const data = createMockEmailData();
      const text = renderEmailText(DEFAULT_EMAIL_TEMPLATE, data);

      expect(text).toContain('Dear John Doe,');
      expect(text).toContain('QUOTE SUMMARY');
      expect(text).toContain('Check-in:');
      expect(text).toContain('Room Breakdown:');
      expect(text).toContain('Room Type');
      expect(text).toContain('Room Total');
      expect(text).toContain('Standard');
      expect(text).toContain('Deluxe');
      expect(text).toContain('Daily Total');
    });

    it('should not contain HTML tags', () => {
      const data = createMockEmailData();
      const text = renderEmailText(DEFAULT_EMAIL_TEMPLATE, data);

      expect(text).not.toContain('<');
      expect(text).not.toContain('>');
      expect(text).not.toContain('style=');
    });

    it('should show discount in plain text when applied', () => {
      const data = createMockEmailData({
        totals: {
          roomNights: 16,
          totalRevenue: 1800,
          averageRate: 112.5,
          discountPercent: 15,
        },
      });
      const text = renderEmailText(DEFAULT_EMAIL_TEMPLATE, data);

      expect(text).toContain('Group Discount: 15.0% off');
    });
  });

  describe('deriveEmailData', () => {
    it('should derive email data from allocation and settings', () => {
      const allocation = createMockAllocation();
      const totals = {
        totalRevenue: 2000,
        groupADR: 125,
        discountPercent: 10,
      };
      const hotelInfo = {
        hotelName: 'Test Hotel',
        contactName: 'Jane',
        contactEmail: 'jane@test.com',
        contactPhone: '555-0000',
      };
      const guestInfo = {
        guestName: 'Bob',
        guestEmail: 'bob@example.com',
        checkInDate: '2025-03-01',
        checkOutDate: '2025-03-03',
      };

      const result = deriveEmailData(allocation, totals, hotelInfo, guestInfo);

      expect(result.guestName).toBe('Bob');
      expect(result.hotelName).toBe('Test Hotel');
      expect(result.nights).toBe(2);
      expect(result.totals.discountPercent).toBe(10);
    });

    it('should calculate room nights from allocation', () => {
      const allocation = createMockAllocation();
      const totals = {
        totalRevenue: 2000,
        groupADR: 125,
        discountPercent: 0,
      };
      const hotelInfo = {
        hotelName: 'Test Hotel',
        contactName: 'Jane',
        contactEmail: 'jane@test.com',
        contactPhone: '555-0000',
      };
      const guestInfo = {
        checkInDate: '2025-03-01',
        checkOutDate: '2025-03-03',
      };

      const result = deriveEmailData(allocation, totals, hotelInfo, guestInfo);

      expect(result.totals.roomNights).toBe(16);
    });

    it('should use provided totalRoomNights when available', () => {
      const allocation = createMockAllocation();
      const totals = {
        totalRevenue: 2000,
        groupADR: 125,
        discountPercent: 0,
        totalRoomNights: 20,
      };
      const hotelInfo = {
        hotelName: 'Test Hotel',
        contactName: 'Jane',
        contactEmail: 'jane@test.com',
        contactPhone: '555-0000',
      };
      const guestInfo = {
        checkInDate: '2025-03-01',
        checkOutDate: '2025-03-03',
      };

      const result = deriveEmailData(allocation, totals, hotelInfo, guestInfo);

      expect(result.totals.roomNights).toBe(20);
    });

    it('should default guest name to Guest when not provided', () => {
      const allocation = createMockAllocation();
      const totals = {
        totalRevenue: 2000,
        groupADR: 125,
        discountPercent: 0,
      };
      const hotelInfo = {
        hotelName: 'Test Hotel',
        contactName: 'Jane',
        contactEmail: 'jane@test.com',
        contactPhone: '555-0000',
      };
      const guestInfo = {
        checkInDate: '2025-03-01',
        checkOutDate: '2025-03-03',
      };

      const result = deriveEmailData(allocation, totals, hotelInfo, guestInfo);

      expect(result.guestName).toBe('Guest');
    });
  });

  describe('Template placeholder replacement', () => {
    it('should replace {{variableName}} syntax', () => {
      const template: EmailTemplate = {
        greeting: 'Hello {{guestName}}!',
        introduction: 'Welcome to {{hotelName}}.',
        closing: 'Regards,',
        signature: '{{contactName}}',
      };
      const data = createMockEmailData();
      const html = renderEmailHtml(template, data);

      expect(html).toContain('Hello John Doe!');
      expect(html).toContain('Welcome to Test Hotel.');
    });

    it('should replace [Variable Name] syntax', () => {
      const template: EmailTemplate = {
        greeting: 'Hello [Guest Name]!',
        introduction: 'Welcome to [Hotel Name].',
        closing: 'Contact us at [Contact Email]',
        signature: '[Contact Name]\n[Contact Phone]',
      };
      const data = createMockEmailData();
      const html = renderEmailHtml(template, data);

      expect(html).toContain('Hello John Doe!');
      expect(html).toContain('Welcome to Test Hotel.');
      expect(html).toContain('Contact us at jane@testhotel.com');
    });

    it('should remove empty lines from signature', () => {
      const template: EmailTemplate = {
        greeting: 'Hi {{guestName}},',
        introduction: 'Thanks for reaching out.',
        closing: 'Best,',
        signature: '{{contactName}}\n{{hotelName}}\n\n{{contactPhone}}',
      };
      const data = createMockEmailData({ contactPhone: '' });
      const html = renderEmailHtml(template, data);

      expect(html).toContain('Jane Smith');
      expect(html).toContain('Test Hotel');
    });
  });
});
