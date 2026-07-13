export type AuthSession = {
  authenticated: boolean;
  username?: string | null;
  display_name?: string | null;
  is_admin?: boolean;
  visible_tabs: string[];
  allowed_indications?: string[] | null;
  allowed_atc_classes?: string[] | null;
};

export type FilterState = {
  indication_name: string | null;
  atc_class_name: string | null;
  sponsor: string[];
  sponsor_agency_class: string[];
  brand_name: string[];
  drug_indication: string | null;
  study_type: string[];
  phase: string[];
  overall_status: string[];
  country: string[];
  endpoint_category: string[];
  outcome_type: string[];
  pro_instrument: string[];
  pro_domain: string[];
  ae_organ_system: string[];
  ae_term: string[];
  has_results: boolean | null;
  enrollment_min: number | null;
  enrollment_max: number | null;
  allowed_indications?: string[] | null;
  allowed_atc_classes?: string[] | null;
};

export type FilterOptions = {
  indications: string[];
  atc_classes: string[];
  sponsors: string[];
  agency_classes: string[];
  study_types: string[];
  phases: string[];
  statuses: string[];
  countries: string[];
  categories: string[];
  pro_instruments: string[];
  brands: string[];
  domains: string[];
  drug_indications: string[];
};

export type PageMeta = {
  key: string;
  label: string;
  title: string;
};

export type KeyValueRecord = Record<string, string | number | boolean | null>;
