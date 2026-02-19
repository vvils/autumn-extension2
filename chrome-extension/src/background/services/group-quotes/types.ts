export interface RoomAllocation {
  roomType: string;
  roomTypeId?: string;
  count: number;
  rate: number;
  originalRate: number;
  lyADR?: number;
  lyOccupancy?: number;
  isLocked?: boolean;
  unsold?: number;
}

export interface DailyAllocation {
  date: string;
  rooms: RoomAllocation[];
}

export interface EmailTemplate {
  greeting: string;
  introduction: string;
  closing: string;
  signature: string;
}

export interface QuoteEmailData {
  guestName: string;
  guestEmail?: string;
  hotelName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  allocation: DailyAllocation[];
  totals: {
    roomNights: number;
    totalRevenue: number;
    averageRate: number;
    discountPercent: number;
    retailTotal?: number;
  };
}

export const DEFAULT_EMAIL_TEMPLATE: EmailTemplate = {
  greeting: 'Dear [Guest Name],',
  introduction:
    'Thank you for considering [Hotel Name] for your upcoming group stay. We are delighted to present you with a customized quote based on your requirements.',
  closing:
    "Please don't hesitate to reach out if you have any questions or would like to discuss alternative arrangements. We look forward to welcoming your group!",
  signature: 'Best regards,\n[Contact Name]\n[Hotel Name]',
};
