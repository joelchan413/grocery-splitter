import { LineItem } from '@/types';

export interface ParsedReceiptData {
  storeName: string;
  date: string;
  items: LineItem[];
  taxTotal: number;
  basketDiscount: number;
  receiptTotal: number;
}
