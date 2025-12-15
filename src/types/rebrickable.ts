export interface LegoSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string;
  set_url: string;
  last_modified_dt: string;
}

export interface Part {
  part_num: string;
  name: string;
  part_cat_id: number;
  part_url: string;
  part_img_url: string;
  external_ids: Record<string, string[]>;
  print_of: string | null;
}

export interface Color {
  id: number;
  name: string;
  rgb: string;
  is_trans: boolean;
}

export interface InventoryPart {
  id: number;
  inv_part_id: number;
  part: Part;
  color: Color;
  set_num: string;
  quantity: number;
  is_spare: boolean;
  element_id: string;
  num_sets: number;
}

export interface Moc {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  moc_img_url: string;
  moc_url: string;
  designer_name: string;
  designer_url: string;
  // New fields for filtering
  num_likes: number;
  num_comments: number;
  is_alternative: boolean;
  is_premium: boolean; // Check Rebrickable API docs: /lego/mocs/ returns this? Yes usually.
}

export interface BuildCheckResult {
    match_pct: number;
    missing_parts: InventoryPart[];
}
