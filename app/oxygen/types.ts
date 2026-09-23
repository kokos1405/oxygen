/**
 * Request and response shapes taken from Oxygen OpenAPI v1.25.0.
 * Source of truth: https://api.oxygen.gr/openapi.json
 *
 * Fields that the spec marks required are required here.
 * Conditional fields stay optional rather than guessed.
 */

export interface OxygenServiceInfo {
  title?: string;
  version?: string;
  environment?: string;
}

export interface OxygenList<T> {
  data: T[];
  links?: {
    first?: string | null;
    last?: string | null;
    prev?: string | null;
    next?: string | null;
  };
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
}

/** 1 private person, 2 company. OpenAPI `postContacts`. */
export type OxygenContactType = 1 | 2;

export interface OxygenContactWrite {
  code?: string | null;
  type: OxygenContactType;
  is_client: boolean;
  is_supplier: boolean;
  name?: string;
  surname?: string;
  company_name?: string;
  nickname?: string;
  profession?: string;
  vat_number?: string;
  tax_office?: string;
  telephone?: string | null;
  mobile?: string | null;
  email?: string | null;
  street?: string;
  number?: string;
  city?: string;
  zip_code?: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  group_id?: string | null;
}

/** PATCH body — every field optional. OpenAPI `patchContactsByContact`. */
export type OxygenContactPatch = Partial<OxygenContactWrite>;

export interface OxygenContact {
  id: string;
  code?: string | null;
  type?: number;
  is_client?: boolean;
  is_supplier?: boolean;
  name?: string | null;
  surname?: string | null;
  company_name?: string | null;
  email?: string | null;
  telephone?: string | null;
  mobile?: string | null;
  country?: string | null;
  vat_number?: string | null;
  group_id?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OxygenContactListQuery {
  id?: string;
  vat?: string;
  code?: string;
  email?: string;
  group?: string;
  updated_from?: string;
  updated_to?: string;
  page?: number;
  per_page?: number;
}

/** 1 product, 2 service, 3 merchandise. */
export type OxygenProductType = 1 | 2 | 3;

export interface OxygenProductWarehouseInput {
  id: string;
  quantity?: number;
  position?: string;
}

export interface OxygenProductWrite {
  name: string;
  code: string;
  type?: OxygenProductType;
  category_id?: string;
  barcode?: string;
  mpn_isbn?: string;
  part_number?: string;
  manufacturer_name?: string;
  supplier_id?: string;
  supplier_code?: string;
  group_id?: string | null;
  warehouses: OxygenProductWarehouseInput[];
  sale_net_amount: number;
  sale_tax_id: string;
  purchase_net_amount?: string;
  purchase_tax_id?: string;
  notes?: string;
  status: boolean;
  measurement_unit_id?: string | null;
  mydata_income_category?: string;
  mydata_income_type?: string;
  mydata_income_retail_category?: string;
  mydata_income_retail_type?: string;
}

/** PUT body. OpenAPI does not mark these required on update. */
export type OxygenProductUpdate = Partial<OxygenProductWrite>;

export interface OxygenProduct {
  id: string;
  name?: string;
  code?: string;
  type?: number;
  barcode?: string | null;
  quantity?: number;
  sale_net_amount?: number;
  status?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OxygenProductListQuery {
  id?: string;
  name?: string;
  code?: string;
  barcode?: string;
  category_id?: string;
  updated_from?: string;
  updated_to?: string;
  page?: number;
  per_page?: number;
}

export interface OxygenWarehouse {
  id: string;
  name?: string;
  status?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Remaining TaxItem fields: OpenAPI schema `TaxItem`. */
export interface OxygenTax {
  id: string;
}

/** OpenAPI schema `PaymentMethodItem`. */
export interface OxygenPaymentMethod {
  id: string;
  title_gr?: string | null;
  title_en?: string | null;
  mydata_code?: string | null;
  status?: boolean | null;
}

/**
 * Invoice document types the API accepts on POST /invoices.
 * `fd` (hotel tax) is POST /hotel-tax. `i` and `self_delivery` cannot be issued via the API.
 */
export type OxygenInvoiceDocumentType = "s" | "p" | "rs" | "rp" | "self_inv";

export type OxygenInvoiceLanguage = "gr" | "el" | "en" | "GR" | "EL" | "EN";

export interface OxygenInvoiceLine {
  code?: string;
  warehouse_id?: string;
  description?: string;
  quantity?: number;
  unit_net_value?: number;
  tax_id?: string;
  discount_type?: string;
  discount_value?: number;
  net_amount_pre_discount?: number;
  net_amount?: number;
  vat_amount?: number;
  measurement_unit_id?: string;
  /** AADE table 8.8. Do not invent a code — see OpenAPI. */
  mydata_classification_category?: string;
  /** AADE table 8.9. Do not invent a code — see OpenAPI. */
  mydata_classification_type?: string;
}

export interface OxygenInvoiceWrite {
  number?: number;
  numbering_sequence_id?: string;
  issue_date: string;
  document_type: OxygenInvoiceDocumentType;
  language: OxygenInvoiceLanguage;
  /**
   * myDATA document type, AADE table 8.1.
   * Allowed enum: OpenAPI `postInvoices` → `mydata_document_type`.
   */
  mydata_document_type: string;
  payment_method_id: string;
  description?: string;
  business_area_id?: string;
  contact_id: string;
  logo_id?: string;
  branch_id?: string | null;
  items: OxygenInvoiceLine[];
  notice_id?: string;
  is_paid?: boolean;
  comments?: string;
  infobox?: string;
}

export interface OxygenInvoice {
  id: string;
  number?: number | string;
  issue_date?: string;
  document_type?: string;
  contact_id?: string;
  net_amount?: number;
  vat_amount?: number;
  total_amount?: number;
  amount_pending?: number;
  is_paid?: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OxygenInvoicePaymentWrite {
  amount?: number;
  /** YYYY-MM-DD. Must not be in the future. */
  issue_date?: string;
  description?: string;
  comments?: string;
  payment_method_id?: string;
  numbering_sequence_id?: string;
}

export interface OxygenReceipt {
  id?: string;
  issue_date?: string;
}

export type OxygenPdfTemplate = "a4" | "a4_landscape" | "80mm";
