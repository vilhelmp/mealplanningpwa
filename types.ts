
export enum Language {
  SV = 'sv',
  EN = 'en'
}

export enum MealType {
  LUNCH = 'Lunch',
  DINNER = 'Dinner'
}

export const SHOPPING_CATEGORIES = [
  "Produce", 
  "Dairy", 
  "Meat", 
  "Bakery", 
  "Frozen", 
  "Pantry", 
  "Spices", 
  "Canned", 
  "Beverages", 
  "Household", 
  "Other"
];

export interface Ingredient {
  item_name: string;
  quantity: number;
  unit: string;
  category: string; // 'Produce', 'Dairy', 'Meat', 'Pantry'
}

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  sugar: number;
  fat: number;
  saturated_fat: number;
  unsaturated_fat: number;
  fiber: number;
  salt: number;
}

export interface TranslatedRecipeContent {
  title: string;
  description: string;
  instructions: string[];
  ingredients: Ingredient[];
  cuisine?: string;
}

export interface Recipe {
  id: number;
  title: string;
  description: string;
  instructions: string[];
  ingredients: Ingredient[];
  servings_default: number;
  images: string[];
  rating?: number;
  nutrition?: Nutrition;
  cuisine?: string;
  // Versioning
  version: number;
  history?: Recipe[]; // Snapshots of previous versions
  lang?: string; // Language code (e.g., 'en', 'sv', 'fr')
  translations?: Record<string, TranslatedRecipeContent>; // Cache for other languages
}

export interface MealPlanItem {
  id: number;
  date: string; // ISO Date string YYYY-MM-DD
  type: MealType;
  recipe_id: number;
  recipe_version?: number; // Links to specific version of the recipe
  is_leftover: boolean;
  is_cooked: boolean;
  rating?: number;
  rating_comment?: string;
  servings?: number;
}

export interface ShoppingItem extends Ingredient {
  id: number;
  checked: boolean;
  is_manually_added: boolean;
  lang?: string;
  translations?: Record<string, { item_name: string, unit: string }>; // Cache
}

export interface Store {
  id: number;
  name: string;
  category_order: string[];
}

export interface AppSettings {
  language: string; // Changed from enum to string to support any code
  default_adults: number;
  default_kids: number;
  week_start_day: number; // 0 = Sunday, 1 = Monday, 6 = Saturday
  pantry_staples: string[];
  custom_staples?: Record<string, string[]>; // Cache for staples per language
  stores: Store[];
  ai_provider: 'gemini' | 'openai';
  openai_api_key?: string;
  custom_languages?: Record<string, any>; // Stores generated UI translations
}

export type ViewState = 'plan' | 'shop' | 'recipes' | 'settings' | 'stats';