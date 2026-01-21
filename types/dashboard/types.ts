import { Currency, InvoiceStatus } from '@prisma/client';

// Currency tab info based on bank accounts
export interface CurrencyTab {
  currency: Currency;
  label: string;
}

// Date range filter
export interface DashboardDateRange {
  from: Date | null;
  to: Date | null;
}

// Summary stats card data
export interface DashboardSummaryStats {
  totalReceived: number;
  receivedCount: number;
  totalPlanned: number;
  plannedCount: number;
  totalOverdue: number;
  overdueCount: number;
  allFuturePayments: number; // All future payments (pending + overdue) regardless of filters
  allFuturePaymentsCount: number;
}

// Chart data point for financial performance
export interface ChartDataPoint {
  date: string;
  paid: number; // Actual paid invoices (historical + flat projection)
  expected: number; // Expected total (paid in past + planned in future)
}

// Debtor information (independent of currency/date)
export interface DebtorInfo {
  customerName: string;
  customerId: string;
  total: number;
  count: number;
  currencies: string[]; // Multiple currencies possible
}

// Expected payment (pending invoice) - independent of currency/date
export interface ExpectedPaymentItem {
  id: string;
  invoiceNumber: string;
  customerName: string;
  total: number;
  currency: Currency;
  dueDate: Date;
}

export interface ExpectedPaymentGroup {
  currency: Currency;
  invoices: ExpectedPaymentItem[];
  total: number;
  count: number;
}

// Sender account metrics
export interface AccountMetrics {
  accountId: string;
  accountName: string;
  bankName: string;
  received: number;
  planned: number;
}

export interface SenderAccountMetrics {
  senderProfileId: string;
  senderName: string;
  totalReceived: number;
  totalPlanned: number;
  accounts: AccountMetrics[];
  allFuturePlanned: number; // All future planned regardless of date filter
}

// Recent invoice for table
export interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  total: number;
  currency: Currency;
}
