import {
  Mail,
  Phone,
  MapPin,
  Building2,
  FileText,
  DollarSign,
  Globe,
  User,
  Hash,
  Calendar,
  Landmark,
} from 'lucide-react';

export const CONTACT_FIELD_ICONS: Record<string, React.ElementType> = {
  // Contact fields
  email: Mail,
  phone: Phone,
  website: Globe,

  // Location fields
  address: MapPin,
  location: MapPin,
  city: MapPin,
  country: MapPin,
  postalCode: MapPin,

  // Details fields
  name: User,
  fullName: User,
  companyName: Building2,
  company: Building2,
  legalName: FileText,
  taxId: Hash,
  invoicePrefix: FileText,
  defaultCurrency: DollarSign,
  currency: DollarSign,

  // Statistics
  invoices: FileText,
  totalInvoices: FileText,
  customPrices: DollarSign,
  bankAccounts: Landmark,
  memberSince: Calendar,
};
